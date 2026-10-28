# Build a static binary.
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# Run it on a distroless image as a non-root user. There is no shell, so the
# compose healthcheck uses the binary's own `healthcheck` mode.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server
EXPOSE 8081
USER nonroot:nonroot
ENTRYPOINT ["/server"]
