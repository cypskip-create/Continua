package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

type announcementFixture struct {
	reads, writes, failures int
	emptyDirectory          bool
	logged                  bool
	last                    marketdata.Announcement
}

func (f *announcementFixture) PendingAnnouncementExtractions(context.Context, int) ([]int64, error) {
	return []int64{1, 2}, nil
}
func (f *announcementFixture) AnnouncementExtraction(_ context.Context, id int64) (json.RawMessage, error) {
	f.reads++
	raw, _ := json.Marshal(map[string]any{"extractionId": id})
	return raw, nil
}
func (f *announcementFixture) CompanyDirectory(context.Context, string) ([]json.RawMessage, error) {
	if f.emptyDirectory {
		return nil, nil
	}
	return []json.RawMessage{json.RawMessage(`{"name":"KCB Group","securityId":"NSE:KCB","companyId":"c1"}`)}, nil
}
func (f *announcementFixture) UpsertAnnouncement(_ context.Context, a marketdata.Announcement) error {
	f.writes++
	f.last = a
	return nil
}
func (f *announcementFixture) RecordAnnouncementFailure(context.Context, int64) error {
	f.failures++
	return nil
}
func (f *announcementFixture) RecordAnnouncementRun(context.Context, time.Time, int, int) error {
	f.logged = true
	return nil
}

type announcementCalculator struct {
	fail          bool
	wrongIdentity bool
}

func (c announcementCalculator) Calculate(_ context.Context, r engine.Request) (json.RawMessage, error) {
	if c.fail {
		return nil, errors.New("fixture failure")
	}
	if r.Operation != "announcement_ingestion_input" {
		return nil, errors.New("wrong operation")
	}
	var row struct {
		ID int64 `json:"extractionId"`
	}
	_ = json.Unmarshal(r.Args[0].(json.RawMessage), &row)
	if c.wrongIdentity {
		row.ID = 999
	}
	return json.Marshal(map[string]any{"scrapedExtractionId": row.ID, "exchange": "NSE", "publishedAt": nil, "needsReview": true})
}
func TestAnnouncementsAreSerialAndPreserveUnresolvedEvidence(t *testing.T) {
	f := &announcementFixture{}
	s, err := (&AnnouncementBridge{Store: f, Worker: announcementCalculator{}}).Run(context.Background(), "NSE", 100)
	if err != nil || s.Processed != 2 || s.Unresolved != 2 || f.reads != 2 || f.writes != 2 || !f.logged || f.last.PublishedAt != nil {
		t.Fatal(s, err, f)
	}
}
func TestAnnouncementsCannotPublishWrongIdentityOrIgnoreWorkerFailure(t *testing.T) {
	for _, c := range []announcementCalculator{{fail: true}, {wrongIdentity: true}} {
		f := &announcementFixture{}
		s, err := (&AnnouncementBridge{Store: f, Worker: c}).Run(context.Background(), "NSE", 100)
		if err != nil || s.Failed != 2 || f.writes != 0 || f.failures != 2 || !f.logged {
			t.Fatal(s, err, f)
		}
	}
	f := &announcementFixture{emptyDirectory: true}
	_, err := (&AnnouncementBridge{Store: f, Worker: announcementCalculator{}}).Run(context.Background(), "NSE", 100)
	if err == nil || f.reads != 0 {
		t.Fatal(err, f)
	}
}
