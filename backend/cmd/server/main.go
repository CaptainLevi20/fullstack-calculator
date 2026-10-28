// Command server runs the calculator API.
//
// Usage:
//
//	server              serve on $PORT (default 8081)
//	server healthcheck  exit 0 if the local server answers /healthz with 200
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"fullstack-calculator/backend/internal/httpapi"
)

const defaultPort = "8081"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := run(ctx, os.Args[1:], os.Getenv, os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}

// run is main without the process globals, so it can be tested. It returns
// the exit code.
func run(ctx context.Context, args []string, getenv func(string) string, stdout, stderr io.Writer) int {
	port := portFromEnv(getenv)

	if len(args) > 0 && args[0] == "healthcheck" {
		if err := checkHealth(ctx, "http://127.0.0.1:"+port+"/healthz"); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		return 0
	}

	logger := slog.New(slog.NewJSONHandler(stdout, nil))
	srv := newServer(":"+port, httpapi.NewHandler(logger))
	logger.Info("listening", "addr", srv.Addr)
	if err := serve(ctx, srv, logger); err != nil {
		logger.Error("server stopped", "error", err)
		return 1
	}
	return 0
}

func portFromEnv(getenv func(string) string) string {
	if p := getenv("PORT"); p != "" {
		return p
	}
	return defaultPort
}

func newServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

// checkHealth reports whether url answers with HTTP 200.
func checkHealth(ctx context.Context, url string) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthcheck: status %d", resp.StatusCode)
	}
	return nil
}

// serve runs srv until ctx is done, then shuts it down gracefully.
func serve(ctx context.Context, srv *http.Server, logger *slog.Logger) error {
	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
