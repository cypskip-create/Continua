// Package jobs owns bounded, serial enrichment jobs. It is not a paid keepalive.
package jobs

import (
	"context"
	"errors"
	"github.com/robfig/cron/v3"
	"sync"
	"time"
)

type Job struct {
	Name     string
	Schedule string
	Timeout  time.Duration
	Cooldown time.Duration
	Initial  bool
	Run      func(context.Context) error
}
type state struct {
	job        Job
	schedule   cron.Schedule
	next, last time.Time
	pending    bool
}
type Runner struct {
	mu              sync.Mutex
	states          map[string]*state
	queue           chan *state
	Now             func() time.Time
	Report          func(string, error)
	Cleanup         func()
	running, closed bool
}

func New() *Runner {
	return &Runner{states: map[string]*state{}, queue: make(chan *state, 32), Now: time.Now}
}

// node-cron evaluates restricted day-of-month AND weekday, unlike traditional
// cron's OR. Filter the library's candidate instants to retain that behavior.
type andSchedule struct{ spec *cron.SpecSchedule }

func (s andSchedule) Next(at time.Time) time.Time {
	end := at.AddDate(5, 0, 0)
	for {
		at = s.spec.Next(at)
		if at.IsZero() || at.After(end) {
			return time.Time{}
		}
		local := at.In(s.spec.Location)
		if s.spec.Dom&(uint64(1)<<uint(local.Day())) != 0 && s.spec.Dow&(uint64(1)<<uint(local.Weekday())) != 0 {
			return at
		}
	}
}
func (r *Runner) Add(job Job) error {
	if job.Name == "" || job.Run == nil || job.Timeout <= 0 || job.Timeout > 30*time.Minute || job.Cooldown < 0 {
		return errors.New("invalid native job")
	}
	parser := cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	parsed, err := parser.Parse(job.Schedule)
	if err != nil {
		return errors.New("invalid native job schedule")
	}
	spec, ok := parsed.(*cron.SpecSchedule)
	if !ok {
		return errors.New("unsupported native job schedule")
	}
	// Render's existing scheduler uses UTC. Never inherit the laptop's timezone.
	if spec.Location == time.Local {
		spec.Location = time.UTC
	}
	schedule := andSchedule{spec}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.running || r.closed || len(r.states) >= 32 || r.states[job.Name] != nil {
		return errors.New("native job registration unavailable")
	}
	next := schedule.Next(r.Now())
	if next.IsZero() {
		return errors.New("native job has no upcoming occurrence")
	}
	r.states[job.Name] = &state{job: job, schedule: schedule, next: next}
	return nil
}

// Request coalesces scheduled and reader-triggered work; no goroutine per tap.
func (r *Runner) Request(name string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := r.states[name]
	if s == nil || r.closed || s.pending {
		return false
	}
	now := r.Now()
	if !s.last.IsZero() && now.Sub(s.last) < s.job.Cooldown {
		return false
	}
	select {
	case r.queue <- s:
		s.pending = true
		s.last = now
		return true
	default:
		return false
	}
}

// Reader-only work has no timer occurrence or boot trigger. It must not become
// a scheduled wake-up/keepalive merely to reuse queue admission.
func (r *Runner) AddManual(job Job) error {
	if job.Name == "" || job.Run == nil || job.Timeout <= 0 || job.Timeout > 30*time.Minute || job.Cooldown < 0 || job.Schedule != "" || job.Initial {
		return errors.New("invalid manual native job")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.running || r.closed || len(r.states) >= 32 || r.states[job.Name] != nil {
		return errors.New("native job registration unavailable")
	}
	r.states[job.Name] = &state{job: job}
	return nil
}
func (r *Runner) Tick(at time.Time) {
	r.mu.Lock()
	due := []string{}
	for name, s := range r.states {
		if s.schedule != nil && !s.next.After(at) {
			s.next = s.schedule.Next(at)
			due = append(due, name)
		}
	}
	r.mu.Unlock()
	for _, name := range due {
		r.Request(name)
	}
}
func (r *Runner) Run(ctx context.Context) error {
	r.mu.Lock()
	if r.running || r.closed {
		r.mu.Unlock()
		return errors.New("native job runner already started")
	}
	r.running = true
	cleanup := r.Cleanup
	if cleanup != nil {
		defer cleanup()
	}
	initial := []string{}
	for name, s := range r.states {
		if s.job.Initial {
			initial = append(initial, name)
		}
	}
	r.mu.Unlock()
	for _, name := range initial {
		r.Request(name)
	}
	ticks := time.NewTicker(time.Second)
	defer ticks.Stop()
	defer func() { r.mu.Lock(); r.closed = true; r.mu.Unlock() }()
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case at := <-ticks.C:
			r.Tick(at)
		case s := <-r.queue:
			r.execute(ctx, s)
		}
	}
}
func (r *Runner) execute(parent context.Context, s *state) {
	ctx, cancel := context.WithTimeout(parent, s.job.Timeout)
	defer cancel()
	defer func() { r.mu.Lock(); s.pending = false; r.mu.Unlock() }()
	var err error
	func() {
		defer func() {
			if recover() != nil {
				err = errors.New("native job panicked; retry scheduled")
			}
		}()
		err = s.job.Run(ctx)
	}()
	if r.Report != nil {
		r.Report(s.job.Name, err)
	}
}
