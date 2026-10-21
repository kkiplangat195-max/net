export function apiFailureStatus(error) {
  if (error?.status === 403) return 403;
  const code = String(error?.code || '');
  if (/^(PGRST\d+|08[A-Z0-9]{3}|53[A-Z0-9]{3}|57P0[1-4]|42P01|42703|42883|42501)$/i.test(code)) return 503;
  return 500;
}