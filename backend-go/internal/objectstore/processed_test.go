package objectstore

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
)

func fixture(t *testing.T, payload string) ([]byte, Receipt) {
	t.Helper()
	value := `{"schemaVersion":1,"kind":"processed-research","extractionId":7,"processorVersion":"collected-research-v1","securityId":"NSE:KCB","destination":"financials","status":"publisher_observation","payload":` + payload + `}`
	var output bytes.Buffer
	writer := gzip.NewWriter(&output)
	if _, err := writer.Write([]byte(value)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	body := output.Bytes()
	digest := sha256.Sum256(body)
	hash := hex.EncodeToString(digest[:])
	return body, Receipt{ObjectURI: "r2://continua-financial-documents/processed/research/collected-research-v1/7/" + hash + ".json.gz", Hash: hash, Size: int64(len(body)), ExtractionID: 7, Version: "collected-research-v1", SecurityID: "NSE:KCB", Destination: "financials", Status: "publisher_observation"}
}

func TestPreparedObjectsPreserveMissingValuesAndRejectCorruption(t *testing.T) {
	body, receipt := fixture(t, `{"revenue":1234567.89123,"eps":null}`)
	payload, err := Decode(body, receipt)
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if json.Unmarshal(payload, &value) != nil || value["eps"] != nil || value["revenue"] != 1234567.89123 {
		t.Fatal(string(payload))
	}
	if _, err := Decode(make([]byte, len(body)), receipt); err == nil {
		t.Fatal("corruption accepted")
	}
	receipt.SecurityID = "NSE:COOP"
	if _, err := Decode(body, receipt); err == nil {
		t.Fatal("cross-issuer object accepted")
	}
}

func TestPreparedObjectLocationsAndDecodedSizesAreBounded(t *testing.T) {
	_, receipt := fixture(t, `{}`)
	for _, location := range []string{strings.Replace(receipt.ObjectURI, bucket, "other", 1), strings.Replace(receipt.ObjectURI, "/processed/", "/raw/", 1), receipt.ObjectURI + "?secret=ignored"} {
		invalid := receipt
		invalid.ObjectURI = location
		if _, err := ObjectKey(invalid); err == nil {
			t.Fatal("unsafe object accepted")
		}
	}
	body, large := fixture(t, `{"text":"`+strings.Repeat("x", maxBytes)+`"}`)
	if _, err := Decode(body, large); err == nil {
		t.Fatal("excessive decompression accepted")
	}
}

func TestObjectStorageConfigurationRemainsExplicit(t *testing.T) {
	reader, mode, err := FromEnvironment(func(string) string { return "" })
	if reader != nil || mode != "database" || err != nil {
		t.Fatal("default cutover changed")
	}
	if _, _, err := FromEnvironment(func(name string) string {
		if name == "PROCESSED_STORAGE_READS" {
			return "r2"
		}
		return ""
	}); err == nil {
		t.Fatal("missing private credentials accepted")
	}
}
