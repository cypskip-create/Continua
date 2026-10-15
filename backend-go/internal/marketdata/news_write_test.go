package marketdata

import (
	"context"
	"database/sql"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func newsInputFixture() NewsInput {
	return NewsInput{Headline: "KCB Group reports annual profit", Excerpt: "Literal source evidence", ArticleURL: "https://fixture.example/article", Source: "fixture", SourceName: "Fixture", Category: "earnings", SecurityIDs: []string{"NSE:KCB"}, ArtifactID: 1, ExtractionID: 2}
}
func newsWritePrefix(m sqlmock.Sqlmock) {
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs("https://fixture.example/article").WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs(int64(2)).WillReturnResult(sqlmock.NewResult(0, 0))
}
func TestNewsUpsertAndIssuerReplacementCommitTogether(t *testing.T) {
	s, m := mockStore(t)
	newsWritePrefix(m)
	m.ExpectQuery(`SELECT id FROM market.news_items`).WillReturnError(sql.ErrNoRows)
	m.ExpectQuery(`INSERT INTO market.news_items`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
	m.ExpectExec(`DELETE FROM market.news_item_securities`).WithArgs(int64(7)).WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectExec(`INSERT INTO market.news_item_securities`).WithArgs(int64(7), "NSE:KCB").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	if err := s.UpsertNews(context.Background(), newsInputFixture()); err != nil {
		t.Fatal(err)
	}
}
func TestNewsAssociationFailureRollsBackReceiptUpdate(t *testing.T) {
	s, m := mockStore(t)
	newsWritePrefix(m)
	m.ExpectQuery(`SELECT id FROM market.news_items`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
	m.ExpectExec(`UPDATE market.news_items SET`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`DELETE FROM market.news_item_securities`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`INSERT INTO market.news_item_securities`).WillReturnError(errors.New("fixture missing issuer"))
	m.ExpectRollback()
	if s.UpsertNews(context.Background(), newsInputFixture()) == nil {
		t.Fatal("partial news receipt committed")
	}
}
func TestChangedArticleIsNotOverwrittenByStaleRevalidation(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT id FROM market.news_items.*IS NOT DISTINCT FROM`).WillReturnError(sql.ErrNoRows)
	m.ExpectRollback()
	changed, err := s.RepairNewsLinks(context.Background(), "7", nil, "prior headline", []string{"NSE:KCB"})
	if err != nil || changed {
		t.Fatal(changed, err)
	}
}
func TestNewsRejectsNonLiteralURLsBeforeDatabaseWrites(t *testing.T) {
	s, _ := mockStore(t)
	for _, value := range []string{"file:///private", "https://user:secret@fixture.example/a", "", "javascript:alert(1)"} {
		input := newsInputFixture()
		input.ArticleURL = value
		if s.UpsertNews(context.Background(), input) == nil {
			t.Fatal(value)
		}
	}
}
