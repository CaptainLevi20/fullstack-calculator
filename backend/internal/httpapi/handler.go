// Package httpapi exposes the calculator over HTTP with JSON bodies.
package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"fullstack-calculator/backend/internal/calculator"
)

const maxBodyBytes = 1024

type calculateRequest struct {
	Operation string    `json:"operation"`
	Operands  []*string `json:"operands"`
}

type calculateResponse struct {
	Result  string `json:"result"`
	Rounded bool   `json:"rounded"`
}

// NewHandler returns the API's root handler, wrapped with panic recovery and
// request logging.
func NewHandler(logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", handleCalculate)
	mux.HandleFunc("/api/v1/calculate", methodNotAllowed("POST"))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/healthz", methodNotAllowed("GET"))
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, codeNotFound, "Not found.")
	})
	return withRecovery(logger, withRequestLog(logger, mux))
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, codePayloadTooLarge, "Request body must not exceed 1 KB.")
			return
		}
		writeError(w, http.StatusBadRequest, codeInvalidJSON, invalidJSONMessage)
		return
	}

	req, ok := decodeCalculateRequest(body)
	if !ok {
		writeError(w, http.StatusBadRequest, codeInvalidJSON, invalidJSONMessage)
		return
	}

	// A null operand becomes "", which the domain reports as INVALID_NUMBER
	// with the operand's position.
	operands := make([]string, len(req.Operands))
	for i, o := range req.Operands {
		if o != nil {
			operands[i] = *o
		}
	}

	res, err := calculator.Calculate(calculator.Operation(req.Operation), operands)
	if err != nil {
		var domain *calculator.Error
		if errors.As(err, &domain) {
			writeError(w, statusFor(domain.Code), string(domain.Code), domain.Message)
			return
		}
		writeError(w, http.StatusInternalServerError, codeInternalError, internalErrorMessage)
		return
	}
	writeJSON(w, http.StatusOK, calculateResponse{Result: res.Value, Rounded: res.Rounded})
}

const (
	invalidJSONMessage   = `Request body must be a JSON object with "operation" and "operands".`
	internalErrorMessage = "Internal server error."
)

// decodeCalculateRequest accepts exactly one JSON object with known fields.
func decodeCalculateRequest(body []byte) (calculateRequest, bool) {
	var req calculateRequest
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return req, false
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return req, false
	}
	return req, true
}

func methodNotAllowed(allow string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", allow)
		writeError(w, http.StatusMethodNotAllowed, codeMethodNotAllowed, "Method not allowed.")
	}
}
