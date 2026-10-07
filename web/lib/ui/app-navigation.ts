/** Navigation-only state. Never put account, payment, recipient or auth data here. */
const MARKER = "__salapiNavigation";
const STORAGE_KEY = "salapi-navigation-v1";
const MAX_ENTRIES = 60;
const VIEW_KEYS = new Set(["home-circles", "circles-discovery"]);
const ID = /^[a-zA-Z0-9-]{16,64}$/;
type Views = Record<string, string>;
type Entry = { id: string; previous: string | null; pathname: string; scroll: number; views: Views };
type Registry = { version: 1; session: string; entries: Entry[] };
export type NavigationScrollPlan = { entry: string; top: number; restore: boolean };
export type AppBackDecision = "back" | "fallback" | "pending";

function safePathname(pathname: string): boolean {
  // No auth tokens, search parameters, hashes or transaction results are persisted.
  return /^\/(?!\/)[^\\\u0000-\u0020?#]*$/.test(pathname) && pathname.length <= 240 &&
    !/^\/(?:api|auth|tx)(?:\/|$)/.test(pathname);
}

/** Relative, same-origin destinations only, including after URL normalization. */
export function safeAppFallback(value: string): string {
  if (typeof value !== "string" || value.length > 1000 || !/^\/(?!\/)[^\\\u0000-\u0020]*$/.test(value)) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (!/^\/(?!\/)[^\\\u0000-\u0020]*$/.test(decoded) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|20)/i.test(decoded)) return "/";
    const url = new URL(value, "https://salapi.invalid");
    return url.origin === "https://salapi.invalid" && safePathname(url.pathname) ? url.pathname + url.search + url.hash : "/";
  } catch { return "/"; }
}

function viewSnapshot(viewKey: string, value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const allowedFields = viewKey === "home-circles" ? ["category", "index"] : ["category", "sort"];
  const fields = Object.entries(value);
  if (fields.length > 2 || fields.some(([key, item]) => !allowedFields.includes(key) ||
    (key === "index" ? !(typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 10000) :
      !(typeof item === "string" && /^[a-zA-Z0-9 _-]{0,48}$/.test(item))))) return "";
  const snapshot = JSON.stringify(Object.fromEntries(fields));
  return snapshot.length <= 512 ? snapshot : "";
}

function readRegistry(raw: string | null): Registry | null {
  try {
    if (!raw || raw.length > 70000) return null;
    const value = JSON.parse(raw) as Registry;
    if (value.version !== 1 || typeof value.session !== "string" || !ID.test(value.session) || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) return null;
    const ids = new Set<string>();
    const entries: Entry[] = [];
    for (const entry of value.entries) {
      if (!entry || typeof entry.id !== "string" || !ID.test(entry.id) || ids.has(entry.id) || !(entry.previous === null || typeof entry.previous === "string" && ID.test(entry.previous)) ||
        typeof entry.pathname !== "string" || !safePathname(entry.pathname) || !Number.isFinite(entry.scroll) || entry.scroll < 0 || entry.scroll > 1000000 ||
        !entry.views || typeof entry.views !== "object" || Array.isArray(entry.views)) return null;
      ids.add(entry.id);
      const views: Views = {};
      for (const [key, snapshot] of Object.entries(entry.views)) {
        if (!VIEW_KEYS.has(key) || typeof snapshot !== "string") return null;
        const clean = viewSnapshot(key, JSON.parse(snapshot));
        if (!clean || clean !== snapshot) return null;
        views[key] = clean;
      }
      entries.push({ id: entry.id, previous: entry.previous, pathname: entry.pathname, scroll: entry.scroll, views });
    }
    return { version: 1, session: value.session, entries };
  } catch { return null; }
}

