/** Expected wallet/provider failures are returned, not server HTTP 500s. */
export function requireWalletState<T extends { address: string; pesos: number }>(
  state: T | { ok: false; error: string },
): T {
  if ("ok" in state && state.ok === false) throw new Error(state.error);
  return state as T;
}
