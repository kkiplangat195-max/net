export function normalizeLinkBundles(selectedBundles, catalogRows) {
  if (!Array.isArray(selectedBundles) || selectedBundles.length === 0) {
    throw new Error('Select at least one bundle.');
  }

  const selectedIds = selectedBundles.map((bundle) => bundle.id);
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('A bundle can only be selected once.');
  }

  const catalogById = new Map(catalogRows.map((bundle) => [bundle.bundle_id, bundle]));
  return selectedBundles.map((selected) => {
    const catalog = catalogById.get(selected.id);
    if (!catalog) throw new Error(`Unknown bundle: ${selected.id}`);
    if (selected.enabled && !catalog.enabled) {
      throw new Error(`${catalog.name} is disabled in the bundle catalog.`);
    }

    return {
      id: catalog.bundle_id,
      name: catalog.name,
      validity: catalog.validity,
      price: Math.round(Number(catalog.price) * 100) / 100,
      currency: 'USD',
      description: catalog.description,
      enabled: Boolean(selected.enabled),
      promotionalLabel: catalog.promotional_label || ''
    };
  });
}

export function assertPublishableLink(link, { botToken, publicAppUrl, nodeEnv }) {
  if (!Array.isArray(link.bundles) || !link.bundles.some((bundle) => bundle.enabled !== false)) {
    throw new Error('Enable at least one bundle before publishing.');
  }
  if (link.notifications_enabled && !link.telegram_chat_id) {
    throw new Error('Set a Telegram Chat ID or disable notifications before publishing.');
  }
  if (link.notifications_enabled && !botToken) {
    throw new Error('Configure TELEGRAM_BOT_TOKEN on the backend before publishing a link with Telegram notifications enabled.');
  }
  if (!publicAppUrl) {
    throw new Error('Set PUBLIC_APP_URL to the verified production domain before publishing.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(publicAppUrl);
  } catch {
    throw new Error('PUBLIC_APP_URL must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error('PUBLIC_APP_URL must be an HTTP(S) origin without credentials, query, or fragment.');
  }
  if (nodeEnv === 'production' && parsedUrl.protocol !== 'https:') {
    throw new Error('PUBLIC_APP_URL must use HTTPS in production.');
  }
}

export function notificationOutcome({ sent, attempt, now = Date.now() }) {
  const terminal = !sent && attempt >= 8;
  return {
    status: sent ? 'sent' : terminal ? 'failed' : 'queued',
    sentAt: sent ? new Date(now).toISOString() : null,
    nextAttemptAt: sent || terminal ? null : new Date(now + Math.min(60, 2 ** attempt) * 1000).toISOString()
  };
}

export function permittedNotificationPreferences(linkPreferences = {}, customerPreferences = {}) {
  return {
    newOrder: linkPreferences.newOrder !== false && customerPreferences.newOrder !== false,
    phone: linkPreferences.phone === true && customerPreferences.phone === true,
    amount: linkPreferences.amount !== false && customerPreferences.amount !== false
  };
}