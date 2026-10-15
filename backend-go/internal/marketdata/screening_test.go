package marketdata

import (
	"context"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestScreenerUsesWhitelistedSortAndParameterizedFilters(t *testing.T) {
	s, m := mockStore(t)
	f := Screen{Exchange: "NSE", Sector: "banking", SortBy: "pe", Direction: "asc", Limit: 50, Numbers: map[string]float64{"maxPe": 10}}
	m.ExpectQuery(`SELECT row_to_json.*LOWER\(c.id\)=LOWER\(\$2\).*r.pe <= \$3.*ORDER BY r.pe ASC NULLS LAST LIMIT \$4`).WithArgs("NSE", "banking", float64(10), 50).WillReturnRows(sqlmock.NewRows([]string{"row"}).AddRow([]byte(`{"symbol":"KCB","pe":null}`)))
	rows, err := s.Screen(context.Background(), f)
	if err != nil || len(rows) != 1 {
		t.Fatal(rows, err)
	}
	f.SortBy = "pe; DROP TABLE"
	if _, err := s.Screen(context.Background(), f); err == nil {
		t.Fatal("untrusted SQL sort")
	}
}
