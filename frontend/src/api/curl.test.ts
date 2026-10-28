import { expect, it } from 'vitest';
import { buildCurl } from './curl';
it('builds a ready-to-run cURL command', () => {
  expect(buildCurl('http://localhost:8080', '{"operation":"divide","operands":["10","3"]}')).toBe(
    `curl -X POST http://localhost:8080/api/v1/calculate -H "Content-Type: application/json" -d '{"operation":"divide","operands":["10","3"]}'`,
  );
});
