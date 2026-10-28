package calculator

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/cockroachdb/apd/v3"
)

// decimal128 is the IEEE 754 decimal128 arithmetic context used for every
// operation. Traps are disabled: callers inspect the returned conditions.
// It is only ever read, so it is safe to share across goroutines.
var decimal128 = apd.Context{
	Precision:   34,
	MaxExponent: 6144,
	MinExponent: -6143,
	Rounding:    apd.RoundHalfEven,
	Traps:       0,
}

const maxOperandDigits = 34

// operandPattern is the strict wire grammar for operands: plain or scientific
// notation, no leading '+', no leading zeros, no bare decimal points.
var operandPattern = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE][+-]?[0-9]+)?$`)

// parseOperand validates s against the wire grammar and the decimal128 limits.
// position is 1-based and appears in error messages.
func parseOperand(s string, position int) (*apd.Decimal, error) {
	m := operandPattern.FindStringSubmatch(s)
	if m == nil {
		return nil, invalidNumber(position, "is not a valid number")
	}
	if coefficient := strings.TrimLeft(m[1]+m[2], "0"); len(coefficient) > maxOperandDigits {
		return nil, invalidNumber(position, fmt.Sprintf("has more than %d digits", maxOperandDigits))
	}
	d, _, err := apd.NewFromString(s)
	if err != nil {
		return nil, invalidNumber(position, "is not a valid number")
	}
	cond, err := decimal128.Round(d, d)
	if err != nil || cond.Overflow() || cond.Underflow() || cond.Inexact() {
		return nil, invalidNumber(position, "is out of range")
	}
	return d, nil
}

func invalidNumber(position int, problem string) *Error {
	return &Error{Code: CodeInvalidNumber, Message: fmt.Sprintf("Operand %d %s.", position, problem)}
}
