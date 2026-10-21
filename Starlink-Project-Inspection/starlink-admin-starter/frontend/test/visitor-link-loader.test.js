import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitorLinkLoader } from '../src/visitor-link-loader.js';

const baseUrl = 'https://backend.example.test';
const publishedLink = { id: 'link-1', bundles: [{ id: 'bundle-1', price: 1.25 }] };
const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload
});

test('loads a published link and deduplicates concurrent requests', async () => {
  let calls = 0;
  let resolveResponse;
  const loader = createVisitorLinkLoader({
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, `${baseUrl}/api/public/links/token%2Fpart`);
      assert.equal(options.cache, 'no-store');
      return new Promise((resolve) => { resolveResponse = resolve; });
    }
  });

  const first = loader(baseUrl, 'token/part');
  const second = loader(baseUrl, 'token/part');
  resolveResponse(jsonResponse(200, { link: publishedLink }));
  assert.deepEqual(await first, publishedLink);
  assert.deepEqual(await second, publishedLink);
  assert.equal(calls, 1);
});

test('returns an empty bundle list as a completed response', async () => {
  const loader = createVisitorLinkLoader({ fetchImpl: async () => jsonResponse(200, { link: { id: 'empty-link', bundles: [] } }) });
  assert.deepEqual(await loader(baseUrl, 'empty'), { id: 'empty-link', bundles: [] });
});

test('reports API failures and permits a successful retry', async () => {
  let calls = 0;
  const loader = createVisitorLinkLoader({
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(503, { error: 'The request could not be completed.' })
        : jsonResponse(200, { link: publishedLink });
    }
  });

  await assert.rejects(loader(baseUrl, 'retry'), /request could not be completed/);
  assert.deepEqual(await loader(baseUrl, 'retry'), publishedLink);
  assert.equal(calls, 2);
});

test('times out a stalled request and can retry afterward', async () => {
  let calls = 0;
  const loader = createVisitorLinkLoader({
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => {
      calls += 1;
      if (calls > 1) return jsonResponse(200, { link: publishedLink });
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }
  });

  await assert.rejects(loader(baseUrl, 'timeout'), /timed out/);
  assert.deepEqual(await loader(baseUrl, 'timeout'), publishedLink);
  assert.equal(calls, 2);
});

test('rejects malformed successful responses instead of leaving loading unresolved', async () => {
  const loader = createVisitorLinkLoader({ fetchImpl: async () => jsonResponse(200, { link: { id: 'bad-link' } }) });
  await assert.rejects(loader(baseUrl, 'malformed'), /invalid bundle options/);
});