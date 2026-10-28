# Full-Stack Calculator — Design

- **Date:** 2026-10-28
- **Status:** Approved by the user on 2026-10-28
- **Source brief:** [`full-stack-calculator-assignment.md`](../../../full-stack-calculator-assignment.md)
- **Context:** Technical assessment for Sezzle (Software Engineer II, LATAM). The brief asks for roughly 2–4 hours of work.

---

## 1. Intent

The reader of this repository is an engineer at a payments fintech. They will spend a few minutes with it. In the first five minutes they should come away thinking:

1. **"This person handles fintech standards."** Binary floating point never touches the calculation path. Numbers cross the wire as strings so the browser never turns them into IEEE-754 doubles. Errors come back as clean JSON with semantically correct HTTP status codes.
2. **"The architecture is solid without being bloated."** A monorepo with `/backend` and `/frontend`, and clearly separated layers in Go.
3. **"This is production quality."** Unit tests written test-first in both layers. They cover the edge cases explicitly: division by zero, null or garbage input, and overflow.
4. **"They use their tools well."** The README is excellent: it starts the whole stack with one Docker command, explains the design decisions, and documents how the work was done with Superpowers.

## 2. Goals, non-goals, anti-goals

### Goals
- Required operations: add, subtract, multiply, divide.
- Optional operations, all included: power, square root, percentage ("A % of B").
- Decimal arithmetic with IEEE 754 **decimal128 semantics**: 34 significant digits, round-half-even, exponent range −6143…+6144.
- A React + TypeScript UI (layout "Option C v2", theme "Ledger", see §7) that is intuitive, responsive and validates input before sending.
- Unit tests and coverage reports for both layers: **≥ 90 % backend, ≥ 85 % frontend**.
- `docker compose up --build` runs the full stack.
- GitHub Actions CI runs both test suites on every push.
- An English README covering setup, running, API examples, design decisions and the AI workflow.

### Non-goals
- Persistence, authentication, user accounts.
- Light/dark theme switching. There is exactly one theme.
- Internationalisation. All UI text, API messages and docs are in English.
- Operator precedence or expression parsing. The keypad evaluates left to right (§7.2).
- Memory keys (M+, MR…), history that survives a page reload, or typing scientific notation from the keypad.

### Anti-goals (would make this a failure even if it works)
- **Over-engineering.** No empty "service" or "repository" layers, no interfaces that exist only to look architectural, no DI frameworks. The brief rewards clarity over extras.
- **A float anywhere a number is carried.** That includes JavaScript `Number` for operands or results on the frontend.
- **Silent precision loss.** If a result was rounded, the API and the UI must both say so.
- **Ambiguous errors.** No plain-text error bodies and no 500s for user mistakes.
- Blowing the time budget on polish nobody asked for.

## 3. Constraints