/** Factory is exported for isolated History-API tests, not for per-screen use. */
export function createAppNavigationTracker(win: Window) {
  const listeners = new Set<() => void>();
  let registry: Registry;
  try { registry = readRegistry(win.sessionStorage.getItem(STORAGE_KEY)) ?? freshRegistry(); }
  catch { registry = freshRegistry(); }
  function newId() { return win.crypto.randomUUID(); }
  function freshRegistry(): Registry { return { version: 1, session: newId(), entries: [] }; }
  let active: Entry | null = null;
  let pending: NavigationScrollPlan | null = null;
  let revision = 0;
  let claimedBack: string | null = null;
  let owners = 0;
  let detach: (() => void) | undefined;
  let notificationQueued = false;
  let notificationGeneration = 0;
  const notify = () => {
    if (notificationQueued) return;
    notificationQueued = true;
    const generation = notificationGeneration;
    // Next updates history from useInsertionEffect. Keep the registry and Back
    // claim synchronous, but notify React subscribers after that commit exits.
    // Several history/view writes in one turn publish only their latest state.
    queueMicrotask(() => {
      if (generation !== notificationGeneration) return;
      notificationQueued = false;
      for (const listener of [...listeners]) if (listeners.has(listener)) listener();
    });
  };
  const persist = () => { try { win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(registry)); } catch { /* Memory-only when storage is denied. */ } };
  const marker = (entry: Entry) => ({ version: 1, session: registry.session, entry: entry.id });
  function trusted(state: unknown = win.history.state): Entry | null {
    if (!state || typeof state !== "object") return null;
    const metadata = (state as Record<string, unknown>)[MARKER] as { version?: number; session?: string; entry?: string } | undefined;
    if (metadata?.version !== 1 || metadata.session !== registry.session) return null;
    return registry.entries.find((entry) => entry.id === metadata.entry && entry.pathname === win.location.pathname) ?? null;
  }
  function makeEntry(pathname: string, previous: string | null): Entry | null {
    if (!safePathname(pathname)) return null;
    const entry: Entry = { id: newId(), previous, pathname, scroll: 0, views: {} };
    registry.entries.push(entry);
    if (registry.entries.length > MAX_ENTRIES) registry.entries.shift();
    return entry;
  }
  function merged(data: unknown, entry: Entry | null) {
    // Preserve Next's __NA, _N and tree fields. No mutation of caller-owned data.
    const result = data && typeof data === "object" ? { ...data } as Record<string, unknown> : {};
    delete result[MARKER];
    if (entry) result[MARKER] = marker(entry);
    return result;
  }
  function rememberScroll() {
    const current = trusted();
    if (current && current === active && !pending) current.scroll = Math.min(1000000, Math.max(0, win.document.getElementById("app-content")?.scrollTop ?? 0));
  }
  function transition(entry: Entry | null, restore: boolean) {
    claimedBack = null;
    active = entry;
    pending = entry ? { entry: entry.id, top: restore ? entry.scroll : 0, restore } : null;
    revision++;
    persist();
    notify();
  }
  function start() {
    owners++;
    if (owners === 1) {
      const history = win.history;
      const originalPush = history.pushState;
      const originalReplace = history.replaceState;
      let attached = true;
      const initial = trusted() ?? makeEntry(win.location.pathname, null);
      const restored = trusted() !== null;
      if (initial) originalReplace.call(history, merged(history.state, initial), "");
      transition(initial, restored);
      const change = (push: boolean, data: unknown, unused: string, destination?: string | URL | null) => {
        const original = push ? originalPush : originalReplace;
        if (!attached) return original.call(history, data, unused, destination);
        const url = new URL(destination ?? win.location.href, win.location.href);
        if (url.origin !== win.location.origin) return original.call(history, data, unused, destination);
        const current = trusted();
        const sameUrl = url.href === win.location.href;
        // The old scroll is already captured by the passive listener/click. At
        // Next's insertion effect the outgoing DOM may have been replaced.
        const samePath = current?.pathname === url.pathname;
        const entry = !push && samePath ? current : makeEntry(url.pathname, push ? current?.id ?? null : current?.previous ?? null);
        original.call(history, merged(data, entry), unused, destination);
        if (!push && entry === active && sameUrl) { persist(); return; }
        transition(entry, false);
      };
      const push: History["pushState"] = (data, unused, url) => change(true, data, unused, url);
      const replace: History["replaceState"] = (data, unused, url) => change(false, data, unused, url);
      history.pushState = push;
      history.replaceState = replace;
      const onPop = () => {
        const known = trusted();
        const target = known ?? makeEntry(win.location.pathname, null);
        if (target && !known) originalReplace.call(history, merged(history.state, target), "");
        transition(target, known !== null);
      };
      const onScroll = (event: Event) => { if (event.target === win.document.getElementById("app-content")) rememberScroll(); };
      const onClick = () => { rememberScroll(); persist(); };
      const onPageHide = () => { rememberScroll(); persist(); };
      const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) transition(trusted(), true); };
      win.addEventListener("popstate", onPop);
      win.addEventListener("pagehide", onPageHide);
      win.addEventListener("pageshow", onPageShow);
      win.document.addEventListener("scroll", onScroll, { capture: true, passive: true });
      win.document.addEventListener("click", onClick, true);
      detach = () => {
        notificationGeneration++;
        notificationQueued = false;
        claimedBack = null;
        rememberScroll(); persist(); attached = false;
        // Do not remove a newer wrapper installed by Next or another owner.
        if (history.pushState === push) history.pushState = originalPush;
        if (history.replaceState === replace) history.replaceState = originalReplace;
        win.removeEventListener("popstate", onPop);
        win.removeEventListener("pagehide", onPageHide);
        win.removeEventListener("pageshow", onPageShow);
        win.document.removeEventListener("scroll", onScroll, true);
        win.document.removeEventListener("click", onClick, true);
      };
    }
    let stopped = false;
    return () => { if (!stopped) { stopped = true; owners--; if (owners === 0) detach?.(); } };
  }
  return {
    start,
    canGoBack() { const current = trusted(); return !!current?.previous && registry.entries.some((entry) => entry.id === current.previous && entry.id !== current.id); },
    claimBack(): AppBackDecision {
      // router.back() completes asynchronously. Do not queue another traversal
      // against the same entry before popstate confirms the first one.
      if (claimedBack !== null) return "pending";
      const current = trusted();
      if (!current?.previous || !registry.entries.some((entry) => entry.id === current.previous && entry.id !== current.id)) return "fallback";
      claimedBack = current.id;
      return "back";
    },
    commit(pathname: string, query: string): NavigationScrollPlan | null {
      if (pathname !== win.location.pathname || new URLSearchParams(query).toString() !== new URLSearchParams(win.location.search).toString()) return null;
      const entry = trusted();
      if (!entry || pending?.entry !== entry.id) return null;
      const plan = pending; pending = null; return plan;
    },
    entrySnapshot() { return active ? `${active.id}:${revision}` : ""; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    viewSnapshot(key: string) { return VIEW_KEYS.has(key) ? trusted()?.views[key] ?? "" : ""; },
    writeView(key: string, value: unknown) {
      if (!VIEW_KEYS.has(key)) return;
      const entry = trusted(), snapshot = viewSnapshot(key, value);
      if (!entry || !snapshot || entry.views[key] === snapshot) return;
      entry.views[key] = snapshot; persist(); notify();
    },
  };
}

let tracker: ReturnType<typeof createAppNavigationTracker> | undefined;
function clientTracker() { if (typeof window === "undefined") return undefined; return tracker ??= createAppNavigationTracker(window); }
export function installAppNavigation() { return clientTracker()?.start() ?? (() => {}); }
export function canGoBackInApp() { return clientTracker()?.canGoBack() ?? false; }
export function claimAppBack(): AppBackDecision { return clientTracker()?.claimBack() ?? "fallback"; }
export function commitAppNavigation(pathname: string, query: string) { return clientTracker()?.commit(pathname, query) ?? null; }
export function getNavigationEntrySnapshot() { return clientTracker()?.entrySnapshot() ?? ""; }
export function getNavigationViewStateSnapshot(key: string) { return clientTracker()?.viewSnapshot(key) ?? ""; }
export function subscribeNavigationViewState(listener: () => void) { return clientTracker()?.subscribe(listener) ?? (() => {}); }
export function writeNavigationViewState(key: string, value: unknown) { clientTracker()?.writeView(key, value); }
