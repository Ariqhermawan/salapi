"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveAccountPhoto, restoreGooglePhoto } from "@/app/account-photo-actions";
import { readAccountPhotoClient } from "@/lib/ui/account-photo-read";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { accountPhotoFileAllowed, type AccountPhoto, type AccountPhotoCode, type AccountPhotoResult } from "@/lib/account-photo";

const PHOTO_CHANGED = "salapi:account-photo-changed";
type PhotoState = { status: "loading" | "ready" | "error"; profile: AccountPhoto | null; code: AccountPhotoCode | null };

export function useAccountPhoto(isSignOutPending?: () => boolean) {
  const enabled = !isLocalPreview && supabaseConfigured();
  const [state, setState] = useState<PhotoState>({ status: enabled ? "loading" : "ready", profile: null, code: null });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<"saved" | "restored" | AccountPhotoCode | null>(null);
  const version = useRef(0);
  const active = useRef(false);
  const inFlight = useRef(false);
  const mutationOwner = useRef<string | null>(null);
  // A browser session is only a response-correlation hint. The server still
  // authenticates every GET read and Server Action write with getUser.
  const authOwner = useRef<string | null | undefined>(undefined);
  const owner = useRef<string | null>(null);
  const ownerTransitionPending = useRef(false);
  // Settings supplies a getter over its stable signout ref. Read it directly
  // during Auth events, without depending on a React state render completing.
  const explicitSignOut = useRef(isSignOutPending);

  const reload = useCallback(async () => {
    const requestedOwner = authOwner.current;
    if (!enabled || !active.current || !requestedOwner || ownerTransitionPending.current
      || (inFlight.current && mutationOwner.current === requestedOwner)) return;
    const request = ++version.current;
    try {
      const result = await readAccountPhotoClient();
      if (!active.current || request !== version.current || authOwner.current !== requestedOwner) return;
      if (result.ok) {
        // Cookies may switch accounts before the browser Auth event arrives.
        // Never render that other owner's email or photo during the gap.
        if (result.profile.ownerId !== requestedOwner) {
          owner.current = null;
          setState({ status: "error", profile: null, code: "account_changed" });
          return;
        }
        owner.current = result.profile.ownerId;
        setState({ status: "ready", profile: result.profile, code: result.profile.warning ?? null });
      } else {
        owner.current = null;
        setState({ status: result.code === "unauthenticated" ? "ready" : "error", profile: null, code: result.code });
      }
    } catch {
      if (!active.current || request !== version.current) return;
      owner.current = null;
      setState({ status: "error", profile: null, code: "unavailable" });
    }
  }, [enabled]);

  useEffect(() => {
    active.current = true;
    let disposed = false;
    let ownerReload: number | undefined;
    const cancelRequests = () => {
      disposed = true;
      version.current++; owner.current = null; authOwner.current = undefined;
      ownerTransitionPending.current = false;
      if (ownerReload !== undefined) window.clearTimeout(ownerReload);
    };
    if (!enabled) return () => { active.current = false; cancelRequests(); };
    let unsubscribe = () => {};
    const invalidate = () => {
      version.current++;
      owner.current = null;
      setPending(false);
      setMessage(null);
      setState({ status: "loading", profile: null, code: null });
    };
    try {
      const client = createSupabaseBrowser();
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (!active.current || disposed) return;
        // Auth callbacks stay synchronous. Never reuse session user metadata as
        // proof of identity; reload against getUser outside the SDK callback.
        const nextOwner = event === "SIGNED_OUT" ? null : session?.user.id ?? null;
        const previousOwner = authOwner.current;
        if (previousOwner !== nextOwner) invalidate();
        authOwner.current = nextOwner;
        if (!nextOwner) setState({ status: "ready", profile: null, code: "unauthenticated" });
        if (previousOwner !== undefined && previousOwner !== nextOwner) {
          // Home and Settings also contain mount-scoped wallet/handle data.
          // Reset the whole document, not just the avatar, on a real owner
          // change. Never fetch/render the next photo beside the old identity.
          ownerTransitionPending.current = true;
          if (ownerReload !== undefined) window.clearTimeout(ownerReload);
          // Explicit signout owns its hard redirect. In particular, assigning
          // location.href need not update location.pathname before navigation.
          if (!nextOwner && explicitSignOut.current?.()) return;
          ownerReload = window.setTimeout(() => {
            ownerReload = undefined;
            if (!active.current || disposed) return;
            if (!authOwner.current && explicitSignOut.current?.()) return;
            // Explicit Settings signout already performs a hard redirect after
            // the SDK resolves. Let that navigation win over this fallback.
            if (window.location.pathname === "/signin") return;
            window.location.reload();
          }, 0);
        } else if (nextOwner) {
          queueMicrotask(() => { if (active.current && !disposed) void reload(); });
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      queueMicrotask(() => { if (active.current && !disposed) setState({ status: "error", profile: null, code: "unavailable" }); });
      return () => { active.current = false; cancelRequests(); };
    }
    // INITIAL_SESSION supplies the initial correlation owner. Until it arrives,
    // retain the neutral loading state rather than reading an unbound profile.
    const refresh = () => { if (active.current) void reload(); };
    const timer = setInterval(refresh, 15 * 60 * 1000);
    window.addEventListener("focus", refresh);
    window.addEventListener(PHOTO_CHANGED, refresh);
    return () => {
      active.current = false; cancelRequests();
      unsubscribe(); clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(PHOTO_CHANGED, refresh);
    };
  }, [enabled, reload]);

  async function mutate(kind: "saved" | "restored", file?: File) {
    const expectedOwner = owner.current;
    if (!enabled || !expectedOwner || inFlight.current) return;
    if (kind === "saved" && (!file || !accountPhotoFileAllowed(file))) { setMessage("invalid_file"); return; }
    inFlight.current = true;
    mutationOwner.current = expectedOwner;
    const request = ++version.current;
    setPending(true); setMessage(null);
    try {
      let result: AccountPhotoResult;
      if (kind === "saved") {
        const data = new FormData(); data.set("photo", file!);
        result = await saveAccountPhoto(expectedOwner, data);
      } else result = await restoreGooglePhoto(expectedOwner);
      if (!active.current || request !== version.current || owner.current !== expectedOwner || authOwner.current !== expectedOwner) return;
      if (!result.ok) {
        if (result.code === "account_changed" || result.code === "unauthenticated") {
          owner.current = null;
          setState({ status: result.code === "unauthenticated" ? "ready" : "error", profile: null, code: result.code });
        }
        setMessage(result.code); return;
      }
      if (result.profile.ownerId !== expectedOwner) {
        owner.current = null;
        setState({ status: "error", profile: null, code: "account_changed" });
        setMessage("account_changed"); return;
      }
      setState({ status: "ready", profile: result.profile, code: result.profile.warning ?? null });
      setMessage(kind);
      // Only invalidate other mounted readers. No token, URL or private photo
      // data is placed into localStorage or an event payload.
      window.dispatchEvent(new Event(PHOTO_CHANGED));
    } catch {
      if (active.current && request === version.current && owner.current === expectedOwner) setMessage("save_failed");
    } finally {
      // An Auth event must not unlock a still-running write. Retire its lock
      // when it actually settles, even when that old response was invalidated.
      inFlight.current = false;
      mutationOwner.current = null;
      if (active.current && request === version.current) setPending(false);
    }
  }
  return { ...state, pending, message, reload, upload: (file: File) => mutate("saved", file), restore: () => mutate("restored") };
}
