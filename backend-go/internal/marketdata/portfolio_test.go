package marketdata

import (
	"context"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
)

func TestPortfolioPositionsOwnerScopedIncludesUnpriced(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`WITH holdings AS.*WHERE user_id=\$1.*LEFT JOIN instruments.*LEFT JOIN market.live_quotes`).WithArgs("verified-owner", "NSE").WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"symbol":"UNKNOWN","price":null,"currency":"unknown","asOf":null,"cost":100,"shares":1}`)))
	rows, err := s.PortfolioPositions(context.Background(), "verified-owner", "NSE")
	if err != nil || len(rows) != 1 || !strings.Contains(string(rows[0]), `"price":null`) {
		t.Fatal(rows, err)
	}
}

func TestPortfolioOutageNotEmptyCoverage(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`WITH holdings AS`).WithArgs("verified-owner", "NSE").WillReturnError(errors.New("database unavailable"))
	if _, err := s.PortfolioPositions(context.Background(), "verified-owner", "NSE"); err == nil {
		t.Fatal("outage hidden")
	}
}
