"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readCirclesSignupIdentityClient } from "@/lib/ui/circles-identity-read";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import type { CirclesSignupIdentity } from "@/lib/circles/signup";

export type SignupIdentityState = CirclesSignupIdentity | { status: "loading" };

export function useCirclesSignupIdentity(onOwnerChange?: () => void) {
  const enabled = !isLocalPreview && supabaseConfigured();
  const [identity, setIdentity] = useState<SignupIdentityState>(isLocalPreview ? { status: "guest" } : { status: enabled ? "loading" : "unavailable" });
  const active = useRef(false), requestVersion = useRef(0), ownerRevision = useRef(0);
  const authOwner = useRef<string | null | undefined>(undefined);
  // The callback contains only stable state setters. Keep its first binding so
  // SDK listeners do not churn every time an amount or checkbox changes.
  const resetOwnerPreferences = useRef(onOwnerChange);
  const reload = useCallback(async () => {
    if (!enabled || !active.current || authOwner.current === undefined) return;
    const requestedOwner = authOwner.current, request = ++requestVersion.current;
    try {
      const result = await readCirclesSignupIdentityClient();
      if (!active.current || request !== requestVersion.current || requestedOwner !== authOwner.current) return;
      // Browser identity only correlates the response. Server getUser remains
      // authoritative. Never display another owner's email during a cookie race.
      if (result.status === "verified" && result.ownerId !== requestedOwner || result.status === "guest" && requestedOwner !== null) {
        setIdentity({ status: "unavailable" }); return;
      }
      setIdentity(result);
    } catch {
      if (active.current && request === requestVersion.current) setIdentity({ status: "unavailable" });
    }
  }, [enabled]);
  useEffect(() => {
    const requestSequence = requestVersion, ownerSequence = ownerRevision;
    active.current = true;
    if (!enabled) return () => { active.current = false; };
    let unsubscribe = () => {};
    try {
      const { data } = createSupabaseBrowser().auth.onAuthStateChange((event, session) => {
        if (!active.current) return;
        const nextOwner = event === "SIGNED_OUT" ? null : session?.user.id ?? null;
        const previousOwner = authOwner.current;
        if (nextOwner !== previousOwner) {
          requestVersion.current++;
          setIdentity({ status: "loading" });
          if (previousOwner !== undefined) {
            ownerRevision.current++;
            resetOwnerPreferences.current?.();
          }
        }
        authOwner.current = nextOwner;
        // Stay synchronous inside the Auth SDK callback. No getUser or request
        // runs until the SDK's event callback has returned.
        queueMicrotask(() => { if (active.current) void reload(); });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { queueMicrotask(() => { if (active.current) setIdentity({ status: "unavailable" }); }); }
    const refreshOnFocus = () => { if (active.current) void reload(); };
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      active.current = false; requestSequence.current++; ownerSequence.current++; authOwner.current = undefined;
      unsubscribe(); window.removeEventListener("focus", refreshOnFocus);
    };
  }, [enabled, reload]);
  function refresh() {
    if (!enabled || !active.current) return;
    setIdentity({ status: "loading" });
    void reload();
  }
  return { identity, refresh, captureOwnerRevision: () => ownerRevision.current,
    isCurrentOwner: (revision: number) => active.current && revision === ownerRevision.current };
}
