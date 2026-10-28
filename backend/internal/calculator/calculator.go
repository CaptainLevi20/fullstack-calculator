// Package calculator implements decimal128 arithmetic over wire-format
// strings. It knows nothing about HTTP or JSON.
package calculator

import (
	"fmt"

	"github.com/cockroachdb/apd/v3"
)

// Operation identifies a supported calculator operation.
type Operation string

const (
	OpAdd      Operation = "add"
	OpSubtract Operation = "subtract"
	OpMultiply Operation = "multiply"
	OpDivide   Operation = "divide"
	OpPower    Operation = "power"
	OpSqrt     Operation = "sqrt"
	OpPercent  Operation = "percent"
)

// Result is a formatted result and whether it had to be rounded.
type Result struct {
	Value   string
	Rounded bool
}

// arity is the number of operands each operation takes.
var arity = map[Operation]int{
	OpAdd: 2, OpSubtract: 2, OpMultiply: 2, OpDivide: 2, OpPower: 2, OpSqrt: 1, OpPercent: 2,
}

// maxExponentMagnitude bounds power exponents before any work is done, so a
// request like 10^999999999 is rejected without touching the decimal engine.
const maxExponentMagnitude = 6000

var (
	errUnknownOperation = &Error{Code: CodeUnknownOperation,
		Message: "Operation must be one of: add, subtract, multiply, divide, power, sqrt, percent."}
	errDivisionByZero     = &Error{Code: CodeDivisionByZero, Message: "Cannot divide by zero."}
	errNegativeSquareRoot = &Error{Code: CodeNegativeSquareRoot, Message: "Cannot take the square root of a negative number."}
	errNonIntegerExponent = &Error{Code: CodeNonIntegerExponent, Message: "The exponent must be a whole number."}
	errExponentOutOfRange = &Error{Code: CodeResultOutOfRange,
		Message: fmt.Sprintf("The exponent must be between -%d and %d.", maxExponentMagnitude, maxExponentMagnitude)}
	errResultOutOfRange = &Error{Code: CodeResultOutOfRange, Message: "The result is too large or too small to represent."}

	maxExponent = apd.New(maxExponentMagnitude, 0)
	minExponent = apd.New(-maxExponentMagnitude, 0)
	hundred     = apd.New(100, 0)
)

// Calculate validates the operation and its operands, then computes the
// result in decimal128. Domain failures are returned as *Error.
func Calculate(op Operation, operands []string) (Result, error) {
	want, ok := arity[op]
	if !ok {
		return Result{}, errUnknownOperation
	}
	if len(operands) != want {
		return Result{}, operandCountError(op, want)
	}
	args := make([]*apd.Decimal, len(operands))
	for i, s := range operands {
		d, err := parseOperand(s, i+1)
		if err != nil {
			return Result{}, err
		}
		args[i] = d
	}

	var d apd.Decimal
	cond, err := compute(op, &d, args)
	switch {
	case err != nil:
		return Result{}, err
	case cond.Overflow() || cond.Underflow():
		return Result{}, errResultOutOfRange
	case cond.DivisionByZero() || cond.DivisionUndefined():
		return Result{}, errDivisionByZero
	case cond.InvalidOperation():
		return Result{}, fmt.Errorf("calculator: invalid operation %s%v", op, operands)
	}
	return Result{Value: formatDecimal(&d), Rounded: cond.Inexact()}, nil
}

func compute(op Operation, d *apd.Decimal, args []*apd.Decimal) (apd.Condition, error) {
	switch op {
	case OpAdd:
		return decimal128.Add(d, args[0], args[1])
	case OpSubtract:
		return decimal128.Sub(d, args[0], args[1])
	case OpMultiply:
		return decimal128.Mul(d, args[0], args[1])
	case OpDivide:
		if args[1].IsZero() {
			return 0, errDivisionByZero
		}
		return decimal128.Quo(d, args[0], args[1])
	case OpPower:
		return power(d, args[0], args[1])
	case OpSqrt:
		if args[0].Negative && !args[0].IsZero() {
			return 0, errNegativeSquareRoot
		}
		return decimal128.Sqrt(d, args[0])
	case OpPercent:
		product, err := decimal128.Mul(d, args[0], args[1])
		if err != nil {
			return product, err
		}
		quotient, err := decimal128.Quo(d, d, hundred)
		return product | quotient, err
	}
	return 0, fmt.Errorf("calculator: unhandled operation %q", op)
}

func power(d, base, exponent *apd.Decimal) (apd.Condition, error) {
	var frac apd.Decimal
	exponent.Modf(nil, &frac)
	if !frac.IsZero() {
		return 0, errNonIntegerExponent
	}
	if exponent.Cmp(maxExponent) > 0 || exponent.Cmp(minExponent) < 0 {
		return 0, errExponentOutOfRange
	}
	if exponent.IsZero() {
		d.SetInt64(1)
		return 0, nil
	}
	if base.IsZero() && exponent.Negative {
		return 0, errDivisionByZero
	}
	return decimal128.Pow(d, base, exponent)
}

func operandCountError(op Operation, want int) *Error {
	noun := "operands"
	if want == 1 {
		noun = "operand"
	}
	return &Error{Code: CodeInvalidOperandCount, Message: fmt.Sprintf("%s needs exactly %d %s.", op, want, noun)}
}
