package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
	"time"
)

func candleFixture() CandleInput {
	var c CandleInput
	_ = json.Unmarshal([]byte(`{"securityId":"NSE:KCB","interval":"1d","timestamp":"2026-10-13T12:00:00Z","open":30,"high":32,"low":29,"close":31,"volume":0,"sourceUrl":"https://issuer.example/history"}`), &c)
	return c
}
func TestCandleMissingVolumeProvenanceAndDuplicateFailBeforeSQL(t *testing.T) {
	s, _ := mockStore(t)
	now := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
	c := candleFixture()
	absent := c
	absent.Volume = nil
	if s.UpsertCandlesBatch(context.Background(), []CandleInput{absent}, now) == nil {
		t.Fatal("invented volume")
	}
	absent = c
	absent.SourceURL = nil
	if s.UpsertCandlesBatch(context.Background(), []CandleInput{absent}, now) == nil {
		t.Fatal("unprovenanced candle")
	}
	if s.UpsertCandlesBatch(context.Background(), []CandleInput{c, c}, now) == nil {
		t.Fatal("duplicate key")
	}
}
func TestCandleChunkFailureRollsBackEntireBatch(t *testing.T) {
	s, m := mockStore(t)
	base := candleFixture()
	rows := make([]CandleInput, 501)
	for i := range rows {
		rows[i] = base
		rows[i].Timestamp = time.Date(2026, 1, 1, 0, i, 0, 0, time.UTC).Format(time.RFC3339)
	}
	m.ExpectBegin()
	m.ExpectExec(`INSERT INTO market.candles.*IS DISTINCT FROM`).WillReturnResult(sqlmock.NewResult(0, 500))
	m.ExpectExec(`INSERT INTO market.candles`).WillReturnError(errors.New("fixture failure"))
	m.ExpectRollback()
	if s.UpsertCandlesBatch(context.Background(), rows, time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)) == nil {
		t.Fatal("partial batch accepted")
	}
}
func TestIndexBatchCommitsLiteralValues(t *testing.T) {
	s, m := mockStore(t)
	var v IndexInput
	_ = json.Unmarshal([]byte(`{"id":"NSE:index:NASI","code":"NASI","name":"All Share","exchange":"NSE","currency":"KES","source":"eod","timestamp":"2026-10-13T12:00:00Z","value":200,"previousClose":201,"change":-1,"changePercent":-0.5}`), &v)
	m.ExpectBegin()
	m.ExpectExec(`INSERT INTO market.indices.*IS DISTINCT FROM`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	if e := s.UpsertIndicesBatch(context.Background(), []IndexInput{v}, time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)); e != nil {
		t.Fatal(e)
	}
}

func TestIndexHistoryWithoutPermissionDoesNotPublish(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT enabled.*FOR SHARE`).WillReturnRows(sqlmock.NewRows([]string{"enabled", "permission"}).AddRow(false, "fixture"))
	m.ExpectRollback()
	if e := s.PublishNSEIndexHistory(context.Background(), []IndexInput{{Exchange: "NSE", Source: "eod"}}, time.Now()); e != nil {
		t.Fatal(e)
	}
}

func TestOfficialIndexReaderDoesNotUseFetchTimeOrUnknownCodes(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT e.tables.*src.enabled=true.*permissionReference`).WillReturnRows(sqlmock.NewRows([]string{"tables"}).AddRow([]byte(`[{"kind":"nse_index","code":"NASI","value":200,"change":-1,"asOf":"2026-10-13T12:00:00Z"},{"kind":"nse_index","code":"NSE20","value":300,"change":1,"asOf":"2026-10-15T12:00:00Z"},{"kind":"nse_index","code":"FAKE","value":10,"change":1,"asOf":"2026-10-13T12:00:00Z"}]`)))
	result, e := s.ReadPublishedNSEIndices(context.Background(), time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC))
	if e != nil || len(result) != 1 || result[0].Timestamp != "2026-10-13T12:00:00Z" || *result[0].PreviousClose != 201 {
		t.Fatal(result, e)
	}
}
