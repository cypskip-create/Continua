package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"
)

type newsProviderFixture struct {
	calls    int
	category *string
	raw      json.RawMessage
	err      error
}

func (f *newsProviderFixture) List(_ context.Context, _, category *string, _ int) ([]json.RawMessage, error) {
	f.calls++
	f.category = category
	return nil, f.err
}
func (f *newsProviderFixture) Article(context.Context, string) (json.RawMessage, error) {
	f.calls++
	return f.raw, f.err
}
func TestNewsQueriesValidateBeforeRequestingCollectionOrCalculations(t *testing.T) {
	s, _ := fixtureServer()
	provider := &newsProviderFixture{}
	s.News = provider
	refreshes := 0
	s.RequestNews = func() { refreshes++ }
	for _, query := range []string{"category=unknown", "category=top&category=markets", "limit=0", "limit=101", "limit=NaN", "limit=1&limit=2"} {
		w := httptest.NewRecorder()
		s.newsReads(context.Background(), w, httptest.NewRequest("GET", "/api/v1/news?"+query, nil), "NSE")
		if w.Code != 400 {
			t.Fatal(query, w.Code)
		}
	}
	if provider.calls != 0 || refreshes != 0 {
		t.Fatal(provider.calls, refreshes)
	}
	w := httptest.NewRecorder()
	s.newsReads(context.Background(), w, httptest.NewRequest("GET", "/api/v1/news?category=top", nil), "NSE")
	if w.Code != 200 || provider.category == nil || *provider.category != "top" || refreshes != 1 || w.Body.String() != "{\"data\":[]}\n" {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestNewsReaderMissingAndTransientFailuresAreHonest(t *testing.T) {
	s, _ := fixtureServer()
	provider := &newsProviderFixture{}
	s.News = provider
	for _, value := range []string{"0", "-1", "999999999999999999999", "a/b", "invalid"} {
		w := httptest.NewRecorder()
		s.newsReads(context.Background(), w, httptest.NewRequest("GET", "/api/v1/news/item/"+value, nil), "NSE")
		if w.Code != 404 {
			t.Fatal(value, w.Code)
		}
	}
	if provider.calls != 0 {
		t.Fatal("invalid item read")
	}
	w := httptest.NewRecorder()
	s.newsReads(context.Background(), w, httptest.NewRequest("GET", "/api/v1/news/item/7", nil), "NSE")
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
	provider.err = errors.New("private provider detail")
	w = httptest.NewRecorder()
	s.newsReads(context.Background(), w, httptest.NewRequest("GET", "/api/v1/news/item/7", nil), "NSE")
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
}
