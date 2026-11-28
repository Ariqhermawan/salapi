const KEY = "salapi:recent-send-recipients:v1";
const LIMIT = 5;
const USERNAME = /^[a-z0-9_]{3,32}$/;

function keyFor(owner: string | null | undefined): string | null {
  const normalized = owner?.trim().toLowerCase() ?? "";
  return USERNAME.test(normalized) ? `${KEY}:${normalized}` : null;
}

export function listRecentSendRecipients(owner: string | null | undefined): string[] {
  const key = keyFor(owner);
  if (!key || typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((handle): handle is string => typeof handle === "string" && USERNAME.test(handle)))].slice(0, LIMIT);
  } catch { return []; }
}

export function rememberRecentSendRecipient(owner: string | null | undefined, recipient: string): void {
  const key = keyFor(owner);
  const handle = recipient.trim().toLowerCase();
  if (!key || !USERNAME.test(handle) || handle === owner?.trim().toLowerCase() || typeof window === "undefined") return;
  const next = [handle, ...listRecentSendRecipients(owner).filter(value => value !== handle)].slice(0, LIMIT);
  try { window.localStorage.setItem(key, JSON.stringify(next)); }
  catch { /* Recent recipients are a convenience; the confirmed transfer remains recorded. */ }
}
