import assert from 'node:assert/strict';

const apiUrl = process.env.DEPLOYED_API_URL;
const frontendUrl = process.env.DEPLOYED_FRONTEND_URL;
if (!apiUrl || !frontendUrl) {
  throw new Error('Set DEPLOYED_API_URL and DEPLOYED_FRONTEND_URL before running the deployed smoke test.');
}

const api = new URL(apiUrl);
const frontend = new URL(frontendUrl);
assert.equal(api.protocol, 'https:', 'The deployed API must use HTTPS.');
assert.equal(frontend.protocol, 'https:', 'The deployed frontend must use HTTPS.');

const health = await fetch(new URL('/health', api), {
  headers: { Origin: frontend.origin },
  signal: AbortSignal.timeout(15_000)
});
assert.equal(health.status, 200, 'The API health check must succeed.');
assert.equal(health.headers.get('access-control-allow-origin'), frontend.origin);
assert.deepEqual(await health.json(), { ok: true, databaseConfigured: true });

const protectedResponse = await fetch(new URL('/api/admin/customers', api), {
  headers: { Origin: frontend.origin },
  signal: AbortSignal.timeout(15_000)
});
assert.equal(protectedResponse.status, 401, 'Admin routes must reject requests without a token.');
assert.equal(protectedResponse.headers.get('access-control-allow-origin'), frontend.origin);

const deniedResponse = await fetch(new URL('/health', api), {
  headers: { Origin: 'https://not-the-configured-frontend.invalid' },
  signal: AbortSignal.timeout(15_000)
});
assert.equal(deniedResponse.status, 403, 'The API must reject an unconfigured browser origin.');

console.log(`Deployment smoke test passed: ${frontend.origin} -> ${api.origin}`);
