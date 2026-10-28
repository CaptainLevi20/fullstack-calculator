package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func serve(method, path, body string) *httptest.ResponseRecorder {
	h := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	return rec
}

func assertJSON(t *testing.T, got, want string) {
	t.Helper()
	var g, w any
	if err := json.Unmarshal([]byte(got), &g); err != nil {
		t.Fatalf("response is not JSON: %q", got)
	}
	_ = json.Unmarshal([]byte(want), &w)
	if !reflect.DeepEqual(g, w) {
		t.Errorf("body = %s, want %s", got, want)
	}
}

func errBody(code, message string) string {
	b, _ := json.Marshal(map[string]any{"error": map[string]string{"code": code, "message": message}})
	return string(b)
}

const calc = "/api/v1/calculate"

const invalidJSON = `Request body must be a JSON object with "operation" and "operands".`

func TestCalculateEndpoint(t *testing.T) {
	cases := []struct {
		name, method, path, body string
		status                   int
		want                     string
	}{
		{"rounded result", "POST", calc, `{"operation":"divide","operands":["10","3"]}`, 200, `{"result":"3.333333333333333333333333333333333","rounded":true}`},
		{"exact result", "POST", calc, `{"operation":"add","operands":["0.1","0.2"]}`, 200, `{"result":"0.3","rounded":false}`},
		{"malformed json", "POST", calc, `{"operation":`, 400, errBody("INVALID_JSON", invalidJSON)},
		{"empty body", "POST", calc, ``, 400, errBody("INVALID_JSON", invalidJSON)},
		{"numeric operand", "POST", calc, `{"operation":"add","operands":[1,2]}`, 400, errBody("INVALID_JSON", invalidJSON)},
		{"unknown field", "POST", calc, `{"operation":"add","operands":["1","2"],"x":1}`, 400, errBody("INVALID_JSON", invalidJSON)},
		{"trailing data", "POST", calc, `{"operation":"add","operands":["1","2"]} {}`, 400, errBody("INVALID_JSON", invalidJSON)},
		{"null operand", "POST", calc, `{"operation":"add","operands":[null,"2"]}`, 400, errBody("INVALID_NUMBER", "Operand 1 is not a valid number.")},
		{"unknown operation", "POST", calc, `{"operation":"mod","operands":["1","2"]}`, 400, errBody("UNKNOWN_OPERATION", "Operation must be one of: add, subtract, multiply, divide, power, sqrt, percent.")},
		{"missing operands", "POST", calc, `{"operation":"add"}`, 400, errBody("INVALID_OPERAND_COUNT", "add needs exactly 2 operands.")},
		{"division by zero", "POST", calc, `{"operation":"divide","operands":["1250.75","0"]}`, 422, errBody("DIVISION_BY_ZERO", "Cannot divide by zero.")},
		{"negative sqrt", "POST", calc, `{"operation":"sqrt","operands":["-4"]}`, 422, errBody("NEGATIVE_SQUARE_ROOT", "Cannot take the square root of a negative number.")},
		{"fractional exponent", "POST", calc, `{"operation":"power","operands":["2","0.5"]}`, 422, errBody("NON_INTEGER_EXPONENT", "The exponent must be a whole number.")},
		{"exponent too large", "POST", calc, `{"operation":"power","operands":["2","6001"]}`, 422, errBody("RESULT_OUT_OF_RANGE", "The exponent must be between -6000 and 6000.")},
		{"wrong method", "GET", calc, ``, 405, errBody("METHOD_NOT_ALLOWED", "Method not allowed.")},
		{"health", "GET", "/healthz", ``, 200, `{"status":"ok"}`},
		{"health wrong method", "POST", "/healthz", ``, 405, errBody("METHOD_NOT_ALLOWED", "Method not allowed.")},
		{"unknown path", "GET", "/nope", ``, 404, errBody("NOT_FOUND", "Not found.")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := serve(c.method, c.path, c.body)
			if rec.Code != c.status {
				t.Errorf("status = %d, want %d", rec.Code, c.status)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}
			assertJSON(t, rec.Body.String(), c.want)
		})
	}
}

func TestMethodNotAllowedSetsAllow(t *testing.T) {
	if got := serve("GET", calc, "").Header().Get("Allow"); got != "POST" {
		t.Errorf("Allow = %q, want POST", got)
	}
	if got := serve("DELETE", "/healthz", "").Header().Get("Allow"); got != "GET" {
		t.Errorf("Allow = %q, want GET", got)
	}
}

func TestBodySizeLimit(t *testing.T) {
	base := `{"operation":"add","operands":["1","2"]}`
	atLimit := base + strings.Repeat(" ", 1024-len(base))
	if rec := serve("POST", calc, atLimit); rec.Code != http.StatusOK {
		t.Errorf("1024-byte body: status = %d, want 200", rec.Code)
	}
	rec := serve("POST", calc, atLimit+" ")
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("1025-byte body: status = %d, want 413", rec.Code)
	}
	assertJSON(t, rec.Body.String(), errBody("PAYLOAD_TOO_LARGE", "Request body must not exceed 1 KB."))
}
