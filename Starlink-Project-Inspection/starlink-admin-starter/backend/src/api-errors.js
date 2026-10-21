export function apiFailureStatus(error) {
  if (error?.status === 403) return 403;
  const code = String(error?.code || '');
  if (/^(PGRST\d+|08[A-Z0-9]{3}|53[A-Z0-9]{3}|57P0[1-4]|42P01|42703|42883|42501|FETCH_FAILED|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ABORT_ERR)$/i.test(code)) return 503;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 503;
  return 500;
}