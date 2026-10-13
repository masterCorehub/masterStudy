export const ACCESS_MODE_KEY = 'masterstudy:access-mode';

export function resolveAccessMode({ configured, desktop, preference, hasSession, authCallback }) {
  if (!configured) return 'local';
  if (preference === 'local' || preference === 'cloud') return preference;
  if (authCallback) return 'cloud';
  // Preserve existing accounts; new desktop installations start offline.
  return hasSession || !desktop ? 'cloud' : 'local';
}

export function browserAccessMode(configured, browser = globalThis.window) {
  if (!browser) return 'local';
  let preference, hasSession = false;
  try {
    preference = browser.localStorage.getItem(ACCESS_MODE_KEY);
    for (let index = 0; index < browser.localStorage.length; index++) {
      const key = browser.localStorage.key(index);
      if (/^sb-.+-auth-token$/.test(key || '')) {
        const value = JSON.parse(browser.localStorage.getItem(key) || 'null');
        if (value?.access_token) hasSession = true;
      }
    }
  } catch { /* Storage restrictions must not prevent local use. */ }
  const location = new URL(browser.location.href);
  const mode = resolveAccessMode({ configured, preference, hasSession,
    desktop: Boolean(browser.studyhubDesktop),
    authCallback: location.searchParams.has('code') || location.searchParams.get('auth') === 'recovery' || /(?:access_token=|type=recovery)/.test(location.hash),
  });
  // Remember a first local launch before any later authentication callback.
  if (mode === 'local' && !preference) {
    try { browser.localStorage.setItem(ACCESS_MODE_KEY, mode); } catch { /* Local storage may be unavailable. */ }
  }
  return mode;
}

export function changeAccessMode(mode, browser = window) {
  if (!['local', 'cloud'].includes(mode)) throw new Error('Modo de acesso inválido.');
  browser.localStorage.setItem(ACCESS_MODE_KEY, mode);
  // Restart services together so no old cloud subscription stays active.
  browser.location.reload();
}
