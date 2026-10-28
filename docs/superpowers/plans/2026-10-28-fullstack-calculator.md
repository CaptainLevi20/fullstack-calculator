# Full-Stack Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fintech-grade calculator: a Go REST API doing decimal128 arithmetic, and a React + TypeScript keypad UI that consumes it. Ship both with Docker, CI, coverage reports and an English README.

**Architecture:**
- The Go backend has three layers:
  - `internal/calculator` is a pure domain. It takes strings in and returns strings out, using `cockroachdb/apd` with decimal128 semantics.
  - `internal/httpapi` handles JSON, status mapping and middleware.
  - `cmd/server` handles wiring, graceful shutdown and a healthcheck mode.
- The React frontend:
  - drives everything from a pure keypad reducer;
  - a hook sends the reducer's pending requests to a small typed `fetch` client;
  - components render state;
  - numbers stay strings end to end.
- Docker Compose runs the backend (distroless, non-root) behind nginx, which serves the SPA and proxies `/api`.

**Tech Stack:**
- Go 1.27, stdlib `net/http`, `log/slog`, `github.com/cockroachdb/apd/v3`.
- React + TypeScript (Vite), Vitest, React Testing Library, `@fontsource` IBM Plex.
- Docker multi-stage, nginx (unprivileged), GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-10-28-fullstack-calculator-design.md`](../specs/2026-10-28-fullstack-calculator-design.md). Read it before starting. Section numbers below (§) refer to it.

## Global Constraints

**Toolchain and dependencies**
- Go **1.27**. Module path `fullstack-calculator/backend`. The only third-party Go dependency is `github.com/cockroachdb/apd/v3`, and tests use only the stdlib.
- Node **24**. Frontend runtime deps are `react`, `react-dom`, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`. No UI kit, no state library, no HTTP library.

**Numbers**
- Numbers are strings end to end. Never use `float64` in the backend calculation path. Never call `Number()`, `parseFloat` or `+x` on an operand or result in the frontend.
- The arithmetic context is `Precision: 34`, `Rounding: apd.RoundHalfEven`, `MaxExponent: 6144`, `MinExponent: -6143`, `Traps: 0`. The code inspects conditions itself.
- Limits:
  - request body ≤ **1024 bytes** (413);
  - operand ≤ **34** coefficient digits, leading zeros excluded (400);
  - power exponent magnitude ≤ **6000** (422 `RESULT_OUT_OF_RANGE`), checked before computing.

**API**
- Success body: `{"result": string, "rounded": bool}`.
- Error body: `{"error": {"code": string, "message": string}}`.
- Every response is `Content-Type: application/json`.
- All user-facing copy, API messages, code, comments and commit messages are in **English**.

**Runtime**
- Ports: backend `8081` (env `PORT`), web `8080` (Docker), Vite dev `5173`.
- Coverage: backend total **≥ 90 %**, frontend **≥ 85 %** for lines, branches, functions and statements, enforced in CI.

**Workflow**
- Commits are small conventional commits (`feat:`, `test:`, `chore:`, `docs:`, `ci:`). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never push. Never commit `.superpowers/`.
- **Prompts log:** append every new user prompt to `docs/prompts.md` under "Session 2 — Implementation" as it arrives: verbatim, then an English translation, then a one-line context. **Never commit `docs/prompts.md` until the user has reviewed it** (Task 15).
- Commands below are written for Git Bash. `go`, `npm` and `docker` behave the same in PowerShell.

## Review Focus

1. **Enter pressed while a keypad button has keyboard focus** should evaluate once. It must not also re-press the focused key. Owned by Task 12: App test "Enter on a focused key evaluates once".
2. **Chaining from a result in scientific notation** (`1.5E+40 × 2 =`) should send `"1.5E+40"` verbatim, and the backend should accept it. Owned by Task 8 (reducer test) and Task 3 (round-trip test).
3. **A backend that never answers** should unlock the calculator after 10 s with "Can't reach the server. Try again." Owned by Task 9: client timeout test. The reducer's `failed` path is covered in Task 8.
4. **Operands ending in `.` or equal to `-0`** (`5. + 1`, `-0 × 5`) should be sent normalised (`"5"`), and a negative-zero result should render `"0"`. Owned by Task 8 (normalisation) and Task 3 (`-0 × 5 = 0`).
5. **The body-size boundary:** exactly 1024 bytes is accepted, and 1025 bytes is rejected with 413 even when the JSON object itself is small and the excess is trailing whitespace. Owned by Task 4.

---

### Task 1: Repository bootstrap and operand parsing

**Files:**
- Create: `.gitignore`, `backend/go.mod`, `backend/go.sum`
- Create: `backend/internal/calculator/errors.go`, `backend/internal/calculator/number.go`
- Test: `backend/internal/calculator/number_test.go`

**Interfaces:**
- Produces, in package `calculator`:
  - `type Code string`, with constants:
    - `CodeUnknownOperation = "UNKNOWN_OPERATION"`
    - `CodeInvalidOperandCount = "INVALID_OPERAND_COUNT"`
    - `CodeInvalidNumber = "INVALID_NUMBER"`
    - `CodeDivisionByZero = "DIVISION_BY_ZERO"`
    - `CodeNegativeSquareRoot = "NEGATIVE_SQUARE_ROOT"`
    - `CodeNonIntegerExponent = "NON_INTEGER_EXPONENT"`
    - `CodeResultOutOfRange = "RESULT_OUT_OF_RANGE"`
  - `type Error struct { Code Code; Message string }` with `func (e *Error) Error() string` (returns `Message`).
  - `var decimal128 = apd.Context{...}`, unexported. It is used read-only, so it is safe to share across goroutines.
  - `func parseOperand(s string, position int) (*apd.Decimal, error)`, unexported. `position` is 1-based. Every failure is an `*Error` with `CodeInvalidNumber`.

- [ ] **Step 1: Initialise the repository and the Go module**

```bash
git init -b main
printf '.superpowers/\nbackend/coverage.out\nfrontend/node_modules/\nfrontend/dist/\nfrontend/coverage/\n*.log\n.DS_Store\n' > .gitignore
mkdir -p backend && cd backend && go mod init fullstack-calculator/backend && go get github.com/cockroachdb/apd/v3@latest
```
Expected: `go.mod` declares `go 1.27` and requires `github.com/cockroachdb/apd/v3`.

- [ ] **Step 2: Commit the approved design and this plan**

