import { normalizedUsername, OWNER_PATTERN, type UsernameStatus } from "./username-onboarding";

const READY_TTL_MS = 5 * 60 * 1000;

/** Presentation cache only. Server actions still authenticate and verify the wallet.
 * No storage, tokens, metadata claims, or cached "username missing" decisions.
 */
export function createUsernameOnboardingReader(
  request: typeof fetch = (...args) => fetch(...args),
  now: () => number = Date.now,
) {
  let owner: string | null = null;
  let generation = 0;
  let ready: { value: Extract<UsernameStatus, { status: "ready" }>; expires: number } | null = null;
  let pending: { promise: Promise<UsernameStatus>; controller: AbortController } | null = null;

  function setOwner(next: string | null) {
    if (next === owner) return;
    owner = next; generation++; ready = null;
    pending?.controller.abort(); pending = null;
  }

  function read(expected: string, refresh = false): Promise<UsernameStatus> {
    if (owner !== expected || !OWNER_PATTERN.test(expected)) return Promise.resolve({ status: "account_changed" });
    if (pending) return pending.promise;
    if (!refresh && ready && now() < ready.expires) return Promise.resolve(ready.value);
    const version = generation;
    const controller = new AbortController();
    const flight = {
      controller,
      promise: Promise.resolve<UsernameStatus>({ status: "unavailable" }),
    };
    flight.promise = (async (): Promise<UsernameStatus> => {
      const response = await request("/api/account/username-onboarding", {
        cache: "no-store", credentials: "same-origin", headers: { "X-Salapi-Owner": expected },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const result: UsernameStatus = await response.json();
      if (owner !== expected || generation !== version) return { status: "account_changed" };
      if (!response.ok || !result || !("ownerId" in result) || result.ownerId !== expected) {
        ready = null; return { status: "unavailable" };
      }
      if (result.status === "ready" && normalizedUsername(result.handle) && /^G[A-Z2-7]{55}$/.test(result.address)) {
        ready = { value: result, expires: now() + READY_TTL_MS };
      } else {
        ready = null;
        if (result.status === "ready") return { status: "unavailable" };
      }
      return result;
    })().finally(() => { if (pending === flight) pending = null; });
    pending = flight;
    return flight.promise;
  }

  return { setOwner, read };
}

// Survives layout/Suspense remounts in this document, but not logout or owner changes.
export const usernameOnboardingReader = createUsernameOnboardingReader();
