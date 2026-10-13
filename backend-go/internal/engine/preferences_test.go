package engine

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

type preferenceCalculator struct {
	fail  bool
	reset bool
}

func (c *preferenceCalculator) Calculate(_ context.Context, r Request) (json.RawMessage, error) {
	if c.fail {
		return nil, errors.New("fixture worker unavailable")
	}
	var settings map[string]any
	raw, _ := json.Marshal(r.Args[0])
	if json.Unmarshal(raw, &settings) != nil || settings == nil {
		return json.RawMessage(`{"valid":false}`), nil
	}
	if settings["unknown"] != nil {
		return json.RawMessage(`{"valid":false}`), nil
	}
	if settings["interests"] == nil {
		settings["interests"] = []any{}
	}
	if settings["goal"] == nil {
		settings["goal"] = "Balanced"
	}
	if r.Operation == "validate_preferences" {
		return json.Marshal(map[string]any{"valid": true, "settings": settings})
	}
	if r.Operation == "record_interest" {
		if r.Args[3].(bool) {
			c.reset = true
			settings["interests"] = []any{}
		}
		return json.Marshal(settings)
	}
	return nil, errors.New("unsupported fixture operation")
}

type preferencesArgument struct {
	wantSymbol string
	wantGoal   string
}

func (a preferencesArgument) Match(value driver.Value) bool {
	raw, ok := value.(string)
	if !ok {
		return false
	}
	var settings struct {
		Goal      string `json:"goal"`
		Interests []struct {
			Symbol string `json:"symbol"`
		} `json:"interests"`
	}
	if json.Unmarshal([]byte(raw), &settings) != nil || settings.Goal != a.wantGoal {
		return false
	}
	if a.wantSymbol == "" {
		return len(settings.Interests) == 0
	}
	return len(settings.Interests) == 1 && settings.Interests[0].Symbol == a.wantSymbol
}
func preferenceDB(t *testing.T) (*PreferenceRepository, sqlmock.Sqlmock) {
	db, m, e := sqlmock.New()
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		if e := m.ExpectationsWereMet(); e != nil {
			t.Error(e)
		}
		db.Close()
	})
	return &PreferenceRepository{DB: db, Worker: new(preferenceCalculator)}, m
}
func TestPreferencesMissingOrCorruptSettingsFallBackWithoutWrite(t *testing.T) {
	for _, stored := range []string{"missing", `{"unknown":true}`} {
		p, m := preferenceDB(t)
		q := m.ExpectQuery(`SELECT settings .*WHERE user_id=\$1`).WithArgs("owner")
		if stored == "missing" {
			q.WillReturnError(sql.ErrNoRows)
		} else {
			q.WillReturnRows(sqlmock.NewRows([]string{"settings"}).AddRow([]byte(stored)))
		}
		settings, e := p.Preferences(context.Background(), "owner")
		if e != nil || !(preferencesArgument{wantGoal: "Balanced"}).Match(string(settings)) {
			t.Fatal(string(settings), e)
		}
	}
}
func TestPreferenceSavePreservesServerInterestsAndUsesAccountLock(t *testing.T) {
	p, m := preferenceDB(t)
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs("engine-preferences:owner").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT settings .*WHERE user_id=\$1`).WithArgs("owner").WillReturnRows(sqlmock.NewRows([]string{"settings"}).AddRow([]byte(`{"goal":"Income","interests":[{"symbol":"KCB"}]}`)))
	m.ExpectExec(`INSERT INTO public.engine_preferences`).WithArgs("owner", preferencesArgument{wantGoal: "Growth", wantSymbol: "KCB"}).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	raw, e := p.SavePreferences(context.Background(), "owner", json.RawMessage(`{"goal":"Growth","interests":[{"symbol":"FORGED"}]}`))
	if e != nil || !(preferencesArgument{wantGoal: "Growth", wantSymbol: "KCB"}).Match(string(raw)) {
		t.Fatal(string(raw), e)
	}
}
func TestPreferenceResetIsOwnerScopedAndTransactional(t *testing.T) {
	p, m := preferenceDB(t)
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs("engine-preferences:owner").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT settings`).WithArgs("owner").WillReturnRows(sqlmock.NewRows([]string{"settings"}).AddRow([]byte(`{"goal":"Income","interests":[{"symbol":"KCB"}]}`)))
	m.ExpectExec(`INSERT INTO public.engine_preferences`).WithArgs("owner", preferencesArgument{wantGoal: "Income"}).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	if _, e := p.RecordInterest(context.Background(), "owner", "KCB", "NSE", true); e != nil {
		t.Fatal(e)
	}
	if !p.Worker.(*preferenceCalculator).reset {
		t.Fatal("reset not calculated")
	}
}
func TestPreferenceWorkerFailureRollsBackWithoutPartialWrite(t *testing.T) {
	p, m := preferenceDB(t)
	p.Worker = &preferenceCalculator{fail: true}
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT settings`).WillReturnError(sql.ErrNoRows)
	m.ExpectRollback()
	if _, e := p.RecordInterest(context.Background(), "owner", "KCB", "NSE", false); e == nil {
		t.Fatal("worker failure ignored")
	}
}
