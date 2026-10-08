/** The public ledger stream is only an invalidation signal. Amounts, identity
 * and photos always come from a fresh, server-authenticated private read. */
export function watchWalletActivity(address: string, onChange: () => Promise<void>) {
  if (!/^G[A-Z2-7]{55}$/.test(address)) return () => {};
  let disposed = false, source: EventSource | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let reading = false, pending = false;
  const visible = () => !disposed && document.visibilityState === "visible" && navigator.onLine !== false;
  const changed = () => {
    if (!visible()) return;
    pending = true;
    if (reading || debounce !== undefined) return;
    // Coalesce multiple SAC movements from the same transaction.
    debounce = setTimeout(() => {
      debounce = undefined;
      if (!visible()) return;
      reading = true; pending = false;
      void Promise.resolve().then(onChange).catch(() => {}).finally(() => {
        reading = false;
        if (pending) changed();
      });
    }, 200);
  };
  const stop = () => {
    source?.close(); source = null;
    clearInterval(timer); timer = undefined;
    clearTimeout(debounce); debounce = undefined; pending = false;
  };
  const resume = () => {
    if (!visible()) { stop(); return; }
    if (timer !== undefined) { changed(); return; }
    if (typeof EventSource !== "undefined") {
      try {
        source = new EventSource(`https://horizon-testnet.stellar.org/accounts/${address}/payments?cursor=now&order=asc&include_failed=false`);
        source.onmessage = changed;
        // Close the gap between the initial snapshot and starting/reconnecting
        // the stream. A failed stream still has the bounded periodic fallback.
        source.onopen = changed;
      } catch { source = null; }
    }
    timer = setInterval(changed, 15_000);
    changed();
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("online", resume);
  window.addEventListener("offline", stop);
  resume();
  return () => {
    disposed = true; stop();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("focus", resume);
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", stop);
  };
}
