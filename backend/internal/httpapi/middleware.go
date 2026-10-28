package httpapi

import (
	"log/slog"
	"net/http"
	"time"
)

// statusRecorder remembers the status code written through it.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// withMiddleware applies the API's middleware stack to h. Recovery sits
// inside the request log so a panicking request is still logged, as a 500.
func withMiddleware(logger *slog.Logger, h http.Handler) http.Handler {
	return withRequestLog(logger, withRecovery(logger, h))
}

// withRequestLog logs one structured line per request.
func withRequestLog(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration", time.Since(start),
		)
	})
}

// withRecovery turns a panic into a JSON 500 so a bug never leaks a stack
// trace or an empty response to the client.
func withRecovery(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				logger.Error("panic serving request", "panic", v, "path", r.URL.Path)
				writeError(w, http.StatusInternalServerError, codeInternalError, internalErrorMessage)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
