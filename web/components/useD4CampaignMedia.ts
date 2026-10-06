"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { campaignMedia, saveCampaignMedia } from "@/app/campaign-media-actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { CAMPAIGN_MEDIA_MIN_PHOTOS, CAMPAIGN_MEDIA_MAX_PHOTOS, CAMPAIGN_MEDIA_MAX_TOTAL_BYTES, campaignMediaFileAllowed, type CampaignMediaCode, type CampaignMediaResult } from "@/lib/campaign-media";

type MediaState = { key: string; status: "loading" | "ready" | "error"; result: CampaignMediaResult | null; code: CampaignMediaCode | null; editOwner: string | null };
type Props = { campaignId: string; creatorWallet: string; viewer: string | null; localPreview: boolean };

export function useD4CampaignMedia({ campaignId, creatorWallet, viewer, localPreview }: Props) {
  const key = JSON.stringify([campaignId, creatorWallet, viewer, localPreview]);
  const [state, setState] = useState<MediaState>({ key, status: "loading", result: null, code: null, editOwner: null });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<CampaignMediaCode | "saved" | null>(null);
  const active = useRef(false), version = useRef(0), currentKey = useRef(key);
  const authOwner = useRef<string | null | undefined>(undefined);
  const binding = useRef<{ key: string; owner: string } | null>(null);
  // Do not unlock an outstanding write when an Auth event or route changes.
  const writing = useRef<{ key: string; owner: string } | null>(null);

  const reload = useCallback(async () => {
    if (localPreview || !active.current || currentKey.current !== key || authOwner.current === undefined) return;
    const requestedOwner = authOwner.current;
    if (writing.current?.key === key && writing.current.owner === requestedOwner) return;
    const request = ++version.current;
    try {
      const result = await campaignMedia(campaignId);
      if (!active.current || currentKey.current !== key || request !== version.current || requestedOwner !== authOwner.current) return;
      if (result.campaignId !== campaignId || result.network !== "testnet" || (result.ok && result.creatorWallet !== creatorWallet)) {
        binding.current = null; setState({ key, status: "error", result: null, code: "unavailable", editOwner: null }); return;
      }
      // Public photos remain public, but an uncorrelated owner must never get an editor.
      if ((result.ok || result.ownerId !== null) && result.ownerId !== requestedOwner) {
        binding.current = null;
        setState({ key, status: "error", result: { ...result, ownerId: null, canManage: false }, code: "account_changed", editOwner: null }); return;
      }
      binding.current = result.ok && result.canManage && requestedOwner && viewer === creatorWallet
        ? { key, owner: requestedOwner } : null;
      setState({ key, status: result.ok ? "ready" : "error", result, code: result.ok ? null : result.code, editOwner: binding.current?.owner ?? null });
    } catch {
      if (!active.current || currentKey.current !== key || request !== version.current) return;
      binding.current = null; setState({ key, status: "error", result: null, code: "unavailable", editOwner: null });
    }
  }, [key, campaignId, creatorWallet, viewer, localPreview]);

  useEffect(() => {
    active.current = true; currentKey.current = key; authOwner.current = undefined; binding.current = null; version.current++;
    let unsubscribe = () => {};
    const reset = () => {
      version.current++; binding.current = null;
      setPending(false); setMessage(null); setState({ key, status: "loading", result: null, code: null, editOwner: null });
    };
    const refresh = () => { if (active.current && currentKey.current === key) startTransition(() => { void reload(); }); };
    if (!localPreview) {
      if (supabaseConfigured()) {
        try {
          const { data } = createSupabaseBrowser().auth.onAuthStateChange((event, session) => {
            if (!active.current || currentKey.current !== key) return;
            const nextOwner = event === "SIGNED_OUT" ? null : session?.user.id ?? null;
            if (nextOwner !== authOwner.current) reset();
            authOwner.current = nextOwner;
            // Keep SDK callbacks synchronous. Session identity correlates replies;
            // server getUser and creator-wallet checks still authorize each write.
            queueMicrotask(refresh);
          });
          unsubscribe = () => data.subscription.unsubscribe();
        } catch { authOwner.current = null; queueMicrotask(refresh); }
      } else { authOwner.current = null; queueMicrotask(refresh); }
      window.addEventListener("focus", refresh);
    }
    const requestVersion = version;
    return () => {
      active.current = false; requestVersion.current++; authOwner.current = undefined; binding.current = null;
      unsubscribe(); window.removeEventListener("focus", refresh);
    };
  }, [key, localPreview, reload]);

  async function publish(files: readonly File[], publicAcknowledged: boolean) {
    const expected = binding.current;
    if (localPreview || !active.current || !expected || expected.key !== key || currentKey.current !== key
      || authOwner.current !== expected.owner || writing.current) return false;
    if (!publicAcknowledged) { setMessage("ack_required"); return false; }
    if (files.length < CAMPAIGN_MEDIA_MIN_PHOTOS || files.length > CAMPAIGN_MEDIA_MAX_PHOTOS
      || files.some(file => !campaignMediaFileAllowed(file)) || files.reduce((total, file) => total + file.size, 0) > CAMPAIGN_MEDIA_MAX_TOTAL_BYTES) {
      setMessage("invalid_photos"); return false;
    }
    writing.current = expected;
    const request = ++version.current;
    setPending(true); setMessage(null);
    try {
      const data = new FormData();
      for (const file of files) data.append("photos", file);
      data.set("publicAcknowledged", "true");
      const result = await saveCampaignMedia(campaignId, expected.owner, data);
      if (!active.current || currentKey.current !== key || request !== version.current || authOwner.current !== expected.owner || binding.current?.owner !== expected.owner) return false;
      if (!result.ok) {
        if (["unauthenticated", "account_changed", "no_wallet", "not_creator"].includes(result.code)) {
          binding.current = null; setState({ key, status: "error", result: null, code: result.code, editOwner: null });
        }
        setMessage(result.code); return false;
      }
      if (result.ownerId !== expected.owner || result.campaignId !== campaignId || result.network !== "testnet"
        || result.creatorWallet !== creatorWallet || !result.canManage || result.photos.length < CAMPAIGN_MEDIA_MIN_PHOTOS || result.photos.length > CAMPAIGN_MEDIA_MAX_PHOTOS) {
        binding.current = null; setState({ key, status: "error", result: null, code: "account_changed", editOwner: null }); setMessage("account_changed"); return false;
      }
      setState({ key, status: "ready", result, code: null, editOwner: expected.owner }); setMessage("saved"); return true;
    } catch {
      if (active.current && currentKey.current === key && request === version.current) setMessage("save_failed");
      return false;
    } finally {
      writing.current = null;
      if (active.current && currentKey.current === key && request === version.current) setPending(false);
    }
  }
  const current = state.key === key ? state : { key, status: "loading" as const, result: null, code: null, editOwner: null };
  return { ...current, pending: state.key === key && pending, message: state.key === key ? message : null, reload, publish };
}
