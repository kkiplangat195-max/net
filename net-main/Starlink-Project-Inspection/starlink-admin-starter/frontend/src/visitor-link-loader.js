const DEFAULT_TIMEOUT_MS = 12_000;

export function createVisitorLinkLoader({ fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const inFlight = new Map();

  return function loadVisitorLink(apiUrl, linkToken) {
    if (!apiUrl) return Promise.reject(new Error('Backend URL is not configured. Please contact the service administrator.'));
    if (!linkToken) return Promise.reject(new Error('This visitor link is missing its access token.'));

    const url = `${apiUrl.replace(/\/$/, '')}/api/public/links/${encodeURIComponent(linkToken)}`;
    const existing = inFlight.get(url);
    if (existing) return existing;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const request = (async () => {
      try {
        const response = await fetchImpl(url, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `Could not load this visitor link (HTTP ${response.status}).`);
        }
        if (!payload?.link || !Array.isArray(payload.link.bundles)) {
          throw new Error('The server returned invalid bundle options. Please retry.');
        }
        return payload.link;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('Loading bundle options timed out. Check your connection and retry.');
        }
        if (error instanceof TypeError) {
          throw new Error('Could not reach the service. Check your connection and retry.');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    })();

    inFlight.set(url, request);
    request.then(
      () => { if (inFlight.get(url) === request) inFlight.delete(url); },
      () => { if (inFlight.get(url) === request) inFlight.delete(url); }
    );
    return request;
  };
}

export const loadVisitorLink = createVisitorLinkLoader();