```bash
git add .gitignore full-stack-calculator-assignment.md docs/superpowers/
git commit -m "docs: add approved design spec and implementation plan"
```
Do **not** add `docs/prompts.md` (it waits for the user's review) or `.superpowers/`.

- [ ] **Step 3: Write the failing tests**

```go
package calculator

import (
	"errors"
	"testing"
)

func TestParseOperandAccepts(t *testing.T) {
	valid := []string{
		"0", "-0", "7", "-12.5", "1250.75", "0.000001", "1.5E+40", "1e-7", "2.0",
		"1234567890123456789012345678901234",        // exactly 34 digits
		"0.0000000000000000000000000000000000001",   // leading zeros don't count
		"9.999999999999999999999999999999999E+6144", // decimal128 maximum
		"1E-6176",                                   // smallest subnormal
	}
	for _, s := range valid {
		if _, err := parseOperand(s, 1); err != nil {
			t.Errorf("parseOperand(%q) error = %v, want nil", s, err)
		}
	}
}

func TestParseOperandRejects(t *testing.T) {
	cases := []struct {
		in       string
		position int
		message  string // empty: only the code is checked
	}{
		{"", 1, "Operand 1 is not a valid number."},
		{"abc", 2, "Operand 2 is not a valid number."},
		{" 1", 1, ""}, {"1 ", 1, ""}, {"+1", 1, ""}, {".5", 1, ""}, {"5.", 1, ""},
		{"007", 1, ""}, {"1,000", 1, ""}, {"NaN", 1, ""}, {"Infinity", 1, ""},
		{"0x1F", 1, ""}, {"1e", 1, ""}, {"--1", 1, ""},
		{"12345678901234567890123456789012345", 1, "Operand 1 has more than 34 digits."},
		{"1.0000000000000000000000000000000000", 1, "Operand 1 has more than 34 digits."},
		{"1E+6145", 1, "Operand 1 is out of range."},
		{"1E-6177", 1, "Operand 1 is out of range."},
		{"1E+99999999999", 1, ""},
	}
	for _, c := range cases {
		_, err := parseOperand(c.in, c.position)
		var e *Error
		if !errors.As(err, &e) || e.Code != CodeInvalidNumber {
			t.Errorf("parseOperand(%q) error = %v, want INVALID_NUMBER", c.in, err)
			continue
		}
		if c.message != "" && e.Message != c.message {
			t.Errorf("parseOperand(%q) message = %q, want %q", c.in, e.Message, c.message)
		}
	}
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/calculator/ -run TestParseOperand -v`
Expected: build failure (`undefined: parseOperand`).

- [ ] **Step 5: Implement `errors.go` and `number.go`**

`parseOperand` checks, in this order:
1. The grammar `^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$`. On failure: "Operand N is not a valid number."
2. The coefficient length: the integer digits plus the fraction digits, with leading zeros trimmed, must be ≤ 34. Otherwise: "Operand N has more than 34 digits."
3. The parse itself, with `apd.NewFromString`. A parse error gives the "not a valid number" message.
4. The range, with `decimal128.Round(d, d)`. If the condition has `Overflow()`, `Underflow()` or `Inexact()`, the answer is "Operand N is out of range."

- [ ] **Step 6: Run the tests to verify they pass**

Run: `go test ./internal/calculator/ -run TestParseOperand -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(calculator): parse decimal128 operands with strict grammar and limits"
```

---

### Task 2: Result formatting

**Files:**
- Modify: `backend/internal/calculator/number.go`
- Test: `backend/internal/calculator/number_test.go`

**Interfaces:**
- Produces `func formatDecimal(d *apd.Decimal) string`, unexported. It does not mutate `d`.

- [ ] **Step 1: Write the failing test** (the rule is §5.3)

```go
func TestFormatDecimal(t *testing.T) {
	cases := []struct{ in, want string }{
		{"1000", "1000"},
		{"1E+3", "1000"},
		{"2.50", "2.5"},
		{"3.0", "3"},
		{"-12.50", "-12.5"},
		{"-0", "0"},
		{"-0.000", "0"},
		{"0.000001", "0.000001"},
		{"0.0000001", "1E-7"},
		{"0.03333333333333333333333333333333333", "0.03333333333333333333333333333333333"},
		{"3.333333333333333333333333333333333E-8", "3.333333333333333333333333333333333E-8"},
		{"1E+20", "100000000000000000000"},
		{"1234567890123456789012345678901234", "1234567890123456789012345678901234"},                 // adj 33: plain
		{"1.234567890123456789012345678901234E+34", "1.234567890123456789012345678901234E+34"},       // adj 34: scientific
		{"1E+40", "1E+40"},
		{"1.50E+40", "1.5E+40"},
	}
	for _, c := range cases {
		d, _, err := apd.NewFromString(c.in)
		if err != nil {
			t.Fatalf("bad fixture %q: %v", c.in, err)
		}
		if got := formatDecimal(d); got != c.want {
			t.Errorf("formatDecimal(%s) = %q, want %q", c.in, got, c.want)
		}
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/calculator/ -run TestFormatDecimal -v`
Expected: build failure (`undefined: formatDecimal`).

- [ ] **Step 3: Implement `formatDecimal`**

- Work on a copy of `d` and reduce it (`decimal128.Reduce`) to strip trailing zeros.
- A zero renders as `"0"`.
- `adj := d.NumDigits() + int64(d.Exponent) - 1`.
- Use `Text('f')` when `-6 <= adj && adj <= 33`, otherwise `Text('E')`. If apd's `'E'` output differs from `1.5E+40` / `1E-7`, post-process it to that form.

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./internal/calculator/ -v`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/calculator/
git commit -m "feat(calculator): format results with magnitude-based notation"
```

---

### Task 3: Operations (`Calculate`)

**Files:**
- Create: `backend/internal/calculator/calculator.go`
- Test: `backend/internal/calculator/calculator_test.go`

**Interfaces:**
- Consumes: `parseOperand`, `formatDecimal`, `decimal128`, `Error`, `Code*` (Tasks 1–2).
- Produces, exported:
  - `type Operation string`, with constants `OpAdd = "add"`, `OpSubtract = "subtract"`, `OpMultiply = "multiply"`, `OpDivide = "divide"`, `OpPower = "power"`, `OpSqrt = "sqrt"`, `OpPercent = "percent"`.
  - `type Result struct { Value string; Rounded bool }`.
  - `func Calculate(op Operation, operands []string) (Result, error)`. Domain failures are returned as `*Error`. Anything else is an unexpected error.

**Exact messages:**

| Code | Message |
|---|---|
| `UNKNOWN_OPERATION` | `Operation must be one of: add, subtract, multiply, divide, power, sqrt, percent.` |
| `INVALID_OPERAND_COUNT` | `sqrt needs exactly 1 operand.` / `<op> needs exactly 2 operands.` |
| `DIVISION_BY_ZERO` | `Cannot divide by zero.` |
| `NEGATIVE_SQUARE_ROOT` | `Cannot take the square root of a negative number.` |
| `NON_INTEGER_EXPONENT` | `The exponent must be a whole number.` |
| `RESULT_OUT_OF_RANGE`, power pre-check | `The exponent must be between -6000 and 6000.` |
| `RESULT_OUT_OF_RANGE`, otherwise | `The result is too large or too small to represent.` |

Validation order: known operation → operand count → each operand parsed (1-based position) → compute.

- [ ] **Step 1: Write the failing tests**

```go
package calculator

import (
	"errors"
	"testing"
)

func TestCalculate(t *testing.T) {
	cases := []struct {
		op       Operation
		operands []string
		want     string
		rounded  bool
	}{
		{OpAdd, []string{"0.1", "0.2"}, "0.3", false},
		{OpSubtract, []string{"0.3", "0.1"}, "0.2", false},
		{OpSubtract, []string{"1", "1"}, "0", false},
		{OpMultiply, []string{"1.1", "1.1"}, "1.21", false},
		{OpMultiply, []string{"-0", "5"}, "0", false},
		{OpMultiply, []string{"1.5E+40", "2"}, "3E+40", false},
		{OpDivide, []string{"10", "3"}, "3.333333333333333333333333333333333", true},
		{OpDivide, []string{"2", "3"}, "0.6666666666666666666666666666666667", true},
		{OpDivide, []string{"1", "30"}, "0.03333333333333333333333333333333333", true},
		{OpDivide, []string{"1250.75", "3"}, "416.9166666666666666666666666666667", true},
		{OpDivide, []string{"1", "8"}, "0.125", false},
		{OpPower, []string{"2", "10"}, "1024", false},
		{OpPower, []string{"2", "-2"}, "0.25", false},
		{OpPower, []string{"-2", "3"}, "-8", false},
		{OpPower, []string{"0", "0"}, "1", false},
		{OpPower, []string{"2", "1E+1"}, "1024", false},
		{OpPower, []string{"2", "2.0"}, "4", false},
		{OpPower, []string{"1.5E+40", "2"}, "2.25E+80", false},
		{OpPower, []string{"10", "6000"}, "1E+6000", false},
		{OpSqrt, []string{"2"}, "1.414213562373095048801688724209698", true},
		{OpSqrt, []string{"16"}, "4", false},
		{OpSqrt, []string{"0"}, "0", false},
		{OpPercent, []string{"15", "200"}, "30", false},
		{OpPercent, []string{"12.5", "80"}, "10", false},
		// round-half-even ties at the 35th digit
		{OpAdd, []string{"1234567890123456789012345678901234", "0.5"}, "1234567890123456789012345678901234", true},
		{OpAdd, []string{"1234567890123456789012345678901233", "0.5"}, "1234567890123456789012345678901234", true},
	}
	for _, c := range cases {
		got, err := Calculate(c.op, c.operands)
		if err != nil {
			t.Errorf("Calculate(%s, %v) error = %v", c.op, c.operands, err)
			continue
		}
		if got.Value != c.want || got.Rounded != c.rounded {
			t.Errorf("Calculate(%s, %v) = {%q, %v}, want {%q, %v}", c.op, c.operands, got.Value, got.Rounded, c.want, c.rounded)
		}
	}
}

func TestCalculateErrors(t *testing.T) {
	cases := []struct {
		op       Operation
		operands []string
		code     Code
		message  string // empty: only the code is checked
	}{
		{"modulo", []string{"1", "2"}, CodeUnknownOperation, "Operation must be one of: add, subtract, multiply, divide, power, sqrt, percent."},
		{"ADD", []string{"1", "2"}, CodeUnknownOperation, ""},
		{"", []string{"1", "2"}, CodeUnknownOperation, ""},
		{OpDivide, []string{"1"}, CodeInvalidOperandCount, "divide needs exactly 2 operands."},
		{OpSqrt, []string{"4", "2"}, CodeInvalidOperandCount, "sqrt needs exactly 1 operand."},
		{OpAdd, nil, CodeInvalidOperandCount, ""},
		{OpAdd, []string{"1", "abc"}, CodeInvalidNumber, "Operand 2 is not a valid number."},
		{OpAdd, []string{"", "1"}, CodeInvalidNumber, "Operand 1 is not a valid number."},
		{OpDivide, []string{"1", "0"}, CodeDivisionByZero, "Cannot divide by zero."},
		{OpDivide, []string{"0", "0"}, CodeDivisionByZero, ""},
		{OpPower, []string{"0", "-1"}, CodeDivisionByZero, ""},
		{OpSqrt, []string{"-4"}, CodeNegativeSquareRoot, "Cannot take the square root of a negative number."},
		{OpPower, []string{"2", "0.5"}, CodeNonIntegerExponent, "The exponent must be a whole number."},
		{OpPower, []string{"2", "6001"}, CodeResultOutOfRange, "The exponent must be between -6000 and 6000."},
		{OpPower, []string{"2", "-6001"}, CodeResultOutOfRange, ""},
		{OpPower, []string{"1", "7000"}, CodeResultOutOfRange, ""}, // accepted trade-off (§6.3)
		{OpPower, []string{"99", "6000"}, CodeResultOutOfRange, "The result is too large or too small to represent."},
		{OpMultiply, []string{"9.999999999999999999999999999999999E+6144", "10"}, CodeResultOutOfRange, ""},
		{OpMultiply, []string{"1E-6000", "1E-6000"}, CodeResultOutOfRange, ""},
		{OpPercent, []string{"1E-6176", "1"}, CodeResultOutOfRange, ""},
	}
	for _, c := range cases {
		_, err := Calculate(c.op, c.operands)
		var e *Error
		if !errors.As(err, &e) || e.Code != c.code {
			t.Errorf("Calculate(%q, %v) error = %v, want %s", c.op, c.operands, err, c.code)
			continue
		}
		if c.message != "" && e.Message != c.message {
			t.Errorf("Calculate(%q, %v) message = %q, want %q", c.op, c.operands, e.Message, c.message)
		}
	}
}

func TestResultsRoundTripAsOperands(t *testing.T) {
	cases := []struct {
		op       Operation
		operands []string
	}{
		{OpDivide, []string{"1", "3"}},
		{OpDivide, []string{"1", "3000000"}},
		{OpPower, []string{"2", "-20"}},
		{OpMultiply, []string{"9.999999999999999999999999999999999E+6144", "1"}},
		{OpMultiply, []string{"1E-6176", "1"}},
	}
	for _, c := range cases {
		res, err := Calculate(c.op, c.operands)
		if err != nil {
			t.Fatalf("Calculate(%s, %v) error = %v", c.op, c.operands, err)
		}
		if _, err := parseOperand(res.Value, 1); err != nil {
			t.Errorf("result %q of %s%v is not accepted back as an operand: %v", res.Value, c.op, c.operands, err)
		}
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test ./internal/calculator/ -run 'TestCalculate|TestResultsRoundTrip' -v`
Expected: build failure (`undefined: Calculate`).

- [ ] **Step 3: Implement `Calculate`**

**Operations**
- Keep an arity map per operation.
- Map each operation to its `decimal128` method: `Add`, `Sub`, `Mul`, `Quo`, `Pow`, `Sqrt`.
- Percent is `Mul`, then `Quo` by 100, with both conditions ORed together.

**Pre-checks, run before any apd call**
- divide: a zero divisor → `DIVISION_BY_ZERO`.
- sqrt: a negative, non-zero operand → `NEGATIVE_SQUARE_ROOT`.
- power:
  - a fractional exponent (`Modf` leaves a non-zero fraction) → `NON_INTEGER_EXPONENT`;
  - an exponent magnitude above 6000 → the pre-check message above;
  - an exponent of 0 → `"1"`;
  - a zero base with a negative exponent → `DIVISION_BY_ZERO`.

**After the call**
- `Overflow()` or `Underflow()` → `RESULT_OUT_OF_RANGE`, with the generic message.
- `Rounded` is `cond.Inexact()`.
- Format the value with `formatDecimal`.

- [ ] **Step 4: Run the tests and coverage**

Run: `go test ./internal/calculator/ -cover`
Expected: PASS, coverage ≥ 90 %.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/calculator/
git commit -m "feat(calculator): implement operations with decimal128 rounding and range checks"
```

---

### Task 4: HTTP API handler

**Files:**
- Create: `backend/internal/httpapi/handler.go`, `backend/internal/httpapi/respond.go`
- Test: `backend/internal/httpapi/handler_test.go`

**Interfaces:**
- Consumes: `calculator.Calculate`, `calculator.Operation`, `calculator.Error`, `calculator.Code*`.
- Produces: `func NewHandler(logger *slog.Logger) http.Handler`. In this task it returns the bare mux; Task 5 wraps it with middleware.

**Routes**

| Pattern | Behaviour |
|---|---|
| `POST /api/v1/calculate` | Calculate. |
| `/api/v1/calculate` | 405, `Allow: POST`. |
| `GET /healthz` | 200 `{"status":"ok"}`. |
| `/healthz` | 405, `Allow: GET`. |
| `/` | 404. |

**HTTP-level codes and messages**

| Status | Code | Message |
|---|---|---|
| 400 | `INVALID_JSON` | `Request body must be a JSON object with "operation" and "operands".` |
| 413 | `PAYLOAD_TOO_LARGE` | `Request body must not exceed 1 KB.` |
| 404 | `NOT_FOUND` | `Not found.` |
| 405 | `METHOD_NOT_ALLOWED` | `Method not allowed.` |
| 500 | `INTERNAL_ERROR` | `Internal server error.` |

Domain codes map as follows:
- `UNKNOWN_OPERATION`, `INVALID_OPERAND_COUNT`, `INVALID_NUMBER` → **400**.
- `DIVISION_BY_ZERO`, `NEGATIVE_SQUARE_ROOT`, `NON_INTEGER_EXPONENT`, `RESULT_OUT_OF_RANGE` → **422**.
- Any non-domain error → 500.

- [ ] **Step 1: Write the failing tests**

```go
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

func TestCalculateEndpoint(t *testing.T) {
	cases := []struct {
		name, method, path, body string
		status                   int
		want                     string
	}{
		{"rounded result", "POST", calc, `{"operation":"divide","operands":["10","3"]}`, 200, `{"result":"3.333333333333333333333333333333333","rounded":true}`},
		{"exact result", "POST", calc, `{"operation":"add","operands":["0.1","0.2"]}`, 200, `{"result":"0.3","rounded":false}`},
		{"malformed json", "POST", calc, `{"operation":`, 400, errBody("INVALID_JSON", `Request body must be a JSON object with "operation" and "operands".`)},
		{"empty body", "POST", calc, ``, 400, errBody("INVALID_JSON", `Request body must be a JSON object with "operation" and "operands".`)},
		{"numeric operand", "POST", calc, `{"operation":"add","operands":[1,2]}`, 400, errBody("INVALID_JSON", `Request body must be a JSON object with "operation" and "operands".`)},
		{"unknown field", "POST", calc, `{"operation":"add","operands":["1","2"],"x":1}`, 400, errBody("INVALID_JSON", `Request body must be a JSON object with "operation" and "operands".`)},
		{"trailing data", "POST", calc, `{"operation":"add","operands":["1","2"]} {}`, 400, errBody("INVALID_JSON", `Request body must be a JSON object with "operation" and "operands".`)},
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test ./internal/httpapi/ -v`
Expected: build failure (`undefined: NewHandler`).

- [ ] **Step 3: Implement `handler.go` and `respond.go`**

**`respond.go`**
- `writeJSON(w, status, v)` always sets `Content-Type: application/json`.
- `writeError(w, status, code, message)` writes the error body.
- `statusFor(calculator.Code) int` maps domain codes to statuses.

**Request handling**
- Read the whole body through `http.MaxBytesReader(w, r.Body, 1024)` with `io.ReadAll`. A `*http.MaxBytesError` → 413.
- Decode from the bytes with `DisallowUnknownFields` into `struct{ Operation string; Operands []*string }` with JSON tags.
- A second `Decode` that does not return `io.EOF` → `INVALID_JSON`.
- A `nil` element becomes `""`, so the domain reports it as `INVALID_NUMBER` with its position.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test ./internal/httpapi/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/httpapi/
git commit -m "feat(httpapi): expose POST /api/v1/calculate with semantic JSON errors"
```

---

### Task 5: Middleware (request log and panic recovery)

**Files:**
- Create: `backend/internal/httpapi/middleware.go`
- Modify: `backend/internal/httpapi/handler.go` (wrap the mux)
- Test: `backend/internal/httpapi/middleware_test.go`

**Interfaces:**
- Produces:
  - `func withRequestLog(logger *slog.Logger, next http.Handler) http.Handler`, which logs message `"request"` with attributes `method`, `path`, `status`, `duration`;
  - `func withRecovery(logger *slog.Logger, next http.Handler) http.Handler`, which logs at Error level with attribute `panic`, then writes 500 `INTERNAL_ERROR`.
- `NewHandler` now returns `withRecovery(logger, withRequestLog(logger, mux))`.

- [ ] **Step 1: Write the failing tests**

```go
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test ./internal/httpapi/ -run 'TestRequestLog|TestRecovery' -v`
Expected: build failure (`undefined: withRecovery`).

- [ ] **Step 3: Implement `middleware.go` and wrap the mux in `NewHandler`**

`withRequestLog` captures the status code with a small `statusRecorder` that wraps `http.ResponseWriter`. It defaults to 200.

- [ ] **Step 4: Run all backend tests**

Run: `go test ./... -cover`
Expected: PASS. `internal/calculator` and `internal/httpapi` are each ≥ 90 %.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/httpapi/
git commit -m "feat(httpapi): add structured request logging and panic recovery"
```

---

### Task 6: Server entrypoint, healthcheck mode, backend image

**Files:**
- Create: `backend/cmd/server/main.go`, `backend/Dockerfile`, `backend/.dockerignore`
- Test: `backend/cmd/server/main_test.go`

**Interfaces:**
- Consumes: `httpapi.NewHandler`.
- Produces, in package `main`:
  - `func portFromEnv(getenv func(string) string) string`: `PORT`, or `"8081"`.
  - `func newServer(addr string, h http.Handler) *http.Server`: `ReadHeaderTimeout` 5 s, `ReadTimeout` 10 s, `WriteTimeout` 10 s, `IdleTimeout` 60 s.
  - `func checkHealth(ctx context.Context, url string) error`: nil only on HTTP 200, with a 2 s client timeout.
  - `func serve(ctx context.Context, srv *http.Server, logger *slog.Logger) error`: returns nil after a graceful `Shutdown` (10 s budget) once `ctx` is done.
  - `main`:
    - `server healthcheck` → `os.Exit(0 or 1)` after `checkHealth("http://127.0.0.1:"+port+"/healthz")`;
    - otherwise it serves, with `signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)` and a JSON `slog` logger on stdout.

- [ ] **Step 1: Write the failing tests**

```go
package main

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPortFromEnv(t *testing.T) {
	if got := portFromEnv(func(string) string { return "" }); got != "8081" {
		t.Errorf("default port = %q, want 8081", got)
	}
	if got := portFromEnv(func(string) string { return "9000" }); got != "9000" {
		t.Errorf("port = %q, want 9000", got)
	}
}

func TestNewServerSetsTimeouts(t *testing.T) {
	s := newServer(":0", http.NotFoundHandler())
	if s.ReadHeaderTimeout != 5*time.Second || s.ReadTimeout != 10*time.Second ||
		s.WriteTimeout != 10*time.Second || s.IdleTimeout != 60*time.Second {
		t.Errorf("timeouts = %v %v %v %v", s.ReadHeaderTimeout, s.ReadTimeout, s.WriteTimeout, s.IdleTimeout)
	}
}

func TestCheckHealth(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer ok.Close()
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(503) }))
	defer down.Close()
	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()

	if err := checkHealth(context.Background(), ok.URL); err != nil {
		t.Errorf("healthy server: %v", err)
	}
	if err := checkHealth(context.Background(), down.URL); err == nil {
		t.Error("503 should be unhealthy")
	}
	if err := checkHealth(context.Background(), closed.URL); err == nil {
		t.Error("unreachable server should be unhealthy")
	}
}

