export function queueErrorLogDue(lastLoggedAt, now = Date.now(), interval = 60_000) {
  return lastLoggedAt === null || now - lastLoggedAt >= interval;
}

export function queueRetryDelayMs(failureCount, baseDelayMs = 5_000, maxDelayMs = 300_000) {
  const exponent = Math.max(0, Math.min(16, Number(failureCount) - 1));
  return Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
}

export function createQueueBackoff({ now = Date.now, baseDelayMs = 5_000, maxDelayMs = 300_000 } = {}) {
  let failures = 0;
  let retryAt = 0;
  return {
    canRun() {
      return now() >= retryAt;
    },
    failed() {
      failures += 1;
      retryAt = now() + queueRetryDelayMs(failures, baseDelayMs, maxDelayMs);
      return { failures, retryAt };
    },
    succeeded() {
      failures = 0;
      retryAt = 0;
    }
  };
}

export async function runQueueWhenReady(checkReadiness, claim) {
  const readiness = await checkReadiness();
  if (!readiness?.databaseReady) return { readiness, claimed: false, result: null };
  return { readiness, claimed: true, result: await claim() };
}

export function safeQueueErrorDetails(error) {
  const code = /^[A-Z0-9_-]{1,32}$/i.test(String(error?.code || ""))
    ? String(error.code)
    : "unknown";
  const message = String(error?.message || "Unknown queue error")
    .replace(/\bbot\d+:[A-Za-z0-9_-]+/gi, "[redacted bot token]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(pin|otp)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
  const missingObjects = Array.isArray(error?.missingObjects)
    ? error.missingObjects.filter((name) => typeof name === 'string' && /^[a-z][a-z0-9_]{0,100}$/.test(name)).slice(0, 100)
    : undefined;
  return missingObjects ? { code, message, missingObjects } : { code, message };
}