package main

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
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

func portOf(t *testing.T, url string) string {
	t.Helper()
	_, port, err := net.SplitHostPort(strings.TrimPrefix(url, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	return port
}

func TestRunHealthcheck(t *testing.T) {
	healthy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer healthy.Close()
	gone := httptest.NewServer(http.NotFoundHandler())
	gone.Close()

	var stderr bytes.Buffer
	env := func(port string) func(string) string { return func(string) string { return port } }
	if code := run(context.Background(), []string{"healthcheck"}, env(portOf(t, healthy.URL)), io.Discard, &stderr); code != 0 {
		t.Errorf("healthy: exit code = %d, want 0 (stderr %q)", code, stderr.String())
	}
	if code := run(context.Background(), []string{"healthcheck"}, env(portOf(t, gone.URL)), io.Discard, &stderr); code != 1 {
		t.Errorf("unreachable: exit code = %d, want 1", code)
	}
	if stderr.Len() == 0 {
		t.Error("unhealthy check should explain itself on stderr")
	}
}

func TestRunServesUntilCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var stdout bytes.Buffer
	done := make(chan int, 1)
	go func() { done <- run(ctx, nil, func(string) string { return "0" }, &stdout, io.Discard) }()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case code := <-done:
		if code != 0 {
			t.Errorf("exit code = %d, want 0", code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run did not return after cancel")
	}
	if !strings.Contains(stdout.String(), `"msg":"listening"`) {
		t.Errorf("startup not logged: %q", stdout.String())
	}
}

func TestRunFailsOnBadPort(t *testing.T) {
	if code := run(context.Background(), nil, func(string) string { return "not-a-port" }, io.Discard, io.Discard); code != 1 {
		t.Errorf("exit code = %d, want 1", code)
	}
}