func TestServeShutsDownWhenContextEnds(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- serve(ctx, newServer("127.0.0.1:0", http.NotFoundHandler()), slog.New(slog.NewTextHandler(io.Discard, nil)))
	}()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("serve returned %v, want nil", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("serve did not return after cancel")
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test ./cmd/server/ -v`
Expected: build failure (`undefined: portFromEnv`).

- [ ] **Step 3: Implement `main.go`**

`serve` runs `ListenAndServe` in a goroutine and treats `http.ErrServerClosed` as success.

- [ ] **Step 4: Run the tests and the total coverage**

Run: `go test ./... -coverprofile=coverage.out && go tool cover -func=coverage.out | tail -1`
Expected: PASS, and the `total:` line shows ≥ 90 %.

- [ ] **Step 5: Write `backend/Dockerfile` and `backend/.dockerignore`**

- Build stage: `golang:1.27-alpine`, `WORKDIR /src`. Copy `go.mod`/`go.sum` and run `go mod download` before copying the rest. Build with `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server`.
- Runtime stage: `gcr.io/distroless/static-debian12:nonroot`. `COPY --from=build /out/server /server`, `EXPOSE 8081`, `USER nonroot:nonroot`, `ENTRYPOINT ["/server"]`.
- `.dockerignore` lists `coverage.out`.

- [ ] **Step 6: Verify the image**

```bash
docker build -t calc-backend ./backend
docker run --rm -d --name calc-backend -p 8081:8081 calc-backend
curl -s -X POST localhost:8081/api/v1/calculate -H "Content-Type: application/json" -d '{"operation":"divide","operands":["10","3"]}'
docker exec calc-backend /server healthcheck; echo "exit=$?"
docker stop calc-backend
```
Expected: `{"result":"3.333333333333333333333333333333333","rounded":true}` and `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(server): add entrypoint with graceful shutdown, healthcheck mode and distroless image"
```

---

### Task 7: Frontend scaffold and entry rules

**Files:**
- Create: `frontend/` (Vite `react-ts` template), `frontend/src/test/setup.ts`, `frontend/src/calculator/entry.ts`
- Modify: `frontend/vite.config.ts`, `frontend/package.json`, `frontend/index.html`
- Delete: template demo files (`src/App.css`, `src/assets/`, `public/vite.svg`)
- Test: `frontend/src/calculator/entry.test.ts`

**Interfaces:**
- Produces, from `src/calculator/entry.ts`:
  - `export const MAX_DIGITS = 34`
  - `export function countDigits(entry: string): number`: counts every `0-9` character.
  - `export function appendDigit(entry: string, digit: string): string`
  - `export function appendDecimalPoint(entry: string): string`
  - `export function toggleSign(entry: string): string`
  - `export function deleteLast(entry: string): string`
  - `export function normalizeOperand(entry: string): string`

- [ ] **Step 1: Scaffold and install**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
npm install @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```
If the wizard prompts, decline optional extras and don't start the dev server.

- [ ] **Step 2: Configure scripts, Vite and Vitest**

**`package.json` scripts:**
- `"dev": "vite"`
- `"build": "tsc -b && vite build"`
- `"typecheck": "tsc -b"`
- `"lint": "eslint ."`
- `"test": "vitest run"`
- `"coverage": "vitest run --coverage"`

**`vite.config.ts`**, with `/// <reference types="vitest/config" />`:
- `server.proxy`: `{ '/api': 'http://localhost:8081', '/healthz': 'http://localhost:8081' }`
- `test.environment: 'jsdom'`, `test.setupFiles: ['./src/test/setup.ts']`
- `test.coverage`:
  - `provider: 'v8'`, `reporter: ['text', 'html']`
  - `include: ['src/**/*.{ts,tsx}']`
  - `exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}', 'src/vite-env.d.ts']`
  - `thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 }`

**Other files**
- `src/test/setup.ts`: `import '@testing-library/jest-dom/vitest'`.
- `index.html`: `<title>Precision Calculator</title>`.

- [ ] **Step 3: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { appendDecimalPoint, appendDigit, countDigits, deleteLast, normalizeOperand, toggleSign } from './entry';

describe('entry rules', () => {
  it.each([
    ['0', '5', '5'], ['-0', '5', '-5'], ['12', '3', '123'], ['0', '0', '0'], ['0.', '0', '0.0'],
  ])('appendDigit(%s, %s) = %s', (entry, digit, want) => expect(appendDigit(entry, digit)).toBe(want));

  it('caps an operand at 34 digits, counting leading zeros', () => {
    const full = '1'.repeat(34);
    expect(appendDigit(full, '1')).toBe(full);
    const almost = '0.' + '0'.repeat(32); // 33 digits
    expect(appendDigit(almost, '7')).toBe(almost + '7');
    expect(appendDigit(almost + '7', '1')).toBe(almost + '7');
  });

  it.each([['12', '12.'], ['12.5', '12.5'], ['-0', '-0.']])('appendDecimalPoint(%s) = %s', (e, w) => expect(appendDecimalPoint(e)).toBe(w));
  it.each([['5', '-5'], ['-5', '5'], ['0', '-0'], ['1.5E+40', '-1.5E+40']])('toggleSign(%s) = %s', (e, w) => expect(toggleSign(e)).toBe(w));
  it.each([['123', '12'], ['5', '0'], ['-5', '0'], ['0.', '0'], ['-1.', '-1']])('deleteLast(%s) = %s', (e, w) => expect(deleteLast(e)).toBe(w));
  it.each([['5.', '5'], ['-0.', '-0'], ['12.50', '12.50'], ['1.5E+40', '1.5E+40']])('normalizeOperand(%s) = %s', (e, w) => expect(normalizeOperand(e)).toBe(w));
  it('countDigits ignores sign and point', () => expect(countDigits('-12.50')).toBe(4));
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/calculator/entry.test.ts`
Expected: FAIL (cannot resolve `./entry`).

- [ ] **Step 5: Implement `entry.ts`**

`appendDigit` follows three rules:
- `'0'` and `'-0'` are replaced by the digit, keeping the sign.
- If `countDigits(entry) >= MAX_DIGITS`, the entry is returned unchanged.
- Otherwise the digit is appended.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/calculator/entry.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold Vite React app with Vitest and keypad entry rules"
```

---

### Task 8: Keypad reducer

**Files:**
- Create: `frontend/src/calculator/types.ts`, `frontend/src/calculator/reducer.ts`
- Test: `frontend/src/calculator/reducer.test.ts`

**Interfaces:**
- Consumes: `appendDigit`, `appendDecimalPoint`, `toggleSign`, `deleteLast`, `normalizeOperand` (Task 7).
- Produces:

```ts
// types.ts
export type BinaryOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percent';
export type Operation = BinaryOperation | 'sqrt';
export interface CalcRequest { operation: Operation; operands: string[] }
export interface HistoryEntry { expression: string; result: string; rounded: boolean }

// reducer.ts
export type Action =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' } | { type: 'toggleSign' } | { type: 'backspace' } | { type: 'clear' }
  | { type: 'operator'; operation: BinaryOperation } | { type: 'sqrt' } | { type: 'equals' }
  | { type: 'resolved'; result: string; rounded: boolean }
  | { type: 'failed'; message: string };
export interface Pending { request: CalcRequest; expression: string; then: 'equals' | 'sqrt' | BinaryOperation }
export interface State {
  entry: string;               // number on the result line ('0' initially)
  overwrite: boolean;          // next digit/decimal replaces entry
  accumulator: string | null;  // first operand of the pending binary operation
  operation: BinaryOperation | null;
  awaitingOperand: boolean;    // operator pressed, second operand not entered yet
  rounded: boolean;
  expression: string;          // upper display line
  error: string | null;
  pending: Pending | null;     // request in flight; input locked while non-null
  history: HistoryEntry[];     // newest first, at most HISTORY_LIMIT
}
export const HISTORY_LIMIT = 50;
export const SYMBOLS: Record<BinaryOperation, string> =
  { add: '+', subtract: '−', multiply: '×', divide: '÷', power: '^', percent: '% of' };
export const initialState: State;
export function reducer(state: State, action: Action): State;
```

**Transition rules.** `acc` is `accumulator`, `sym` is `SYMBOLS[operation]`, `b` is `normalizeOperand(entry)`.

| Action | Rule |
|---|---|
| anything while `pending` | Return `state` unchanged, except for `resolved` and `failed`. |
| key action while `error` | Reset to `initialState`, keeping `history`. Then apply the action only if it is `digit` or `decimal`. |
| `digit` / `decimal` | `entry = overwrite ? appendDigit('0', d) /* or '0.' */ : appendDigit(entry, d) /* or appendDecimalPoint */`. Set `overwrite = false`, `awaitingOperand = false`, `rounded = false`. `expression = acc ? \`${acc} ${sym}\` : ''`. |
| `toggleSign` | If `awaitingOperand`: `entry = '-0'`, `overwrite = false`, `awaitingOperand = false`. Otherwise `entry = toggleSign(entry)`, everything else unchanged. |
| `backspace` | Ignored when `overwrite`. Otherwise `entry = deleteLast(entry)`. |
| `clear` | `{ ...initialState, history }`. |
| `operator(op)` | If `awaitingOperand`: replace `operation`, `expression = \`${acc} ${SYMBOLS[op]}\``. Else if `acc !== null`: `pending = { request: { operation, operands: [acc, b] }, expression: \`${acc} ${sym} ${b}\`, then: op }`. Else: `accumulator = b`, `operation = op`, `awaitingOperand = true`, `overwrite = true`, `rounded = false`, `expression = \`${b} ${SYMBOLS[op]}\``. |
| `sqrt` | Ignored when `awaitingOperand`. Otherwise `pending = { request: { operation: 'sqrt', operands: [b] }, expression: \`√${b}\`, then: 'sqrt' }`. |
| `equals` | When `acc !== null && !awaitingOperand`: `pending = { request: { operation, operands: [acc, b] }, expression: \`${acc} ${sym} ${b}\`, then: 'equals' }`. Otherwise ignored. |
| `resolved` | Prepend `{ expression: pending.expression, result, rounded }` to `history` and cap it at 50. Set `entry = result`, `rounded`, `overwrite = true`, `pending = null`. Then, by `then`: **`'equals'`** → `accumulator = null`, `operation = null`, `expression = \`${pending.expression} =\``. **A `BinaryOperation`** → `accumulator = result`, `operation = then`, `awaitingOperand = true`, `expression = \`${result} ${SYMBOLS[then]}\``. **`'sqrt'`** → if `acc !== null`, `expression = \`${acc} ${sym} ${pending.expression}\``; otherwise `expression = \`${pending.expression} =\``. |
| `failed` | `error = message`, `expression = \`${pending.expression} =\``, `pending = null`. |

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { initialState, reducer, type Action, type State } from './reducer';

const KEYS: Record<string, Action> = {
  '+': { type: 'operator', operation: 'add' }, '−': { type: 'operator', operation: 'subtract' },
  '×': { type: 'operator', operation: 'multiply' }, '÷': { type: 'operator', operation: 'divide' },
  '^': { type: 'operator', operation: 'power' }, '%': { type: 'operator', operation: 'percent' },
  '√': { type: 'sqrt' }, '=': { type: 'equals' }, '±': { type: 'toggleSign' }, '⌫': { type: 'backspace' }, AC: { type: 'clear' },
};
// "10 ÷ 3 =" → digits/points per character, symbols per token
function press(state: State, keys: string): State {
  return keys.split(' ').flatMap((token): Action[] =>
    KEYS[token] ? [KEYS[token]] : [...token].map((c) => (c === '.' ? { type: 'decimal' } : { type: 'digit', digit: c })),
  ).reduce(reducer, state);
}
const resolve = (s: State, result: string, rounded = false) => reducer(s, { type: 'resolved', result, rounded });
const TEN_THIRDS = '3.333333333333333333333333333333333';

describe('keypad reducer', () => {
  it('types numbers', () => expect(press(initialState, '10').entry).toBe('10'));
  it('starts with a decimal point as 0.', () => expect(press(initialState, '. 5').entry).toBe('0.5'));

  it('evaluates with = and records history', () => {
    const asked = press(initialState, '10 ÷ 3 =');
    expect(asked.pending).toEqual({ request: { operation: 'divide', operands: ['10', '3'] }, expression: '10 ÷ 3', then: 'equals' });
    const done = resolve(asked, TEN_THIRDS, true);
    expect(done).toMatchObject({ entry: TEN_THIRDS, rounded: true, expression: '10 ÷ 3 =', pending: null, accumulator: null });
    expect(done.history[0]).toEqual({ expression: '10 ÷ 3', result: TEN_THIRDS, rounded: true });
  });

  it('ignores input while a request is in flight', () => {
    const asked = press(initialState, '10 ÷ 3 =');
    expect(press(asked, '5')).toBe(asked);
    expect(press(asked, 'AC')).toBe(asked);
  });

  it('chains left to right without precedence', () => {
    const asked = press(initialState, '2 + 3 ×');
    expect(asked.pending).toMatchObject({ request: { operation: 'add', operands: ['2', '3'] }, then: 'multiply' });
    const chained = resolve(asked, '5');
    expect(chained).toMatchObject({ accumulator: '5', operation: 'multiply', awaitingOperand: true, entry: '5', expression: '5 ×' });
    expect(chained.history[0].expression).toBe('2 + 3');
    expect(press(chained, '4 =').pending?.request).toEqual({ operation: 'multiply', operands: ['5', '4'] });
  });

  it('replaces an operator pressed right after another', () => {
    expect(press(initialState, '2 + ×')).toMatchObject({ operation: 'multiply', expression: '2 ×', pending: null });
  });

  it('ignores = without a second operand, without an operator, and after a result', () => {
    expect(press(initialState, '2 + =').pending).toBeNull();
    expect(press(initialState, '5 =').pending).toBeNull();
    expect(press(resolve(press(initialState, '1 + 1 ='), '2'), '=').pending).toBeNull();
  });

  it('after a result: digit starts fresh, operator chains, √ applies to it', () => {
    const result = resolve(press(initialState, '10 ÷ 3 ='), TEN_THIRDS, true);
    expect(press(result, '7')).toMatchObject({ entry: '7', expression: '', rounded: false, accumulator: null });
    expect(press(result, '.').entry).toBe('0.');
    expect(press(result, '+')).toMatchObject({ accumulator: TEN_THIRDS, expression: `${TEN_THIRDS} +` });
    expect(press(result, '√').pending?.request).toEqual({ operation: 'sqrt', operands: [TEN_THIRDS] });
  });

  it('applies √ immediately', () => {
    const asked = press(initialState, '2 √');
    expect(asked.pending).toEqual({ request: { operation: 'sqrt', operands: ['2'] }, expression: '√2', then: 'sqrt' });
    const done = resolve(asked, '1.414213562373095048801688724209698', true);
    expect(done).toMatchObject({ expression: '√2 =', accumulator: null });
    expect(done.history[0].expression).toBe('√2');
  });

  it('applies √ to the second operand and keeps the pending operation', () => {
    const root = resolve(press(initialState, '9 + 16 √'), '4');
    expect(root).toMatchObject({ accumulator: '9', operation: 'add', entry: '4', expression: '9 + √16' });
    expect(press(root, '=').pending?.request).toEqual({ operation: 'add', operands: ['9', '4'] });
    expect(press(initialState, '9 + √').pending).toBeNull();
  });

  it('labels percent and power in the expression', () => {
    expect(press(initialState, '15 % 200 =').pending).toMatchObject({ request: { operation: 'percent', operands: ['15', '200'] }, expression: '15 % of 200' });
    expect(press(initialState, '2 ^ 10 =').pending).toMatchObject({ request: { operation: 'power', operands: ['2', '10'] }, expression: '2 ^ 10' });
  });

  it('normalises a trailing decimal point before sending', () => {
    const s = press(initialState, '5. + 1 =');
    expect(s.accumulator).toBe('5');
    expect(s.pending?.request.operands).toEqual(['5', '1']);
  });

  it('handles the sign key', () => {
    expect(press(initialState, '5 ±').entry).toBe('-5');
    expect(press(initialState, '2 + ± 3 =').pending?.request.operands).toEqual(['2', '-3']);
    const result = resolve(press(initialState, '1 + 2 ='), '3');
    expect(press(result, '±').entry).toBe('-3');
    expect(press(result, '± 7').entry).toBe('7');
  });

  it('ignores backspace on a result', () => {
    const result = resolve(press(initialState, '1 + 2 ='), '3');
    expect(press(result, '⌫')).toEqual(result);
  });

  it('sends a scientific-notation result back verbatim when chaining', () => {
    const big = resolve(press(initialState, '1 + 1 ='), '1.5E+40');
    expect(press(big, '× 2 =').pending?.request).toEqual({ operation: 'multiply', operands: ['1.5E+40', '2'] });
  });

  it('shows errors and resets on the next key, keeping history', () => {
    const withHistory = resolve(press(initialState, '1 + 1 ='), '2');
    const failed = reducer(press(withHistory, '1250.75 ÷ 0 ='), { type: 'failed', message: 'Cannot divide by zero.' });
    expect(failed).toMatchObject({ error: 'Cannot divide by zero.', expression: '1250.75 ÷ 0 =', pending: null });
    expect(press(failed, '7')).toMatchObject({ entry: '7', error: null, history: withHistory.history });
    expect(press(failed, '+')).toEqual({ ...initialState, history: withHistory.history });
  });

  it('keeps history across AC and caps it at 50 entries', () => {
    let s = initialState;
    for (let i = 0; i < 51; i++) s = resolve(press(s, '1 + 1 ='), String(i));
    expect(s.history).toHaveLength(50);
    expect(s.history[0].result).toBe('50');
    expect(press(s, 'AC').history).toHaveLength(50);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/calculator/reducer.test.ts`
Expected: FAIL (cannot resolve `./reducer`).

- [ ] **Step 3: Implement `types.ts` and `reducer.ts`** following the transition table exactly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/calculator/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/calculator/
git commit -m "feat(frontend): add left-to-right keypad state machine"
```

---

### Task 9: API client

**Files:**
- Create: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: `CalcRequest` (Task 8 `types.ts`).
- Produces:

```ts
export interface Exchange { request: CalcRequest; status: number | null; response: unknown } // response: parsed JSON, raw text, or null
export type CalcOutcome =
  | { kind: 'success'; result: string; rounded: boolean; exchange: Exchange }
  | { kind: 'apiError'; code: string; message: string; exchange: Exchange }
  | { kind: 'transportError'; message: string; exchange: Exchange };
export type CalculateFn = (request: CalcRequest) => Promise<CalcOutcome>;
export const CALCULATE_PATH = '/api/v1/calculate';
export const REQUEST_TIMEOUT_MS = 10_000;
export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Try again.";
export const BAD_RESPONSE_MESSAGE = 'Unexpected response from the server.';
export function calculate(request: CalcRequest, fetchFn?: typeof fetch, timeoutMs?: number): Promise<CalcOutcome>;
```

**Outcome rules**

| Situation | Outcome |
|---|---|
| `fetch` rejects (including a timeout abort) | `transportError` with `NETWORK_ERROR_MESSAGE`, `status: null`, `response: null`. |
| 2xx with `{ result: string, rounded: boolean }` | `success`. |
| 2xx with any other shape | `transportError` with `BAD_RESPONSE_MESSAGE`. |
| Non-2xx with `{ error: { code, message } }` | `apiError`. |
| Non-2xx that isn't that JSON | `transportError` with `NETWORK_ERROR_MESSAGE`. |

- The response body is read as text, then parsed with `JSON.parse`.
- `exchange.response` is the parsed value, or the raw text when parsing fails.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { BAD_RESPONSE_MESSAGE, NETWORK_ERROR_MESSAGE, calculate } from './client';
import type { CalcRequest } from '../calculator/types';

const add: CalcRequest = { operation: 'add', operands: ['0.1', '0.2'] };
const reply = (status: number, body: string) => vi.fn(async () => new Response(body, { status }));

describe('calculate', () => {
  it('posts the request as JSON and returns the result as a string', async () => {
    const fetchFn = reply(200, '{"result":"0.3","rounded":false}');
    const outcome = await calculate(add, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/api/v1/calculate', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"operation":"add","operands":["0.1","0.2"]}',
    }));
    expect(outcome).toEqual({ kind: 'success', result: '0.3', rounded: false, exchange: { request: add, status: 200, response: { result: '0.3', rounded: false } } });
  });

  it('never converts the result to a number', async () => {
    const long = '0.1000000000000000000000000000000001';
    const outcome = await calculate(add, reply(200, `{"result":"${long}","rounded":false}`));
    expect(outcome.kind === 'success' && outcome.result).toBe(long);
  });

  it('maps an API error', async () => {
    const outcome = await calculate(add, reply(422, '{"error":{"code":"DIVISION_BY_ZERO","message":"Cannot divide by zero."}}'));
    expect(outcome).toMatchObject({ kind: 'apiError', code: 'DIVISION_BY_ZERO', message: 'Cannot divide by zero.', exchange: { status: 422 } });
  });

  it('treats a non-JSON error page as unreachable', async () => {
    const outcome = await calculate(add, reply(502, '<html>Bad Gateway</html>'));
    expect(outcome).toMatchObject({ kind: 'transportError', message: NETWORK_ERROR_MESSAGE, exchange: { status: 502, response: '<html>Bad Gateway</html>' } });
  });

  it('rejects a success body with the wrong shape', async () => {
    const outcome = await calculate(add, reply(200, '{"result":0.3}'));
    expect(outcome).toMatchObject({ kind: 'transportError', message: BAD_RESPONSE_MESSAGE });
  });

  it('reports network failures', async () => {
    const outcome = await calculate(add, vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(outcome).toEqual({ kind: 'transportError', message: NETWORK_ERROR_MESSAGE, exchange: { request: add, status: null, response: null } });
  });

  it('gives up when the server never answers', async () => {
    const hang = vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    const outcome = await calculate(add, hang, 20);
    expect(outcome).toMatchObject({ kind: 'transportError', message: NETWORK_ERROR_MESSAGE });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api/client.test.ts`
Expected: FAIL (cannot resolve `./client`).

- [ ] **Step 3: Implement `client.ts`**

- The default `fetchFn` is `(input, init) => fetch(input, init)`.
- The timeout uses `AbortSignal.timeout(timeoutMs)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/api/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/
git commit -m "feat(frontend): add typed API client that keeps numbers as strings"
```

---

### Task 10: Display, Keypad and keyboard mapping

**Files:**
- Create: `frontend/src/components/Display.tsx`, `frontend/src/components/Keypad.tsx`, `frontend/src/calculator/keyboard.ts`
- Test: `frontend/src/components/Display.test.tsx`, `frontend/src/components/Keypad.test.tsx`, `frontend/src/calculator/keyboard.test.ts`

**Interfaces:**
- Consumes: `Action` (Task 8).
- Produces:
  - `export function Display(props: { expression: string; entry: string; rounded: boolean; error: string | null }): JSX.Element`
    - The root element has `aria-live="polite"`.
    - The entry is rendered in an element with class `display-entry`.
    - The badge text is exactly `≈ rounded to 34 digits`, shown only when `rounded && !error`.
    - `error` replaces the entry with an element of class `display-error`.
  - `export function Keypad(props: { onAction: (action: Action) => void; busy: boolean }): JSX.Element`
    - Every key is a `<button type="button">`.
    - The `=` key gets `aria-busy="true"` when `busy`.
  - `export function keyToAction(key: string): Action | null`

**Keys, in grid order.** Visible label → accessible name → action:

| Label | Name | Action |
|---|---|---|
| `AC` | clear | clear |
| `⌫` | backspace | backspace |
| `% of` | percent of | operator percent |
| `÷` | divide | operator divide |
| `√` | square root | sqrt |
| `xʸ` | power | operator power |
| `±` | toggle sign | toggleSign |
| `×` | multiply | operator multiply |
| `7` `8` `9` | the digit itself | digit |
| `−` | subtract | operator subtract |
| `4` `5` `6` | the digit itself | digit |
| `+` | add | operator add |
| `1` `2` `3` | the digit itself | digit |
| `=` | equals | equals (spans two rows) |
| `0` | the digit itself | digit (spans two columns) |
| `.` | decimal point | decimal |

- [ ] **Step 1: Write the failing tests**

```tsx
// Display.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Display } from './Display';

const TEN_THIRDS = '3.333333333333333333333333333333333';
describe('Display', () => {
  it('shows the expression and the full entry', () => {
    render(<Display expression="10 ÷ 3 =" entry={TEN_THIRDS} rounded={false} error={null} />);
    expect(screen.getByText('10 ÷ 3 =')).toBeInTheDocument();
    expect(screen.getByText(TEN_THIRDS)).toBeInTheDocument();
    expect(screen.queryByText('≈ rounded to 34 digits')).not.toBeInTheDocument();
  });
  it('shows the rounded badge', () => {
    render(<Display expression="" entry={TEN_THIRDS} rounded error={null} />);
    expect(screen.getByText('≈ rounded to 34 digits')).toBeInTheDocument();
  });
  it('replaces the entry with the error and hides the badge', () => {
    render(<Display expression="1250.75 ÷ 0 =" entry="0" rounded error="Cannot divide by zero." />);
    expect(screen.getByText('Cannot divide by zero.')).toBeInTheDocument();
    expect(screen.queryByText('≈ rounded to 34 digits')).not.toBeInTheDocument();
  });
  it('announces changes politely', () => {
    const { container } = render(<Display expression="" entry="0" rounded={false} error={null} />);
    expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite');
  });
});
```

```tsx
// Keypad.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Keypad } from './Keypad';
import type { Action } from '../calculator/reducer';

const cases: [string, Action][] = [
  ['clear', { type: 'clear' }], ['backspace', { type: 'backspace' }], ['percent of', { type: 'operator', operation: 'percent' }],
  ['divide', { type: 'operator', operation: 'divide' }], ['square root', { type: 'sqrt' }], ['power', { type: 'operator', operation: 'power' }],
  ['toggle sign', { type: 'toggleSign' }], ['multiply', { type: 'operator', operation: 'multiply' }], ['subtract', { type: 'operator', operation: 'subtract' }],
  ['add', { type: 'operator', operation: 'add' }], ['equals', { type: 'equals' }], ['decimal point', { type: 'decimal' }],
  ['7', { type: 'digit', digit: '7' }], ['0', { type: 'digit', digit: '0' }],
];
describe('Keypad', () => {
  it.each(cases)('"%s" dispatches its action', async (name, action) => {
    const onAction = vi.fn();
    render(<Keypad onAction={onAction} busy={false} />);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(onAction).toHaveBeenCalledWith(action);
  });
  it('shows the "% of" label', () => {
    render(<Keypad onAction={vi.fn()} busy={false} />);
    expect(screen.getByRole('button', { name: 'percent of' })).toHaveTextContent('% of');
  });
  it('marks = busy while a request is in flight', () => {
    render(<Keypad onAction={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: 'equals' })).toHaveAttribute('aria-busy', 'true');
  });
});
```

```ts
// keyboard.test.ts
import { describe, expect, it } from 'vitest';
import { keyToAction } from './keyboard';

describe('keyToAction', () => {
  it.each([
    ['7', { type: 'digit', digit: '7' }], ['.', { type: 'decimal' }],
    ['+', { type: 'operator', operation: 'add' }], ['-', { type: 'operator', operation: 'subtract' }],
    ['*', { type: 'operator', operation: 'multiply' }], ['/', { type: 'operator', operation: 'divide' }],
    ['^', { type: 'operator', operation: 'power' }], ['%', { type: 'operator', operation: 'percent' }],
    ['Enter', { type: 'equals' }], ['=', { type: 'equals' }], ['Backspace', { type: 'backspace' }], ['Escape', { type: 'clear' }],
  ])('maps %s', (key, action) => expect(keyToAction(key)).toEqual(action));
  it.each(['a', ',', ' ', 'Tab'])('ignores %s', (key) => expect(keyToAction(key)).toBeNull());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ src/calculator/keyboard.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `Display.tsx`, `Keypad.tsx` and `keyboard.ts`**

The Keypad takes its keys from a single array of `{ label, name, action, className? }` that follows the table above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat(frontend): add display, keypad and physical keyboard mapping"
```

---

### Task 11: History, Inspector and collapsible sections

**Files:**
- Create: `frontend/src/components/History.tsx`, `frontend/src/components/Inspector.tsx`, `frontend/src/components/Section.tsx`, `frontend/src/api/curl.ts`
- Test: `frontend/src/components/History.test.tsx`, `frontend/src/components/Inspector.test.tsx`, `frontend/src/components/Section.test.tsx`, `frontend/src/api/curl.test.ts`

**Interfaces:**
- Consumes: `HistoryEntry` (Task 8), `Exchange` and `CALCULATE_PATH` (Task 9).
- Produces:
  - `export function buildCurl(origin: string, body: string): string`
  - `export function Section(props: { title: string; children: ReactNode }): JSX.Element`
    - The toggle `<button>` carries the title, with `aria-expanded` and `aria-controls`.
    - The body has `hidden` while collapsed.
    - It starts collapsed.
    - On desktop, CSS (Task 12) always shows the body and turns the button into a plain heading.
  - `export function History(props: { entries: HistoryEntry[] }): JSX.Element`
    - Each row is a `<button>` with `title={result}` and `aria-expanded`. Clicking toggles class `history-row--open`.
    - The value text is `${rounded ? '≈ ' : ''}${result}`.
    - With no entries it shows `No calculations yet.`
  - `export function Inspector(props: { exchange: Exchange | null; origin?: string; clipboard?: Pick<Clipboard, 'writeText'> })`
    - Defaults: `window.location.origin` and `navigator.clipboard`.
    - Shows `POST /api/v1/calculate`, the request body `JSON.stringify(request)`, the status line, and the response (a string as-is, otherwise `JSON.stringify`).
    - The status line is `← ${status}`, or `← no response` when `status` is null.
    - Buttons: `Copy JSON` copies the request body. `Copy cURL` copies `buildCurl(origin, body)`.
    - After a click the label becomes `✓ Copied` for 1500 ms, or `Copy failed` if the clipboard is missing or rejects.
    - With no exchange it shows `No requests yet.` and the buttons are disabled.

- [ ] **Step 1: Write the failing tests**

```ts
// curl.test.ts
import { expect, it } from 'vitest';
import { buildCurl } from './curl';
it('builds a ready-to-run cURL command', () => {
  expect(buildCurl('http://localhost:8080', '{"operation":"divide","operands":["10","3"]}')).toBe(
    `curl -X POST http://localhost:8080/api/v1/calculate -H "Content-Type: application/json" -d '{"operation":"divide","operands":["10","3"]}'`,
  );
});
```

```tsx
// Section.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { Section } from './Section';
it('starts collapsed and toggles open', async () => {
  render(<Section title="History"><p>content</p></Section>);
  const toggle = screen.getByRole('button', { name: 'History' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('content').parentElement).toHaveAttribute('hidden');
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('content').parentElement).not.toHaveAttribute('hidden');
});
```

```tsx
// History.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { History } from './History';

const TEN_THIRDS = '3.333333333333333333333333333333333';
describe('History', () => {
  it('lists entries in the given order with the rounded prefix and full value on hover', () => {
    render(<History entries={[{ expression: '10 ÷ 3', result: TEN_THIRDS, rounded: true }, { expression: '15 % of 200', result: '30', rounded: false }]} />);
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('10 ÷ 3');
    expect(rows[0]).toHaveTextContent(`≈ ${TEN_THIRDS}`);
    expect(rows[0]).toHaveAttribute('title', TEN_THIRDS);
    expect(rows[1]).toHaveTextContent('30');
  });
  it('expands and collapses a row on click', async () => {
    render(<History entries={[{ expression: '√2', result: '1.414213562373095048801688724209698', rounded: true }]} />);
    const row = screen.getByRole('button');
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(row).toHaveClass('history-row--open');
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });
  it('has an empty state', () => {
    render(<History entries={[]} />);
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument();
  });
});
```

```tsx
// Inspector.test.tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inspector } from './Inspector';
import type { Exchange } from '../api/client';

const exchange: Exchange = { request: { operation: 'divide', operands: ['10', '3'] }, status: 200, response: { result: '3.3', rounded: true } };
const body = '{"operation":"divide","operands":["10","3"]}';
afterEach(() => vi.useRealTimers());

describe('Inspector', () => {
  it('shows the last exchange', () => {
    render(<Inspector exchange={exchange} origin="http://localhost:8080" clipboard={{ writeText: vi.fn() }} />);
    expect(screen.getByText('POST /api/v1/calculate')).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByText('← 200')).toBeInTheDocument();
    expect(screen.getByText('{"result":"3.3","rounded":true}')).toBeInTheDocument();
  });
  it('copies the request JSON and confirms for 1.5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn(async () => {});
    render(<Inspector exchange={exchange} origin="http://localhost:8080" clipboard={{ writeText }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    expect(writeText).toHaveBeenCalledWith(body);
    expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument();
  });
  it('copies a cURL command', async () => {
    const writeText = vi.fn(async () => {});
    render(<Inspector exchange={exchange} origin="http://localhost:8080" clipboard={{ writeText }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy cURL' }));
    expect(writeText).toHaveBeenCalledWith(`curl -X POST http://localhost:8080/api/v1/calculate -H "Content-Type: application/json" -d '${body}'`);
  });
  it('reports a clipboard failure', async () => {
    render(<Inspector exchange={exchange} origin="http://localhost:8080" clipboard={{ writeText: vi.fn(async () => { throw new Error('denied'); }) }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
  });
  it('shows a network failure and an empty state', () => {
    const { rerender } = render(<Inspector exchange={{ ...exchange, status: null, response: null }} origin="" clipboard={{ writeText: vi.fn() }} />);
    expect(screen.getByText('← no response')).toBeInTheDocument();
    rerender(<Inspector exchange={null} origin="" clipboard={{ writeText: vi.fn() }} />);
    expect(screen.getByText('No requests yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ src/api/curl.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `curl.ts`, `Section.tsx`, `History.tsx` and `Inspector.tsx`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat(frontend): add history, API inspector with copy JSON/cURL, and collapsible sections"
```

---

### Task 12: App composition, Ledger theme and responsive layout

**Files:**
- Create: `frontend/src/calculator/useCalculator.ts`, `frontend/src/styles.css`
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx` (replace the template)
- Delete: `frontend/src/index.css` (template)
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 8–11.
- Produces:
  - `export function useCalculator(api?: CalculateFn): { state: State; dispatch: Dispatch<Action>; exchange: Exchange | null }`. The default `api` is `calculate`.
    - When `state.pending` becomes non-null, it calls `api(pending.request)`.
    - It stores `outcome.exchange`.
    - It dispatches `resolved` on success, otherwise `failed` with `outcome.message`.
  - `export default function App(props: { api?: CalculateFn })`
    - Layout: `<main class="app">` holds a `<section class="calculator">` (Display + Keypad) and an `<aside class="side">` containing `<Section title="History">` and `<Section title="Last API request">`.
    - A `window` `keydown` listener skips events with `ctrlKey`, `metaKey` or `altKey`. For mapped keys it calls `preventDefault()` and dispatches. `preventDefault` on Enter also stops a focused key button from being activated a second time.

**`styles.css`**

Ledger tokens on `:root`:

| Token | Value |
|---|---|
| `--paper` | `#f4f1ea` |
| `--surface` | `#fffdf8` |
| `--edge` | `#e2dccf` |
| `--ink` | `#18201c` |
| `--muted` | `#7a756a` |
| `--fn` | `#ebe5d8` |
| `--fn-ink` | `#4d4a42` |
| `--op` | `#1f2a24` |
| `--op-ink` | `#f4f1ea` |
| `--equals` | `#1f7a4d` |
| `--equals-ink` | `#ffffff` |
| `--badge` | `#f9ebc4` |
| `--badge-ink` | `#7c5300` |
| `--error` | `#b42318` |
| `--font-ui` | `'IBM Plex Sans', system-ui, sans-serif` |
| `--font-num` | `'IBM Plex Mono', ui-monospace, monospace` |

Layout and typography:
- Numbers use `font-variant-numeric: tabular-nums`. The entry and the expression use `overflow-wrap: anywhere`, so they wrap and are never truncated.
- History values use `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, except in `.history-row--open`.
- Mobile first:
  - one column with a 16 px gutter;
  - sections collapsed;
  - visible `:focus-visible` outlines.
- At `@media (min-width: 768px)`:
  - `.app` becomes a grid `320px minmax(0, 1fr)`, `max-width: 880px`, centred;
  - `.section-body[hidden]` is `display: block`;
  - the section toggle loses its chevron and pointer behaviour.

**`main.tsx`** imports `@fontsource/ibm-plex-sans/400.css`, `/500.css`, `/600.css`, `@fontsource/ibm-plex-mono/500.css`, `/600.css` and `./styles.css`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import type { CalcOutcome } from './api/client';
import type { CalcRequest } from './calculator/types';

const TEN_THIRDS = '3.333333333333333333333333333333333';
type Canned = { result: string; rounded: boolean } | { code: string; message: string };
function fakeApi(results: Record<string, Canned>) {
  return vi.fn(async (request: CalcRequest): Promise<CalcOutcome> => {
    const r = results[JSON.stringify(request)];
    const exchange = { request, status: 'result' in r ? 200 : 422, response: r };
    return 'result' in r ? { kind: 'success', ...r, exchange } : { kind: 'apiError', ...r, exchange };
  });
}
const key = (name: string) => screen.getByRole('button', { name });

describe('App', () => {
  it('calculates from the keypad and fills history and inspector', async () => {
    const api = fakeApi({ '{"operation":"divide","operands":["10","3"]}': { result: TEN_THIRDS, rounded: true } });
    render(<App api={api} />);
    for (const name of ['1', '0', 'divide', '3', 'equals']) await userEvent.click(key(name));
    await waitFor(() => expect(screen.getByText('≈ rounded to 34 digits')).toBeInTheDocument());
    expect(document.querySelector('.display-entry')).toHaveTextContent(TEN_THIRDS);
    await userEvent.click(key('History')); // sections start collapsed; hidden rows are not in the a11y tree
    expect(screen.getByRole('button', { name: /10 ÷ 3/ })).toBeInTheDocument(); // history row
    expect(screen.getByText('{"operation":"divide","operands":["10","3"]}')).toBeInTheDocument();
  });

  it('accepts the physical keyboard', async () => {
    const api = fakeApi({ '{"operation":"add","operands":["2","3"]}': { result: '5', rounded: false } });
    render(<App api={api} />);
    await userEvent.keyboard('2+3{Enter}');
    await waitFor(() => expect(api).toHaveBeenCalledWith({ operation: 'add', operands: ['2', '3'] }));
  });

  it('Enter on a focused key evaluates once', async () => {
    const api = fakeApi({ '{"operation":"add","operands":["2","3"]}': { result: '5', rounded: false } });
    render(<App api={api} />);
    for (const name of ['2', 'add', '3']) await userEvent.click(key(name)); // focus stays on "3"
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith({ operation: 'add', operands: ['2', '3'] });
  });

  it('shows API errors in the display', async () => {
    const api = fakeApi({ '{"operation":"divide","operands":["1","0"]}': { code: 'DIVISION_BY_ZERO', message: 'Cannot divide by zero.' } });
    render(<App api={api} />);
    await userEvent.keyboard('1/0{Enter}');
    expect(await screen.findByText('Cannot divide by zero.')).toBeInTheDocument();
  });

  it('ignores shortcuts with modifier keys', async () => {
    render(<App api={fakeApi({})} />);
    await userEvent.keyboard('{Control>}1{/Control}');
    expect(document.querySelector('.display-entry')).toHaveTextContent(/^0$/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL (the template App has no keypad).

- [ ] **Step 3: Implement `useCalculator.ts`, `App.tsx`, `main.tsx` and `styles.css`**

- [ ] **Step 4: Run the full suite with coverage, plus type-check and lint**

Run: `npm run coverage && npm run typecheck && npm run lint`
Expected: PASS. Coverage meets the 85 % thresholds.

- [ ] **Step 5: Visual check in the browser pane**

- Start `go run ./cmd/server` (from `backend/`) and `npm run dev` (from `frontend/`), both in the background.
- Open `http://localhost:5173`. Check desktop and the mobile preset (`resize_window` `mobile`, then reset to `desktop`).
- Confirm:
  - `10 ÷ 3 =` shows a 34-digit result wrapping onto two lines on mobile, with the badge;
  - a long expression (`1.5E+40 × 3.333…`) wraps;
  - History truncates with `…`, shows the full value on hover, and expands on click;
  - Copy JSON and Copy cURL work;
  - mobile sections start collapsed;
  - Ledger colours and IBM Plex fonts load;
  - focus outlines are visible when tabbing.

Fix anything off before committing.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): compose calculator app with Ledger theme and responsive layout"
```

---

### Task 13: Full-stack Docker

**Files:**
- Create: `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx.conf`, `docker-compose.yml`

**Interfaces:**
- Consumes: the backend image (Task 6), with healthcheck command `["CMD", "/server", "healthcheck"]`; `npm run build` output in `frontend/dist`.
- Produces: `docker compose up --build` serves the app at `http://localhost:8080`.

- [ ] **Step 1: Write the files**

**`frontend/Dockerfile`**
- Build stage: `node:24-alpine`, with `npm ci` and then `npm run build`.
- Runtime stage: `nginxinc/nginx-unprivileged:alpine`. Copy `dist/` to `/usr/share/nginx/html` and `nginx.conf` to `/etc/nginx/conf.d/default.conf`. `EXPOSE 8080`.

**`.dockerignore`** lists `node_modules`, `dist` and `coverage`.

**`nginx.conf`**
- `listen 8080`
- `location /api/ { proxy_pass http://backend:8081; }`
- `location = /healthz { proxy_pass http://backend:8081; }`
- `location / { try_files $uri /index.html; }`
- `gzip on`, covering JS, CSS and JSON
- Headers: `X-Content-Type-Options nosniff`, `X-Frame-Options DENY`, `Referrer-Policy no-referrer`

**`docker-compose.yml`**
- `backend`: built from `./backend`, `PORT=8081`, not published to the host. Healthcheck: `test: ["CMD", "/server", "healthcheck"]`, `interval: 5s`, `timeout: 3s`, `retries: 5`.
- `web`: built from `./frontend`, `ports: ["8080:8080"]`, `depends_on: backend: condition: service_healthy`.

- [ ] **Step 2: Verify the full stack**

```bash
docker compose up --build -d
docker compose ps
curl -s -X POST localhost:8080/api/v1/calculate -H "Content-Type: application/json" -d '{"operation":"divide","operands":["10","3"]}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8080/api/v1/calculate -H "Content-Type: application/json" -d '{"operation":"divide","operands":["1","0"]}'
```
Expected:
- `backend` shows `healthy`;
- the first curl prints the rounded result JSON;
- the second prints `422`.

Open `http://localhost:8080` in the browser pane and do one calculation. Then run `docker compose down`.

- [ ] **Step 3: Commit**

```bash
git add frontend/Dockerfile frontend/.dockerignore frontend/nginx.conf docker-compose.yml
git commit -m "feat(docker): serve SPA via unprivileged nginx with API proxy and compose healthcheck"
```

---

### Task 14: Continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: backend `go test`; frontend `npm run lint`, `typecheck` and `coverage`; `docker compose build`.

- [ ] **Step 1: Write the workflow**

The workflow is named `CI` and runs `on: [push, pull_request]`. It has three jobs on `ubuntu-latest`:

- **`backend`** (working directory `backend`):
  - `actions/checkout@v4`
  - `actions/setup-go@v5` with `go-version-file: backend/go.mod`
  - `go vet ./...`
  - `go test -race -coverprofile=coverage.out ./...`
  - enforce the 90 % threshold:
    ```bash
    go tool cover -func=coverage.out | awk '/^total:/ { sub("%", "", $3); print "backend coverage: " $3 "%"; if ($3 + 0 < 90) exit 1 }'
    ```
- **`frontend`** (working directory `frontend`):
  - `actions/checkout@v4`
  - `actions/setup-node@v4` with `node-version: 24`, `cache: npm`, `cache-dependency-path: frontend/package-lock.json`
  - `npm ci`, `npm run lint`, `npm run typecheck`, `npm run coverage`
- **`docker`**:
  - `actions/checkout@v4`
  - `docker compose build`

- [ ] **Step 2: Verify locally**

Run the same commands each job runs: `go vet`, `go test -race` (if the Windows toolchain lacks cgo for `-race`, run without it and note that), the `awk` gate from Git Bash, the npm scripts, and `docker compose build`.
Expected: all succeed.

The workflow first runs on GitHub once the user pushes; say so in the hand-off.

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: run backend, frontend and docker build checks on every push"
```

---

### Task 15: Documentation, coverage snapshot and prompts hand-off

**Files:**
- Create: `README.md`, `docs/design/README.md`, `docs/design/calculator-layout.html`, `docs/design/layout-v2.html`, `docs/design/visual-style.html`, `docs/coverage/backend.html`, `docs/coverage/frontend/` (copied report), `docs/screenshots/desktop.png`, `docs/screenshots/mobile.png`
- Modify: `docs/prompts.md` (Session 2 entries, already appended during work)

- [ ] **Step 1: Preserve the mockups as process history (§7.1)**

- Copy the three fragments from `.superpowers/brainstorm/688-1793168241/content/`.
- Wrap each one in `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>…</style></head><body>…</body></html>`.
- Inline the viewer variables and classes each fragment uses (`--bg-tertiary`, `--bg-secondary`, `--border`, `--text-secondary`, `.cards`, `.card`, `.card-body`, `.label`, `.subtitle`, `h2`, `h3`). Take the values from the plugin's `skills/brainstorming/scripts/frame-template.html`.
- Remove every `onclick="toggleSelect(this)"`.
- Write `docs/design/README.md` (English, about 10 lines). It says these are Spanish-language exploration mockups from the Superpowers brainstorming session, lists what was chosen (layout Option C v2, Ledger theme), and points to the spec as the source of truth.

Verify: open each file in the browser pane; each renders without the viewer.

- [ ] **Step 2: Generate the coverage snapshot**

```bash
cd backend && go test ./... -coverprofile=coverage.out && go tool cover -html=coverage.out -o ../docs/coverage/backend.html && go tool cover -func=coverage.out | tail -1
cd ../frontend && npm run coverage && rm -rf ../docs/coverage/frontend && cp -r coverage ../docs/coverage/frontend
```
Record both totals for the README.

- [ ] **Step 3: Capture screenshots**

- With `docker compose up -d` running, open `http://localhost:8080` in the browser pane after doing `10 ÷ 3 =` and `√2`.
- Take one screenshot at desktop size and one with the `mobile` preset, at scale 1.
- Copy the saved image files to `docs/screenshots/desktop.png` and `mobile.png`.
- If the pane can't produce files, ask the user for two screenshots instead of skipping this step.

- [ ] **Step 4: Write `README.md`** (English, following §9)

1. Title, one-paragraph pitch, screenshot.
2. **Quick start:** `docker compose up --build`, then open `http://localhost:8080`.
3. **Running locally:** prerequisites (Go 1.27, Node 24), backend `go run ./cmd/server`, frontend `npm install && npm run dev`.
4. **API reference:**
   - endpoint and shapes;
   - operations table (§6.3);
   - error catalogue (§6.4);
   - `curl` examples for 200 (`divide 10 3`), 400 (`[null,"2"]`), 413 (an oversized body made with `head -c 2000 /dev/zero | tr '\0' ' '`) and 422 (`divide 1 0`), each with its real response;
   - a note that the commands target bash/zsh, and that on Windows you should use Git Bash or `curl.exe` with escaped quotes.
5. **Design decisions** (one short paragraph each):
   - decimal128 via apd, and why not floats or `shopspring/decimal`;
   - strings on the wire;
   - 34 digits, half-even, the `rounded` flag;
   - magnitude-based notation and the round-trip invariant;
   - abuse limits, including the `1^7000` trade-off;
   - layers without empty service/repository layers;
   - the error shape, and that production would use RFC 9457;
   - the left-to-right keypad and the "% of" key;
   - a single Ledger theme;
   - distroless with a healthcheck mode.
6. **Testing & coverage:** commands, a table with the totals from Step 2, and links to `docs/coverage/`.
7. **Project structure:** tree.
8. **How this was built:** the Superpowers workflow (brainstorming with the visual companion, then the spec, builder check, this plan, TDD implementation and review), linking to `docs/design/`, `docs/superpowers/specs/`, `docs/superpowers/plans/` and `docs/prompts.md`.
9. **Assumptions & future work:** RFC 9457, persisting history, an expression parser with precedence, rate limiting.

Verify: run every command in the README once and paste the real outputs into it.

- [ ] **Step 5: Commit the docs (without the prompts log)**

```bash
git add README.md docs/design/ docs/coverage/ docs/screenshots/
git commit -m "docs: add README, design history, coverage snapshot and screenshots"
```

- [ ] **Step 6: Hand the prompts log to the user**

- Make sure `docs/prompts.md` has every Session 2 prompt, verbatim with translations.
- Ask the user to review it.
- Only after their explicit approval:
  ```bash
  git add docs/prompts.md
  git commit -m "docs: add prompts log"
  ```
- Then tell the user the branch is ready to push. Do not push.
