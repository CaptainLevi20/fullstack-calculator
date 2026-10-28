package calculator

// Code is a stable, machine-readable identifier for a domain error.
type Code string

const (
	CodeUnknownOperation    Code = "UNKNOWN_OPERATION"
	CodeInvalidOperandCount Code = "INVALID_OPERAND_COUNT"
	CodeInvalidNumber       Code = "INVALID_NUMBER"
	CodeDivisionByZero      Code = "DIVISION_BY_ZERO"
	CodeNegativeSquareRoot  Code = "NEGATIVE_SQUARE_ROOT"
	CodeNonIntegerExponent  Code = "NON_INTEGER_EXPONENT"
	CodeResultOutOfRange    Code = "RESULT_OUT_OF_RANGE"
)

// Error is a domain error whose Message is safe to show to end users.
type Error struct {
	Code    Code
	Message string
}

func (e *Error) Error() string { return e.Message }
