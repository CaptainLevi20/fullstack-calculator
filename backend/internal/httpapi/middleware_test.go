package httpapi

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequestLogRecordsMethodPathStatus(t *testing.T) {
	var buf bytes.Buffer
	h := NewHandler(slog.New(slog.NewJSONHandler(&buf, nil)))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/v1/calculate",
		strings.NewReader(`{"operation":"divide","operands":["1","0"]}`)))

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log line is not JSON: %q", buf.String())
	}
	if entry["msg"] != "request" || entry["method"] != "POST" || entry["path"] != "/api/v1/calculate" || entry["status"] != float64(422) {
		t.Errorf("log entry = %v", entry)
	}
	if _, ok := entry["duration"]; !ok {
		t.Error("log entry has no duration")
	}
}

func TestRecoveryTurnsPanicIntoJSON500(t *testing.T) {
	var buf bytes.Buffer
	h := withRecovery(slog.New(slog.NewJSONHandler(&buf, nil)), http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	assertJSON(t, rec.Body.String(), errBody("INTERNAL_ERROR", "Internal server error."))
	if !strings.Contains(buf.String(), "boom") {
		t.Errorf("panic value not logged: %q", buf.String())
	}
}
