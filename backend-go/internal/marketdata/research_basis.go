package marketdata

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"time"
)

const nativeResearchMethod = "continua-reviewed-components-c-score-v2"

type nativeResearchBasis struct {
	Method        string  `json:"method"`
	FilingVersion string  `json:"filingVersion"`
	QuotePrice    float64 `json:"quotePrice"`
	RatioDigest   string  `json:"ratioDigest"`
}

func ratioDigest(raw json.RawMessage) (string, error) {
	values, id, at, err := scoreInput(raw)
	if err != nil {
		return "", err
	}
	stamp, err := time.Parse(time.RFC3339Nano, at)
	if err != nil {
		return "", err
	}
	numbers := map[string]*float64{}
	for _, field := range ratioFields {
		var number *float64
		if value := values[field.json]; value != nil && json.Unmarshal(value, &number) != nil {
			return "", errors.New("invalid ratio evidence")
		}
		if number != nil && (math.IsNaN(*number) || math.IsInf(*number, 0)) {
			return "", errors.New("invalid ratio evidence")
		}
		numbers[field.json] = number
	}
	// Match the retained reader's additive PS compatibility expression.
	if numbers["ps"] == nil && numbers["pe"] != nil && numbers["netMargin"] != nil {
		product := *numbers["pe"] * *numbers["netMargin"]
		if math.IsNaN(product) || math.IsInf(product, 0) {
			return "", errors.New("invalid derived PS")
		}
		numbers["ps"] = &product
	}
	canonical := map[string]string{"securityId": id, "asOf": stamp.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000Z")}
	for field, number := range numbers {
		if number == nil {
			canonical[field] = "unavailable"
		} else if *number == 0 {
			canonical[field] = "0"
		} else {
			// Ignore insignificant IEEE/NUMERIC transport noise, not material changes.
			canonical[field] = strconv.FormatFloat(*number, 'g', 15, 64)
		}
	}
	encoded, err := json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

// This server-only marker makes old compatibility-engine results and mixed
// ratio/score pairs ineligible to be presented as current native research.
func WithNativeResearchBasis(ratios, score json.RawMessage, version string, price float64) (json.RawMessage, error) {
	_, id, at, err := scoreInput(ratios)
	if err != nil {
		return nil, err
	}
	values, scoreID, scoreAt, err := scoreInput(score)
	if err != nil {
		return nil, err
	}
	if id != scoreID || at != scoreAt || version == "" || len(version) > 64 || price <= 0 || math.IsNaN(price) || math.IsInf(price, 0) {
		return nil, errors.New("inconsistent native research basis")
	}
	digest, err := ratioDigest(ratios)
	if err != nil {
		return nil, err
	}
	inputs := map[string]json.RawMessage{}
	if raw := values["inputs"]; raw != nil {
		if json.Unmarshal(raw, &inputs) != nil || inputs == nil {
			return nil, errors.New("invalid research evidence inputs")
		}
	}
	inputs["continuaNativeBasis"], err = json.Marshal(nativeResearchBasis{nativeResearchMethod, version, price, digest})
	if err != nil {
		return nil, err
	}
	values["inputs"], err = json.Marshal(inputs)
	if err != nil {
		return nil, err
	}
	return json.Marshal(values)
}
