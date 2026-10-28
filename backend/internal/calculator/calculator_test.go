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
		{OpPower, []string{"1", "7000"}, CodeResultOutOfRange, ""}, // accepted trade-off (spec §6.3)
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