| Area | Decision |
|---|---|
| Backend language | Go 1.27 (installed locally). Standard library `net/http` with Go 1.22+ method/pattern routing. **No web framework.** |
| Decimal library | `github.com/cockroachdb/apd/v3`. Chosen over `shopspring/decimal` because it has `Sqrt` and `Pow` with a configurable context, and its exponent limits and condition flags give overflow and inexactness detection without custom code. |
| Frontend | React + TypeScript, built with Vite. Plain CSS, no component library. |
| Frontend tests | Vitest + React Testing Library, v8 coverage. |
| Local toolchain | Node 24.18, npm 11.16, Docker 29.7, Compose v5.5, Git 2.55 (all verified on the user's machine). |
| Language | English everywhere the evaluator looks: UI, API messages, README, code, commits. |

## 4. Repository layout

```
/
├── backend/
│   ├── cmd/server/            # main: config, wiring, graceful shutdown, healthcheck mode
│   ├── internal/calculator/   # pure domain: parsing, operations, formatting, domain errors
│   ├── internal/httpapi/      # handlers, JSON encode/decode, error mapping, middleware
│   ├── go.mod
│   └── Dockerfile
├── frontend/
│   ├── src/                   # components, keypad reducer, API client, styles
│   ├── nginx.conf
│   ├── vite.config.ts
│   ├── package.json
│   └── Dockerfile
├── docs/
│   ├── superpowers/specs/     # this document
│   ├── superpowers/plans/     # implementation plan (next step)
│   ├── design/                # final mockups from the brainstorming session
│   ├── coverage/              # committed snapshot of the HTML coverage reports
│   └── prompts.md             # prompts used during the work (the brief requires sharing them)
├── .github/workflows/ci.yml
├── docker-compose.yml
├── .gitignore                 # must include .superpowers/ (holds a local session key)
└── README.md
```

## 5. Numeric model (the shared contract)

### 5.1 Arithmetic context
All arithmetic runs through one `apd.Context`:

- `Precision: 34`
- `Rounding: apd.RoundHalfEven`
- `MaxExponent: 6144`, `MinExponent: -6143`

After every operation the condition flags are inspected:

- `Inexact` → the result was rounded → `rounded: true`. Use `Inexact`, not apd's `Rounded`. `Rounded` is also raised when only trailing zeros are dropped, which is not a loss of value.
- `Overflow` or `Underflow` → `RESULT_OUT_OF_RANGE`.
- `DivisionByZero` / `DivisionUndefined` → `DIVISION_BY_ZERO`.
- `InvalidOperation` → mapped to the specific domain error that caused it (for example the square root of a negative number). It must never leak out as a 500.

### 5.2 Numbers on the wire are JSON strings
Operands and results are always JSON strings (`"0.1"`), never JSON numbers.

**Accepted operand grammar** (backend is strict; the frontend never produces anything else):

```
-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?
```

- Plain notation is what the keypad produces. Scientific notation is accepted because a result such as `"1.5E+40"` can come back as an operand when the user chains operations.
- At most **34 digits in the coefficient**, not counting leading zeros. `"0.000001"` has 1; `"1.000"` has 4.
- The value must fall inside the decimal128 range.
- Rejected with `400 INVALID_NUMBER`: `null`, `""`, whitespace, a leading `+`, `.5`, `5.`, leading zeros such as `007`, thousands separators, `NaN`, `Infinity`, hex, more than 34 coefficient digits, out-of-range exponents.
- An operand sent as a JSON number (`3` instead of `"3"`) is a type error → `400 INVALID_JSON`.

### 5.3 Result formatting
The choice between plain and scientific notation depends on the result's **magnitude**, not on the length of the string. Let *adj* be the adjusted exponent: the power of ten of the leading digit, so `1234` has adj = 3 and `0.00123` has adj = −3.

- **Plain notation when −6 ≤ adj ≤ 33.** The integer part then has at most 34 digits, and there are at most six zeros between the point and the first significant digit. A plain string may run past 34 characters. Leading zeros don't count toward the operand digit limit (§5.2), so such a string still round-trips.
- **Scientific notation otherwise**, with one digit before the point and an explicit exponent sign: `1.5E+40`, `1E-7`, `3.333333333333333333333333333333333E-8`.
- Strip trailing fractional zeros (`"2.50"` → `"2.5"`, `"3.0"` → `"3"`). Integer zeros are kept as written (`1E+20` → `"100000000000000000000"`).
- Render negative zero as `"0"`.

Examples:

| Value | Rendered |
|---|---|
| 1000 | `1000` |
| 1 ÷ 30 | `0.03333333333333333333333333333333333` |
| 0.000001 | `0.000001` |
| 0.0000001 | `1E-7` |
| 10⁴⁰ | `1E+40` |

**Round-trip invariant:** every result string the API returns must be accepted as an operand by the same API, including subnormal values close to the bottom of the decimal128 range. The operand range check in §5.2 must therefore cover the full decimal128 range, subnormals included. One test must assert this explicitly.

### 5.4 Reference results (also test cases)

| Input | Result | `rounded` |
|---|---|---|
| `0.1 + 0.2` | `0.3` | false |
| `10 ÷ 3` | `3.333333333333333333333333333333333` | true |
| `2 ÷ 3` | `0.6666666666666666666666666666666667` | true |
| `1 ÷ 30` | `0.03333333333333333333333333333333333` | true |
| `1250.75 ÷ 3` | `416.9166666666666666666666666666667` | true |
| `√2` | `1.414213562373095048801688724209698` | true |
| `15 % of 200` | `30` | false |

## 6. Backend

### 6.1 Layers
Dependencies point inward only: `cmd/server` → `internal/httpapi` → `internal/calculator`. The calculator package knows nothing about HTTP or JSON.

- **`internal/calculator`** is the pure domain. It owns:
  - operand parsing and validation (§5.2);
  - the operation set and each operation's arity;
  - the apd context and condition handling (§5.1);
  - result formatting (§5.3);
  - the domain errors, each carrying a stable error code.

  Unknown operations and wrong operand counts are domain errors too. That way the HTTP layer only decodes and maps.
- **`internal/httpapi`** decodes and validates the request shape, calls the domain, maps domain errors to HTTP status codes, and writes JSON. It also holds the middleware: body-size limit, panic recovery (→ `500 INTERNAL_ERROR`) and structured request logging with `log/slog`.
- **`cmd/server`** reads `PORT` (default `8081`), builds the mux, sets server timeouts (`ReadHeaderTimeout` and friends) and shuts down gracefully on SIGINT/SIGTERM. It also offers a **healthcheck mode** (for example `server healthcheck`) that GETs `/healthz` on localhost and exits 0 or 1. The runtime image is distroless and has no shell, `curl` or `wget`, so this is how Compose checks health.

There is deliberately no service layer and no repository. There is no state to manage or persist, and adding them would be ceremony (anti-goal).

### 6.2 Endpoints

| Method & path | Purpose |
|---|---|
| `POST /api/v1/calculate` | Perform one operation. |
| `GET /healthz` | Liveness: `200 {"status":"ok"}`. |
| Any other method on `/api/v1/calculate` | `405 METHOD_NOT_ALLOWED` (JSON body, `Allow: POST` header). |
| Any other path | `404 NOT_FOUND` (JSON body). |

Every response, success or error, is `Content-Type: application/json`.

**Request**
```json
{ "operation": "divide", "operands": ["10", "3"] }
```

**Success — 200**
```json
{ "result": "3.333333333333333333333333333333333", "rounded": true }
```

**Error — any non-2xx**
```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "Cannot divide by zero." } }
```

`code` is stable and machine-readable (`UPPER_SNAKE_CASE`). `message` is a short English sentence, safe to show end users as-is; the frontend displays it directly. The README notes that a production API would adopt RFC 9457 Problem Details. It was left out here on purpose to keep the shape simple.

### 6.3 Operations

| `operation` | Operands | Semantics | Operation-specific errors |
|---|---|---|---|
| `add` | 2 | a + b | out of range |
| `subtract` | 2 | a − b | out of range |
| `multiply` | 2 | a × b | out of range |
| `divide` | 2 | a ÷ b | b = 0 → `DIVISION_BY_ZERO` |
| `power` | 2 | aᵇ; b must be an integer with \|b\| ≤ 6000 | b not an integer → `NON_INTEGER_EXPONENT`; \|b\| > 6000 → `RESULT_OUT_OF_RANGE`, **checked before apd computes anything**; 0 to a negative power → `DIVISION_BY_ZERO`; 0⁰ = 1 |
| `sqrt` | 1 | √a | a < 0 → `NEGATIVE_SQUARE_ROOT` |
| `percent` | 2 | "a % of b" = a × b ÷ 100 | out of range |

Any operation whose result leaves the decimal128 range returns `RESULT_OUT_OF_RANGE`.

**Accepted trade-off (approved):** the ±6000 exponent pre-check also rejects trivially safe inputs such as `1^7000`. It is a deliberate DoS guard and will be documented as such in the README.

### 6.4 Error catalogue

| HTTP | `code` | When |
|---|---|---|
| 400 | `INVALID_JSON` | Body is not valid JSON; wrong field types (for example an operand sent as a number); unknown fields (`DisallowUnknownFields`); trailing data after the JSON value. |
| 400 | `UNKNOWN_OPERATION` | `operation` missing or not in §6.3. |
| 400 | `INVALID_OPERAND_COUNT` | `operands` missing, or its length doesn't match the operation's arity. |
| 400 | `INVALID_NUMBER` | An operand is `null`, empty, malformed, has more than 34 digits or is out of range (§5.2). The message names the offending operand's position. |
| 404 | `NOT_FOUND` | Unknown path. |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method on a known path. |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 1 KB (`http.MaxBytesReader`). |
| 422 | `DIVISION_BY_ZERO` | See §6.3. |
| 422 | `NEGATIVE_SQUARE_ROOT` | See §6.3. |
| 422 | `NON_INTEGER_EXPONENT` | See §6.3. |
| 422 | `RESULT_OUT_OF_RANGE` | Result outside decimal128, or the power exponent's magnitude exceeds 6000. |
| 500 | `INTERNAL_ERROR` | Recovered panic or unexpected failure. Never caused by user input. |

The rule of thumb: **400 = the request is malformed; 422 = the request is well-formed but the maths can't produce an answer.**

### 6.5 Abuse limits (summary)
- Request body ≤ 1 KB → otherwise 413.
- Operands ≤ 34 coefficient digits and within decimal128 range → otherwise 400.
- Power exponent magnitude ≤ 6000, checked before computing → otherwise 422.
- Results within decimal128 range → otherwise 422.
- HTTP server read/write/idle timeouts.

## 7. Frontend

### 7.1 Screen — "Option C v2", Ledger theme
**This section is the source of truth for the UI.** The brainstorming mockups were exploration. They are in Spanish, `layout-v2.html` uses the rejected Graphite theme, and where they differ from this section, this section wins.

**`docs/design/`** stores the brainstorming mockups as *process history*, not as a spec:
- The fragments `calculator-layout.html`, `layout-v2.html` and `visual-style.html` are copied from `.superpowers/brainstorm/…/content/`.
- Each copy is wrapped so it renders on its own. That means inlining the viewer's CSS variables and classes, and removing the `toggleSelect()` handlers. The content stays as it was.
- A short `docs/design/README.md` (English) explains that these are Spanish-language exploration artifacts from the Superpowers brainstorming session, and points to this spec as the final word.
- The final look is shown in the main README with screenshots of the finished app (desktop and mobile), taken at the end of implementation.

The theme is **Ledger**.

**Layout**
- **Desktop/tablet:** two columns. The calculator (display + keypad) sits on the left. The right side panel holds **History** above the **Inspector**.
- **Mobile:** one column. History and Inspector become collapsible sections under the keypad, **collapsed by default**. They never open by themselves, not even on error.

**Display**
- An expression line (for example `10 ÷ 3 =`) above the result.
- Long results **wrap** onto extra lines (34 digits take two lines on a phone). They are never truncated or shrunk.
- A badge reading **`≈ rounded to 34 digits`** appears when `rounded` is true.
- An error replaces the result with the API's `message`, in red. The next key press clears it.

**Keypad**, four columns, key labels exactly:

```
AC    ⌫     % of   ÷
√     xʸ    ±      ×
7     8     9      −
4     5     6      +
1     2     3      =   (= spans two rows)
0 (spans two)  .
```

**History**
- Kept in memory for the current session only, newest first, with a bounded length.
- Each row shows the expression and the result. Rounded results get a `≈` prefix.
- Long results are truncated with an ellipsis. Hovering shows the full value. Clicking or tapping toggles an inline expanded view with the full value. Touch screens have no hover, so tapping is the way in on mobile.

**Inspector**
- Shows the last API exchange: method and path, request body, status line and response body.
- Has two buttons:
  - **Copy JSON** copies the request body.
  - **Copy cURL** copies a ready-to-run command built from `window.location.origin`, so it works the same under Docker and in dev:
    `curl -X POST <origin>/api/v1/calculate -H "Content-Type: application/json" -d '<request body>'`
- Both show `✓ Copied` briefly. If the clipboard is unavailable they show a failure state instead of throwing.

**Ledger theme**, starting tokens from the mockup:

| Token | Value |
|---|---|
| paper background | `#f4f1ea` |
| surface | `#fffdf8` |
| border | `#e2dccf` |
| ink | `#18201c` |
| muted text | `#7a756a` |
| function keys | `#ebe5d8` on `#4d4a42` text |
| operator keys | `#1f2a24`, light text |
| equals | `#1f7a4d`, white text |
| rounded badge | `#f9ebc4` with `#7c5300` text |

- Fonts: **IBM Plex Sans** for the UI and **IBM Plex Mono** for every number, with tabular figures. Fonts are **self-hosted** through npm (`@fontsource/*`), never loaded from a CDN at runtime.
- One light theme only.

**Accessibility**
- The display is an `aria-live="polite"` region.
- Every key is a real `<button>` with a spoken name (`aria-label="divide"`, `"square root"`, `"percent of"`…).
- Focus is visible, and colour contrast meets WCAG AA. The builder picks the error red.

### 7.2 Input and keypad behaviour
Keypad logic lives in a **pure reducer/state machine** with no React imports, so it can be tested on its own. The components only dispatch actions and render state.

**Numbers are strings end to end.** Operands and results are never converted to JS `Number`.

**Entry rules**
- Digits append.
- Only one decimal point. Pressing `.` first gives `0.`.
- No leading zeros: `0` then `5` gives `5`.
- `±` toggles the sign of the current number.
- `⌫` deletes the last character of the number being typed.
- At most **34 digits per operand**. Extra digits are ignored, so the user can never type something the API would reject.
- A trailing `.` is dropped before sending (`5.` → `5`).

**Physical keyboard**
- It goes through the same filter as the buttons.
- Mapping: digits, `.`, `+`, `-`, `*`, `/`, `^` (power), `%` (percent of), `Enter` or `=` (equals), `Backspace` (⌫), `Escape` (AC).
- Every other key is ignored.
- Paste is not supported.

**Binary operators** (`+ − × ÷ xʸ % of`)
- They evaluate **strictly left to right, with no precedence**.
- If an operator is pressed while an operation already has both operands, that operation is first sent to the API. Its result then becomes the first operand of the new operation. For example, `2 + 3 ×` computes `5`, then waits for the next number.
- Pressing an operator right after another one replaces it.

**Unary `√`.** Applies immediately to the number currently shown, with one API call.

**`=`**
- Evaluates the pending operation.
- Pressing `=` again does nothing; it does not repeat the last operation.
- After a result:
  - a digit starts a fresh number;
  - an operator chains with the result as the first operand;
  - `√` applies to the result.
- A result may be in scientific notation (`1.5E+40`) and is sent back verbatim.

**Loading**
- While a request is in flight, input is ignored and `=` shows a busy state.
- There are no double submissions.

**Errors**
- An API error shows its `message`.
- A network failure shows a fixed message (for example "Can't reach the server. Try again.").
- The next key press after an error resets the calculator to a fresh state.

### 7.3 API client
- A small typed wrapper around `fetch` posts to the relative path `/api/v1/calculate`. Vite proxies it in dev and nginx in Docker, so no CORS is needed.
- It returns a discriminated union: success `{ result: string; rounded: boolean }`, API error `{ code; message; status }`, or network error.
- It also records the request and response the Inspector displays.

## 8. Testing strategy (TDD)

Red → green → refactor for every unit. Where it's practical, the commit history should show tests landing before or with the code they drive.

### Backend (`go test`)
- **`internal/calculator`**, table-driven tests:
  - every operation;
  - the §5.4 reference results;
  - a round-half-even tie case;
  - division by zero;
  - √ of a negative;
  - a non-integer exponent;
  - an exponent magnitude of 6001, and `1^7000` (the accepted trade-off);
  - overflow, for example `9.999…E+6144 × 10`;
  - underflow;
  - 0⁰ and 0 to a negative power;
  - the full operand grammar (valid and invalid cases from §5.2, 34 vs 35 digits);
  - the formatting rules from §5.3.
- **`internal/httpapi`** with `httptest`:
  - every status code in §6.4, with the exact JSON body;
  - the 1 KB limit;
  - unknown fields, trailing data, a `null` operand, a numeric operand;
  - JSON 404/405 responses;
  - the `Content-Type` header;
  - recovery from a panic.
- CI runs `go vet` and `go test -race -coverprofile`. HTML via `go tool cover -html`.
- **Target ≥ 90 %.**

### Frontend (Vitest + Testing Library)
- **Reducer:** every entry rule, the 34-digit cap, decimal and sign handling, chaining, operator replacement, unary √, behaviour after a result, error reset and loading lockout.
- **API client:** mocked `fetch` for success, each error class and network failure.
- **Components:**
  - display wrapping, badge and error;
  - keypad clicks and the physical keyboard;
  - history truncation, expansion and the hover title;
  - Inspector Copy JSON and Copy cURL with a mocked clipboard, including the failure path;
  - mobile collapsible sections.
- Coverage uses v8, with **thresholds enforced in the Vitest config (≥ 85 %)** so CI fails if coverage drops.

### Coverage deliverable
- The README has a summary table of backend and frontend coverage.
- An HTML snapshot of both reports is committed under `docs/coverage/` so the evaluator can open it without running anything.

### CI (`.github/workflows/ci.yml`)
On every push and pull request, two jobs run:
- **Go:** vet, then tests with race detector and coverage.
- **Frontend:** `npm ci`, type-check, tests with coverage thresholds.

## 9. Delivery

### Docker
- **`backend/Dockerfile`:** multi-stage. It builds with `golang:1.27` (`CGO_ENABLED=0`, static binary) and runs on `gcr.io/distroless/static-debian12:nonroot`, so the container never runs as root.
- **`frontend/Dockerfile`:** multi-stage. It builds with `node:24-alpine` (`npm ci && npm run build`) and serves with an unprivileged nginx image (`nginxinc/nginx-unprivileged:alpine`) on port 8080.
- **`frontend/nginx.conf`:**
  - serves the SPA;
  - proxies `/api/` and `/healthz` to `backend:8081`;
  - enables gzip;
  - adds basic security headers.
- **`docker-compose.yml`:**
  - `backend` is not published to the host. Its healthcheck uses the binary's healthcheck mode.
  - `web` publishes `8080:8080` and `depends_on` the backend being healthy.
  - Result: `docker compose up --build`, then open `http://localhost:8080`.

### Local development without Docker
- Backend: `go run ./cmd/server` (port 8081).
- Frontend: `npm run dev`, with the Vite dev server proxying `/api` to `http://localhost:8081`.

### README (English), in this order
1. **Quick start:** one Docker command and the URL.
2. **Running locally** without Docker.
3. **API reference:** endpoint, request/response shapes, operations table, error catalogue, and `curl` examples for 200, 400, 413 and 422.
4. **Design decisions:**
   - decimal128 via apd, and why not `shopspring/decimal` or floats;
   - strings on the wire;
   - 34 digits with half-even rounding, and the `rounded` flag;
   - abuse limits and the `1^7000` trade-off;
   - layering without empty service/repository layers;
   - the error shape and the RFC 9457 note;
   - the left-to-right keypad;
   - a single theme.
5. **Testing & coverage:** commands and the summary table.
6. **Project structure.**
7. **How this was built:**
   - the Superpowers workflow (brainstorming with visual mockups → this design doc → TDD implementation plan → implementation → review);
   - links to `docs/design/`, `docs/superpowers/` and `docs/prompts.md`.
8. **Assumptions & future work.**

### Prompts log (`docs/prompts.md`)
- List every prompt the user wrote, in chronological order, grouped by session (Session 1 — Design; Session 2 — Implementation).
- Keep each prompt **verbatim in its original Spanish**, followed by an English translation and a one-line English note on what it was answering. The assistant's replies are not reproduced.
- An appendix lists the prompts the assistant sent to subagents.
- Session 1 is already recorded. During implementation, append each new user prompt as it happens. Don't reconstruct them at the end.
- **The user reviews the file before the final commit.** Implementation must not commit changes to `docs/prompts.md` without that review.

### Git
- Initialise the repository at the project root on `main`.
- Make small commits that follow the TDD cycle.
- Never push without the user's explicit go-ahead.

## 10. Who decided what

**Decided by the user**
- Monorepo with `/backend` and `/frontend`.
- Go layers `cmd/server` / `internal/calculator` / `internal/httpapi`, with no service or repository layer.
- Decimal arithmetic, strings on the wire, abuse limits. Overflow is defined as explicit limits.
- A simple JSON error shape with 400/422, instead of full RFC 9457, plus a README note.
- 34 digits, round-half-even, the `rounded` flag.
- Go stdlib router, `cockroachdb/apd`, a single `POST` endpoint, Docker + nginx.
- Include power, √ and percent.
- English for UI, API and docs.
- Layout Option C v2, including:
  - truncated history that expands on hover or click;
  - Copy JSON and Copy cURL;
  - the "% of" key;
  - left-to-right chaining;
  - immediate √;
  - results wrapping to two lines on mobile.
- A single theme, no light/dark switching.
- Body limit 1 KB, operands ≤ 34 digits, scientific notation accepted when chaining.
- Power exponent limit ±6000 → 422 `RESULT_OUT_OF_RANGE`, accepting that `1^7000` is rejected.
- Coverage targets ≥ 90 % backend and ≥ 85 % frontend, GitHub Actions, multi-stage non-root Docker, the README structure.
- `docs/prompts.md`: verbatim Spanish prompts with English translations, both sessions, logged chronologically, reviewed by the user before the final commit.
- Accepted the assistant's fixes after the builder check: the magnitude rule for scientific notation, mockups kept as history, keypad edge cases left to the builder.

**Calls made by the assistant (open to override)**
- Ledger over Midnight Mint (the user deferred).
- `413 PAYLOAD_TOO_LARGE` for oversized bodies.
- JSON bodies for 404 and 405.
- The binary's healthcheck mode, needed because of distroless.
- The exact error-code names in §6.4.
- 0⁰ = 1.
- Pressing `=` repeatedly does nothing.
- Any key after an error resets the calculator.
- Paste not supported.
- Mobile sections stay collapsed even on error.
- Fonts self-hosted via `@fontsource`.
- The coverage HTML snapshot is committed under `docs/coverage/`.
- Copy JSON copies the request body.
- The exact magnitude threshold for scientific notation (−6 ≤ adj ≤ 33, §5.3) and the round-trip invariant.
- How the mockups are wrapped in `docs/design/` and labelled.

## 11. Left to the builder
- Exact Go type and function signatures, and file names inside each package.
- React component breakdown and CSS organisation.
- Exact user-facing copy for each error message, within the tone of §6.2.
- The history length cap.
- An optional keyboard shortcut for √.
- The exact error red, provided it meets AA contrast.
- Whether CI also builds the Docker images, and whether it enforces the backend 90 % threshold or only reports it.
- Keypad edge cases not covered in §7.2: `⌫` or `±` on a result, and `√` while a binary operation is pending. They must stay consistent with the rules there.
- A fetch timeout, so input can't stay locked forever.
- Exactly which exchanges are added to History (successful results at minimum).
