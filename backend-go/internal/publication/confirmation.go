// Native reviewed publication. SQL transactions retain atomicity/provenance.
package publication

import (
	"context"
	"continua/backend/internal/engine"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

type Calculator interface {
	Calculate(context.Context, engine.Request) (json.RawMessage, error)
}
type Service struct {
	DB              *sql.DB
	Worker          Calculator
	DocumentWorker  Calculator
	RefreshResearch func(context.Context, string, string) error
	DurableRefresh  bool
}
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

var ErrInvalidConfirmation = &Error{400, "Invalid reviewed financial columns"}

type Period struct {
	PeriodType    string `json:"periodType"`
	FiscalYear    int    `json:"fiscalYear"`
	FiscalQuarter *int   `json:"fiscalQuarter"`
	PeriodEnd     string `json:"periodEnd"`
	ReportedAt    string `json:"reportedAt"`
	Currency      string `json:"currency"`
}
type Column struct {
	ColumnIndex      int                `json:"columnIndex"`
	Period           Period             `json:"period"`
	Income           map[string]float64 `json:"income"`
	Balance          map[string]float64 `json:"balance"`
	Cashflow         map[string]float64 `json:"cashflow"`
	SourcePage       int                `json:"sourcePage"`
	Note             string             `json:"note"`
	AllowRestatement bool               `json:"allowRestatement"`
}
type Confirmation struct {
	SecurityID    *string  `json:"securityId"`
	StatementType string   `json:"statementType"`
	UnitsVerified bool     `json:"unitsVerified"`
	Periods       []Column `json:"periods"`
}
type Result struct {
	CandidateID string   `json:"candidateId"`
	PeriodIDs   []string `json:"periodIds"`
	SourceURL   string   `json:"sourceUrl"`
}

var statementTables = map[string]string{"income": "income_statements", "balance": "balance_sheets", "cashflow": "cash_flow_statements"}

type field struct{ JSON, SQL string }

var statementFields = map[string][]field{
	"income":   {{"revenue", "revenue"}, {"netIncome", "net_income"}, {"eps", "eps"}, {"costOfRevenue", "cost_of_revenue"}, {"grossProfit", "gross_profit"}, {"operatingExpenses", "operating_expenses"}, {"operatingIncome", "operating_income"}, {"dilutedEps", "diluted_eps"}, {"ebitda", "ebitda"}},
	"balance":  {{"totalAssets", "total_assets"}, {"totalLiabilities", "total_liabilities"}, {"totalEquity", "total_equity"}, {"cash", "cash"}, {"totalDebt", "total_debt"}, {"currentAssets", "current_assets"}, {"currentLiabilities", "current_liabilities"}, {"sharesOutstanding", "shares_outstanding"}},
	"cashflow": {{"operatingCashFlow", "operating_cash_flow"}, {"investingCashFlow", "investing_cash_flow"}, {"financingCashFlow", "financing_cash_flow"}, {"freeCashFlow", "free_cash_flow"}, {"capex", "capex"}},
}

func (s *Service) validate(ctx context.Context, raw json.RawMessage) (Confirmation, error) {
	var b Confirmation
	if !json.Valid(raw) || len(raw) > 1048576 || s.Worker == nil {
		return b, ErrInvalidConfirmation
	}
	validated, err := s.Worker.Calculate(ctx, engine.Request{Operation: "validate_historical_confirmation", Args: []any{raw}})
	if err != nil {
		return b, err
	}
	var response struct {
		Valid bool            `json:"valid"`
		Data  json.RawMessage `json:"data"`
	}
	if json.Unmarshal(validated, &response) != nil || !response.Valid || json.Unmarshal(response.Data, &b) != nil {
		return b, ErrInvalidConfirmation
	}
	if statementTables[b.StatementType] == "" || !b.UnitsVerified || len(b.Periods) == 0 {
		return b, ErrInvalidConfirmation
	}
	return b, nil
}

func (s *Service) Confirm(ctx context.Context, candidateID string, raw json.RawMessage) (*Result, error) {
	b, err := s.validate(ctx, raw)
	if err != nil {
		return nil, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	result, err := s.Publish(ctx, tx, candidateID, b)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}

// Publish accepts only an already schema-validated body. Automatic publication
// uses this same transaction-aware implementation within its savepoint.
func (s *Service) Publish(ctx context.Context, tx *sql.Tx, candidateID string, b Confirmation) (*Result, error) {
	table, ok := statementTables[b.StatementType]
	if !ok || !b.UnitsVerified || len(b.Periods) == 0 {
		return nil, ErrInvalidConfirmation
	}
	var status, sourceURL string
	var candidateSecurity sql.NullString
	var rawTable []byte
	err := tx.QueryRowContext(ctx, `SELECT status,security_id,document_url,detected_table FROM market.financial_statement_candidates WHERE id=$1 FOR UPDATE`, candidateID).Scan(&status, &candidateSecurity, &sourceURL, &rawTable)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &Error{404, "Filing candidate not found"}
	}
	if err != nil {
		return nil, err
	}
	if status == "rejected" {
		return nil, &Error{409, "This candidate was rejected"}
	}
	securityID := candidateSecurity.String
	if b.SecurityID != nil {
		securityID = *b.SecurityID
	}
	var symbol string
	err = tx.QueryRowContext(ctx, `SELECT symbol FROM market.securities WHERE id=$1 AND exchange='NSE' AND status<>'delisted'`, securityID).Scan(&symbol)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &Error{422, "Choose a covered NSE security"}
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "canonical-research:"+securityID); err != nil {
		return nil, err
	}
	var source struct {
		Rows []struct {
			Values []json.RawMessage `json:"values"`
		} `json:"rows"`
	}
	if json.Unmarshal(rawTable, &source) != nil {
		return nil, &Error{422, "Source table columns are unavailable"}
	}
	count := 0
	for _, row := range source.Rows {
		if len(row.Values) > count {
			count = len(row.Values)
		}
	}
	columns := append([]Column(nil), b.Periods...)
	quarter := func(p Period) int {
		if p.FiscalQuarter != nil {
			return *p.FiscalQuarter
		}
		return 0
	}
	sort.SliceStable(columns, func(i, j int) bool {
		if columns[i].Period.FiscalYear != columns[j].Period.FiscalYear {
			return columns[i].Period.FiscalYear < columns[j].Period.FiscalYear
		}
		return quarter(columns[i].Period) < quarter(columns[j].Period)
	})
	result := &Result{CandidateID: candidateID, SourceURL: sourceURL, PeriodIDs: []string{}}
	for _, entry := range columns {
		if entry.ColumnIndex < 0 || entry.ColumnIndex >= count {
			return nil, &Error{422, "Column is not present in the source table"}
		}
		p := entry.Period
		id := fmt.Sprintf("NSE:period:%s:%d", symbol, p.FiscalYear)
		if p.FiscalQuarter != nil {
			id += fmt.Sprintf("Q%d", *p.FiscalQuarter)
		}
		if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, id); err != nil {
			return nil, err
		}
		var oldType, oldEnd, oldCurrency, oldReported string
		var previous []byte
		err = tx.QueryRowContext(ctx, `SELECT p.period_type,p.period_end::text,p.currency,p.reported_at::text,row_to_json(s) FROM market.financial_periods p LEFT JOIN market.`+table+` s ON s.period_id=p.id WHERE p.id=$1 FOR UPDATE OF p`, id).Scan(&oldType, &oldEnd, &oldCurrency, &oldReported, &previous)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if err == nil {
			if oldType != p.PeriodType || oldEnd != p.PeriodEnd || oldCurrency != p.Currency {
				return nil, &Error{409, "Existing period dates or currency differ. Resolve them before publishing"}
			}
			if len(previous) > 0 && string(previous) != "null" && !entry.AllowRestatement {
				return nil, &Error{409, "This statement exists. Explicitly review it as a restatement to replace it"}
			}
			if oldReported > p.ReportedAt {
				return nil, &Error{409, "An older filing cannot replace a newer reported period"}
			}
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO market.financial_periods(id,security_id,period_type,fiscal_year,fiscal_quarter,period_end,reported_at,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET reported_at=EXCLUDED.reported_at`, id, securityID, p.PeriodType, p.FiscalYear, p.FiscalQuarter, p.PeriodEnd, p.ReportedAt, p.Currency)
		if err != nil {
			return nil, err
		}
		values := entry.Income
		if b.StatementType == "balance" {
			values = entry.Balance
		} else if b.StatementType == "cashflow" {
			values = entry.Cashflow
		}
		names, parameters, updates := []string{}, []string{}, []string{}
		args := []any{id}
		for _, f := range statementFields[b.StatementType] {
			value, exists := values[f.JSON]
			if !exists && !entry.AllowRestatement {
				continue
			}
			names = append(names, f.SQL)
			parameters = append(parameters, fmt.Sprintf("$%d", len(args)+1))
			updates = append(updates, f.SQL+"=EXCLUDED."+f.SQL)
			if exists {
				args = append(args, value)
			} else {
				args = append(args, nil)
			}
		}
		if len(names) == 0 {
			return nil, ErrInvalidConfirmation
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO market.`+table+`(period_id,`+strings.Join(names, ",")+`) VALUES($1,`+strings.Join(parameters, ",")+`) ON CONFLICT(period_id) DO UPDATE SET `+strings.Join(updates, ","), args...)
		if err != nil {
			return nil, err
		}
		reviewed, err := json.Marshal(values)
		if err != nil {
			return nil, err
		}
		if len(previous) == 0 {
			previous = []byte("null")
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO market.filing_history_reviews(candidate_id,period_id,column_index,statement_type,source_url,source_page,review_note,reviewed_values,previous_values) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`, candidateID, id, entry.ColumnIndex, b.StatementType, sourceURL, entry.SourcePage, entry.Note, string(reviewed), string(previous))
		if err != nil {
			return nil, err
		}
		result.PeriodIDs = append(result.PeriodIDs, id)
	}
	sourceColumns := []string{}
	for _, e := range b.Periods {
		sourceColumns = append(sourceColumns, fmt.Sprint(e.ColumnIndex))
	}
	_, err = tx.ExecContext(ctx, `UPDATE market.financial_statement_candidates SET status='confirmed',reviewed_at=now(),reviewed_note=$2,resulting_period_id=$3,updated_at=now() WHERE id=$1`, candidateID, "Historical columns reviewed: "+strings.Join(sourceColumns, ", "), result.PeriodIDs[len(result.PeriodIDs)-1])
	if err != nil {
		return nil, err
	}
	if s.DurableRefresh {
		if err = enqueueRefresh(ctx, tx, securityID, symbol); err != nil {
			return nil, err
		}
	}
	return result, nil
}
