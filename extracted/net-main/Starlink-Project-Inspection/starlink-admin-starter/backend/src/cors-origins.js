const PRODUCTION_FRONTEND_ORIGIN = 'https://net-omega-black.vercel.app';

export function getAllowedOrigins(configuredOrigins = '') {
  const allowed = new Set([PRODUCTION_FRONTEND_ORIGIN]);
  for (const candidate of configuredOrigins.split(',')) {
    const value = candidate.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (['http:', 'https:'].includes(url.protocol) && url.origin === value) {
        allowed.add(url.origin);
      }
    } catch {
      continue;
    }
  }
  return allowed;
}