"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";

type Result<T> = { path: string | null; status: "loading" | "ready" | "guest" | "unavailable"; value: T | null };
/** No private cache or Server Action queue. Auth changes immediately discard
 * old-owner results; cookie responses must match the browser's current owner. */
export function useOwnedAccountRead<T extends { ok: true; ownerId: string }>(path: string | null, validate: (value: unknown) => value is T) {
  const enabled = !isLocalPreview && supabaseConfigured();
  const [result, setResult] = useState<Result<T>>({ path, status: enabled && path ? "loading" : "guest", value: null });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const owner = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !path) return;
    let active = true, version = 0;
    let controller: AbortController | null = null;
    const read = (expectedOwner: string | null) => {
      const request = ++version;
      controller?.abort();
      owner.current = expectedOwner;
      setResult({ path, status: expectedOwner ? "loading" : "guest", value: null });
      if (!expectedOwner) return;
      controller = new AbortController();
      void fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "error",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) }).then(async response => {
        if (!response.ok) throw Error("Unavailable");
        const value: unknown = await response.json();
        if (!active || request !== version || owner.current !== expectedOwner) return;
        setResult(validate(value) && value.ownerId === expectedOwner
          ? { path, status: "ready", value } : { path, status: "unavailable", value: null });
      }).catch(() => { if (active && request === version) setResult({ path, status: "unavailable", value: null }); });
    };
    let unsubscribe = () => {};
    try {
      const { data } = createSupabaseBrowser().auth.onAuthStateChange((event, session) => {
        const nextOwner = event === "SIGNED_OUT" ? null : session?.user.id ?? null;
        // Invalidate synchronously, but never fetch inside the Auth SDK lock.
        ++version; controller?.abort(); owner.current = nextOwner;
        setResult({ path, status: nextOwner ? "loading" : "guest", value: null });
        queueMicrotask(() => { if (active && owner.current === nextOwner) read(nextOwner); });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { queueMicrotask(() => { if (active) setResult({ path, status: "unavailable", value: null }); }); }
    const focus = () => read(owner.current);
    window.addEventListener("focus", focus);
    return () => { active = false; ++version; owner.current = null; controller?.abort(); unsubscribe(); window.removeEventListener("focus", focus); };
  }, [enabled, path, revision, validate]);
  // A different catalog query must never render the previous query's badges.
  if (!enabled || !path) return { status: "guest" as const, value: null, refresh };
  if (result.path !== path) return { status: "loading" as const, value: null, refresh };
  return { status: result.status, value: result.value, refresh };
}
