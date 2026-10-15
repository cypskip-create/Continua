package diagnostics

import (
	"context"
	"database/sql"
	"io"
	"math"
	"os"
	"runtime"
	"runtime/metrics"
	"strconv"
	"strings"
	"time"
)

type Snapshot struct {
	Timestamp           string   `json:"timestamp"`
	UptimeSeconds       float64  `json:"uptimeSeconds"`
	Goroutines          int      `json:"goroutines"`
	HeapAllocatedBytes  uint64   `json:"heapAllocatedBytes"`
	HeapReservedBytes   uint64   `json:"heapReservedBytes"`
	SchedulerP99Seconds *float64 `json:"schedulerP99Seconds"`
	CgroupMemoryBytes   *uint64  `json:"cgroupMemoryBytes"`
	CgroupLimitBytes    *uint64  `json:"cgroupLimitBytes"`
	DatabaseConnections int      `json:"databaseConnections"`
	DatabaseIdle        int      `json:"databaseIdle"`
	DatabaseInUse       int      `json:"databaseInUse"`
	DatabaseWaitCount   int64    `json:"databaseWaitCount"`
	DatabaseWaitSeconds float64  `json:"databaseWaitSeconds"`
}

type Runtime struct {
	DB      *sql.DB
	Started time.Time
}

func New(db *sql.DB) *Runtime { return &Runtime{DB: db, Started: time.Now()} }

func boundedNumber(paths ...string) *uint64 {
	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		raw, err := io.ReadAll(io.LimitReader(file, 65))
		_ = file.Close()
		if err != nil || len(raw) > 64 {
			continue
		}
		value, err := strconv.ParseUint(strings.TrimSpace(string(raw)), 10, 64)
		if err == nil {
			return &value
		}
	}
	return nil
}

func (r *Runtime) Snapshot() Snapshot {
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	s := Snapshot{Timestamp: time.Now().UTC().Format(time.RFC3339Nano), UptimeSeconds: time.Since(r.Started).Seconds(), Goroutines: runtime.NumGoroutine(), HeapAllocatedBytes: memory.HeapAlloc, HeapReservedBytes: memory.HeapSys}
	s.CgroupMemoryBytes = boundedNumber("/sys/fs/cgroup/memory.current", "/sys/fs/cgroup/memory/memory.usage_in_bytes")
	s.CgroupLimitBytes = boundedNumber("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes")
	if s.CgroupLimitBytes != nil && (*s.CgroupLimitBytes == 0 || *s.CgroupLimitBytes > 1<<60) {
		s.CgroupLimitBytes = nil
	}
	if r.DB != nil {
		db := r.DB.Stats()
		s.DatabaseConnections = db.OpenConnections
		s.DatabaseIdle = db.Idle
		s.DatabaseInUse = db.InUse
		s.DatabaseWaitCount = db.WaitCount
		s.DatabaseWaitSeconds = db.WaitDuration.Seconds()
	}
	values := []metrics.Sample{{Name: "/sched/latencies:seconds"}}
	metrics.Read(values)
	if values[0].Value.Kind() == metrics.KindFloat64Histogram {
		histogram := values[0].Value.Float64Histogram()
		var count uint64
		for _, n := range histogram.Counts {
			count += n
		}
		if count > 0 {
			target := uint64(math.Ceil(float64(count) * .99))
			var sum uint64
			for i, n := range histogram.Counts {
				sum += n
				if sum >= target {
					upper := histogram.Buckets[i+1]
					if !math.IsInf(upper, 0) && !math.IsNaN(upper) {
						s.SchedulerP99Seconds = &upper
					}
					break
				}
			}
		}
	}
	return s
}

// Local runtime counters only: no database ping, provider call or keepalive.
func (r *Runtime) Run(ctx context.Context, report func(Snapshot, bool)) {
	if report == nil {
		return
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	var previousWaits int64
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s := r.Snapshot()
			pressure := s.DatabaseWaitCount > previousWaits
			previousWaits = s.DatabaseWaitCount
			if s.CgroupMemoryBytes != nil && s.CgroupLimitBytes != nil && float64(*s.CgroupMemoryBytes)/float64(*s.CgroupLimitBytes) > .85 {
				pressure = true
			}
			report(s, pressure)
		}
	}
}
