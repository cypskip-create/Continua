package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestBoundedRowsRejectOversizedPagesWithoutPartialReceipts(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT fixture`).WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"id":"1"}`)).AddRow([]byte(`{"id":"2"}`)))
	rows, err := s.JSONRowsBounded(context.Background(), 15, "SELECT fixture")
	if !errors.Is(err, ErrReadBudget) || rows != nil {
		t.Fatal(rows, err)
	}
}

func TestNewsStreamUsesOneQueryAndClosesOnCallbackFailure(t *testing.T) {
	s, m := mockStore(t)
	rows := sqlmock.NewRows([]string{"result"})
	for i := 0; i < 129; i++ {
		rows.AddRow([]byte(`{"id":"fixture"}`))
	}
	m.ExpectQuery(`SELECT row_to_json.*matchingText.*LIMIT \$3 OFFSET \$4`).WithArgs(nil, nil, 800, 0).WillReturnRows(rows).RowsWillBeClosed()
	batches, total := 0, 0
	err := s.StreamNewsCandidates(context.Background(), nil, nil, 800, func(page []json.RawMessage) error {
		batches++
		total += len(page)
		if len(page) > 128 {
			t.Fatal("unbounded page")
		}
		return nil
	})
	if err != nil || batches != 2 || total != 129 {
		t.Fatal(batches, total, err)
	}
	expected := errors.New("consumer stopped")
	m.ExpectQuery(`SELECT row_to_json`).WithArgs(nil, nil, 10, 0).WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{}`))).RowsWillBeClosed()
	err = s.StreamNewsCandidates(context.Background(), nil, nil, 10, func([]json.RawMessage) error { return expected })
	if !errors.Is(err, expected) {
		t.Fatal(err)
	}
	if err := m.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
func TestNewsCandidatesKeepHistoricalAndRecentEvidenceAndTrustedSourceFilter(t *testing.T) {
	s, m := mockStore(t)
	id := "NSE:KCB"
	m.ExpectQuery(`SELECT row_to_json.*matchingText.*NOT LIKE '%hacker%'.*links.security_id=\$1.*LIMIT \$3 OFFSET \$4`).WithArgs(id, nil, 16, 0).WillReturnRows(sqlmock.NewRows([]string{"result"}))
	if _, err := s.NewsCandidates(context.Background(), &id, nil, 16, 0); err != nil {
		t.Fatal(err)
	}
}
