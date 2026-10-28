import { CALCULATE_PATH } from './client';

/** A POSIX-shell command that replays a calculate request against origin. */
export function buildCurl(origin: string, body: string): string {
  return `curl -X POST ${origin}${CALCULATE_PATH} -H "Content-Type: application/json" -d '${body}'`;
}
