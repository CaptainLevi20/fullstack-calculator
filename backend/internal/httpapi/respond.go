package httpapi

import (
	"encoding/json"
	"net/http"

	"fullstack-calculator/backend/internal/calculator"
)

// HTTP-level error codes. Domain codes come from the calculator package.
const (
	codeInvalidJSON      = "INVALID_JSON"
	codePayloadTooLarge  = "PAYLOAD_TOO_LARGE"
	codeNotFound         = "NOT_FOUND"
	codeMethodNotAllowed = "METHOD_NOT_ALLOWED"
	codeInternalError    = "INTERNAL_ERROR"
)

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type errorResponse struct {
	Error errorBody `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: errorBody{Code: code, Message: message}})
}

// statusFor maps a domain error code to its HTTP status: 400 when the request
// is malformed, 422 when it is well-formed but the maths has no answer.
func statusFor(code calculator.Code) int {
	switch code {
	case calculator.CodeUnknownOperation, calculator.CodeInvalidOperandCount, calculator.CodeInvalidNumber:
		return http.StatusBadRequest
	case calculator.CodeDivisionByZero, calculator.CodeNegativeSquareRoot,
		calculator.CodeNonIntegerExponent, calculator.CodeResultOutOfRange:
		return http.StatusUnprocessableEntity
	}
	return http.StatusInternalServerError
}
