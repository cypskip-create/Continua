package marketdata

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"
)

func actionDate(value string) (string, error) {
	if date, err := time.Parse("2006-01-02", value); err == nil {
		return date.Format("2006-01-02"), nil
	}
	if _, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return value[:10], nil
	}
	return "", errors.New("invalid source calendar date")
}

func (a CorporateAction) Validate(now time.Time) error {
	if a.ID == "" || len(a.ID) > 200 || !strings.HasPrefix(a.SecurityID, "NSE:") || !instrumentSymbol.MatchString(strings.TrimPrefix(a.SecurityID, "NSE:")) || !map[string]bool{"dividend": true, "split": true, "bonus_issue": true, "rights_issue": true, "buyback": true, "merger": true, "acquisition": true, "suspension": true, "trading_halt": true}[a.Type] || !map[string]bool{"announced": true, "confirmed": true, "completed": true, "cancelled": true}[a.Status] {
		return errors.New("invalid corporate action identity")
	}
	announced, err := actionDate(a.AnnouncedAt)
	if err != nil || announced > now.UTC().Format("2006-01-02") {
		return errors.New("corporate announcement date unavailable or future")
	}
	for _, value := range []*string{a.ExDate, a.RecordDate, a.PayDate, a.EffectiveDate} {
		if value != nil {
			if _, err := actionDate(*value); err != nil {
				return err
			}
		}
	}
	var details map[string]json.RawMessage
	if len(a.Details) > 65536 || json.Unmarshal(a.Details, &details) != nil || details == nil {
		return errors.New("invalid action evidence payload")
	}
	var kind string
	if json.Unmarshal(details["type"], &kind) != nil || kind != a.Type {
		return errors.New("action evidence type mismatch")
	}
	number := func(name string, positive bool) error {
		var n *float64
		if json.Unmarshal(details[name], &n) != nil || n == nil || math.IsNaN(*n) || math.IsInf(*n, 0) || *n < 0 || (positive && *n == 0) {
			return errors.New("literal action amount or ratio required")
		}
		return nil
	}
	switch a.Type {
	case "dividend":
		return number("amountPerShare", false)
	case "split", "bonus_issue":
		if err := number("ratioFrom", true); err != nil {
			return err
		}
		return number("ratioTo", true)
	case "rights_issue":
		return number("priceKes", false)
	case "buyback":
		for _, field := range []string{"sharesTargeted", "amount"} {
			if details[field] != nil && string(details[field]) != "null" {
				if err := number(field, false); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (e EarningsEvent) Validate(now time.Time) error {
	if e.ID == "" || len(e.ID) > 200 || !strings.HasPrefix(e.SecurityID, "NSE:") || !instrumentSymbol.MatchString(strings.TrimPrefix(e.SecurityID, "NSE:")) || e.FiscalYear < 1900 || e.FiscalYear > 2100 || (e.FiscalQuarter != nil && (*e.FiscalQuarter < 1 || *e.FiscalQuarter > 4)) {
		return errors.New("invalid earnings identity")
	}
	for _, value := range []*float64{e.EPSEstimate, e.EPSActual, e.RevenueEstimate, e.RevenueActual} {
		if value != nil && (math.IsNaN(*value) || math.IsInf(*value, 0)) {
			return errors.New("literal finite earnings value required")
		}
	}
	if e.ExpectedDate != nil {
		if _, err := actionDate(*e.ExpectedDate); err != nil {
			return err
		}
	}
	if e.ReportedDate != nil {
		date, err := actionDate(*e.ReportedDate)
		if err != nil || date > now.UTC().Format("2006-01-02") {
			return errors.New("earnings report date unavailable or future")
		}
	}
	if (e.EPSActual != nil || e.RevenueActual != nil) && e.ReportedDate == nil {
		return errors.New("reported earnings require an observed report date")
	}
	return nil
}

func (r OwnershipRecord) Validate(now time.Time) error {
	if !strings.HasPrefix(r.SecurityID, "NSE:") || !instrumentSymbol.MatchString(strings.TrimPrefix(r.SecurityID, "NSE:")) || strings.TrimSpace(r.HolderName) == "" || len(r.HolderName) > 1000 || !map[string]bool{"insider": true, "institution": true, "government": true, "public": true, "other": true}[r.HolderType] {
		return errors.New("invalid holder identity")
	}
	if math.IsNaN(r.SharesHeld) || math.IsInf(r.SharesHeld, 0) || r.SharesHeld < 0 || math.Trunc(r.SharesHeld) != r.SharesHeld || r.SharesHeld > 9007199254740991 || math.IsNaN(r.PercentHeld) || math.IsInf(r.PercentHeld, 0) || r.PercentHeld < 0 || r.PercentHeld > 100 {
		return errors.New("literal shares and ownership percentage required")
	}
	if at, err := time.Parse(time.RFC3339Nano, r.AsOf); err == nil {
		if at.After(now) {
			return errors.New("future holder observation")
		}
		return nil
	}
	date, err := actionDate(r.AsOf)
	if err != nil || date > now.UTC().Format("2006-01-02") {
		return errors.New("holder observation date required")
	}
	return nil
}
