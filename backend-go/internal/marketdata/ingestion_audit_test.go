package marketdata

import (
	"context"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
	"time"
)

func TestAuditRejectsSecretLikeErrorsInvalidPayloadsAndFalseSuccess(t *testing.T) {
	s, _ := mockStore(t)
	now := time.Now()
	r := IngestionRun{Exchange: "NSE", Dataset: "price", Status: "success", ErrorCount: 1, StartedAt: now, FinishedAt: now}
	if s.RecordIngestionRun(context.Background(), r) == nil {
		t.Fatal("errors called success")
	}
	r.Status = "failed"
	r.Errors = []string{"https://provider.invalid/?secret=private"}
	if s.RecordIngestionRun(context.Background(), r) == nil {
		t.Fatal("unfiltered provider message stored")
	}
	r.Errors = []string{"sk_live_fixture_not_a_real_key"}
	if s.RecordIngestionRun(context.Background(), r) == nil {
		t.Fatal("arbitrary secret-like code accepted")
	}
	for _, payload := range []string{"invalid", `"` + strings.Repeat("x", 1048577) + `"`} {
		if s.RecordDeadLetter(context.Background(), DeadLetter{Exchange: "NSE", Dataset: "price", Payload: json.RawMessage(payload), ErrorCode: "validation-failed"}) == nil {
			t.Fatal("invalid audit payload accepted")
		}
	}
	if _, err := s.RecentDeadLetters(context.Background(), 101); err == nil {
		t.Fatal("unbounded audit read accepted")
	}
}

func TestDeadLetterBatchRetainsEarlierReceiptsAndDefaultReadBounds(t *testing.T) {
	s, m := mockStore(t)
	good := DeadLetter{Exchange: "NSE", Dataset: "price", Payload: json.RawMessage(`{"symbol":"KCB"}`), ErrorCode: "validation-failed"}
	bad := good
	bad.Payload = json.RawMessage(`invalid`)
	m.ExpectExec(`INSERT INTO market.dead_letters`).WillReturnResult(sqlmock.NewResult(0, 1))
	if s.RecordDeadLetters(context.Background(), []DeadLetter{good, bad}) == nil {
		t.Fatal("invalid later receipt was silently accepted")
	}
	m.ExpectQuery(`SELECT row_to_json.*market.ingestion_logs.*LIMIT \$1`).WithArgs(50).WillReturnRows(sqlmock.NewRows([]string{"row"}))
	if _, err := s.RecentIngestionRuns(context.Background(), 0); err != nil {
		t.Fatal(err)
	}
	m.ExpectQuery(`SELECT row_to_json.*market.dead_letters.*LIMIT \$1`).WithArgs(100).WillReturnRows(sqlmock.NewRows([]string{"row"}))
	if _, err := s.RecentDeadLetters(context.Background(), 0); err != nil {
		t.Fatal(err)
	}
}
func TestAuditPersistenceUsesBoundParametersAndCodes(t *testing.T) {
	s, m := mockStore(t)
	now := time.Now().UTC()
	m.ExpectExec(`INSERT INTO market.ingestion_logs`).WithArgs("NSE", "price", "partial", 2, 1, now, now, `["validation-failed"]`).WillReturnResult(sqlmock.NewResult(0, 1))
	if err := s.RecordIngestionRun(context.Background(), IngestionRun{Exchange: "NSE", Dataset: "price", Status: "partial", RecordCount: 2, ErrorCount: 1, StartedAt: now, FinishedAt: now, Errors: []string{"validation-failed"}}); err != nil {
		t.Fatal(err)
	}
	m.ExpectExec(`INSERT INTO market.dead_letters`).WithArgs("NSE", "price", nil, `{"symbol":"KCB"}`, "validation-failed").WillReturnResult(sqlmock.NewResult(0, 1))
	if err := s.RecordDeadLetter(context.Background(), DeadLetter{Exchange: "NSE", Dataset: "price", Payload: json.RawMessage(`{"symbol":"KCB"}`), ErrorCode: "validation-failed"}); err != nil {
		t.Fatal(err)
	}
}
