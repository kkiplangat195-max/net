export function queueErrorLogDue(lastLoggedAt, now = Date.now(), interval = 60_000) {
  return lastLoggedAt === null || now - lastLoggedAt >= interval;
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
  return { code, message };
}