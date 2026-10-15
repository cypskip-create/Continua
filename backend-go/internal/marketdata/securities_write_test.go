package marketdata

import (
	"context"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestSharedSectorNamesResolveCanonicalIDAtomically(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`INSERT INTO market.sectors.*ON CONFLICT\(name\).*RETURNING id,name`).WithArgs("nse-banking", "Banking").WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow("shared-banking", "Banking"))
	v, e := s.ResolveSector(context.Background(), SectorInput{ID: "nse-banking", Name: "Banking"})
	if e != nil || v.ID != "shared-banking" {
		t.Fatal(v, e)
	}
}
func TestSecurityIdentityAndCurrencyCannotBeChangedByConflictingFeed(t *testing.T) {
	s, m := mockStore(t)
	v := SecurityInput{ID: "NSE:KCB", Symbol: "KCB", CompanyID: "NSE:company:KCB", Exchange: "NSE", Currency: "KES", Status: "active"}
	bad := v
	bad.Currency = "USD"
	if s.UpsertSecurity(context.Background(), bad) == nil {
		t.Fatal("currency change accepted")
	}
	m.ExpectExec(`INSERT INTO market.securities.*securities.exchange=EXCLUDED.exchange.*securities.currency=EXCLUDED.currency.*IS DISTINCT FROM`).WillReturnResult(sqlmock.NewResult(0, 1))
	if e := s.UpsertSecurity(context.Background(), v); e != nil {
		t.Fatal(e)
	}
}
func TestCompanyUnknownFieldsStayNullAndUnchangedWritesAreSuppressed(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectExec(`INSERT INTO market.companies.*IS DISTINCT FROM`).WithArgs("NSE:company:KCB", "KCB Group", nil, nil, nil, nil, nil, nil, nil, nil).WillReturnResult(sqlmock.NewResult(0, 1))
	if e := s.UpsertCompany(context.Background(), CompanyInput{ID: "NSE:company:KCB", Name: "KCB Group"}); e != nil {
		t.Fatal(e)
	}
}
