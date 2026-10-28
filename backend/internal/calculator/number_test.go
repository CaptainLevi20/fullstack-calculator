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
