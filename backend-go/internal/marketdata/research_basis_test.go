package marketdata

import (
	"encoding/json"
	"testing"
)

func TestRatioDigestMatchesDatabaseNullAndPSCompatibility(t *testing.T) {
	a := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-14T09:00:00Z","pe":10.1,"netMargin":0.3}`)
	b := json.RawMessage(`{"netMargin":0.30,"ps":3.03,"pe":10.10,"pb":null,"asOf":"2026-10-14T09:00:00.000Z","securityId":"NSE:KCB"}`)
	first, e := ratioDigest(a)
	if e != nil {
		t.Fatal(e)
	}
	second, e := ratioDigest(b)
	if e != nil || first != second {
		t.Fatal("JSONB/numeric transport changed evidence digest", e)
	}
}

func TestNativeResearchMarkerRejectsWrongIdentityAndUntrustedNumbers(t *testing.T) {
	ratios := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-14T09:00:00Z","pe":7.73}`)
	other := json.RawMessage(`{"securityId":"NSE:ABSA","asOf":"2026-10-14T09:00:00Z","inputs":{}}`)
	if _, e := WithNativeResearchBasis(ratios, other, "fixture", 90); e == nil {
		t.Fatal("mixed issuer evidence marked")
	}
	bad := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-14T09:00:00Z","pe":"13.96"}`)
	if _, e := ratioDigest(bad); e == nil {
		t.Fatal("numeric string accepted")
	}
}
