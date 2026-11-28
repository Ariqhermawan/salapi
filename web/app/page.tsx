"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { myHandle, walletState } from "@/app/actions";
import { requireWalletState } from "@/lib/wallet-state";
import { readPublicCampaigns } from "@/lib/ui/public-read";
import type { Campaign } from "@/lib/campaign";
import { HOME_CAMPAIGN_LIMIT, HOME_CAMPAIGN_MAX_PAGES, HOME_CAMPAIGN_PAGE_SIZE, selectHomeCampaigns } from "@/lib/home-campaigns";
import { isLocalPreview } from "@/lib/local-preview";
import { useAccountPhoto } from "@/components/useAccountPhoto";
import PrototypeHomeScreen, { type PrototypeHomeLiveData } from "@/components/screens/PrototypeHomeScreen";

export default function Home() {
  if (isLocalPreview) return <PrototypeHomeScreen />;
  return <LiveHome />;
}

function LiveHome() {
  const photo = useAccountPhoto();
  const guest = photo.code === "unauthenticated";
  const [wallet, setWallet] = useState<PrototypeHomeLiveData["wallet"]>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");
  const [campaigns, setCampaigns] = useState<Omit<Campaign, "contribution">[]>([]);
  const [campaignsNow, setCampaignsNow] = useState<string | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState(false);
  const walletRequest = useRef(0);
  const campaignRequest = useRef(0);

  const loadWallet = useCallback(async () => {
    const request = ++walletRequest.current;
    setWalletError("");
    const balance = async () => {
      try {
        const state = requireWalletState(await walletState());
        if (request === walletRequest.current) setWallet(state);
      } catch {
        if (request === walletRequest.current) setWalletError("Your wallet balance is unavailable.");
      }
    };
    const identity = async () => {
      try {
        const name = await myHandle();
        if (request === walletRequest.current) setHandle(name);
      } catch {
        if (request === walletRequest.current) setHandle(null);
      }
    };
    await Promise.all([balance(), identity()]);
  }, []);

  const loadCampaigns = useCallback(async () => {
    const request = ++campaignRequest.current;
    setCampaignsLoading(true);
    setCampaignsError(false);
    const latest: Omit<Campaign, "contribution">[] = [];
    let ledgerTime: string | null = null;
    let failed = false;
    let before = "0";
    try {
      for (let page = 0; page < HOME_CAMPAIGN_MAX_PAGES; page++) {
        const state = await readPublicCampaigns(before);
        if (request !== campaignRequest.current) return;
        if (!state.ok) { failed = true; break; }
        latest.push(...state.campaigns);
        ledgerTime = state.now;
        if (selectHomeCampaigns(latest, ledgerTime, HOME_CAMPAIGN_LIMIT).length >= HOME_CAMPAIGN_LIMIT
          || state.campaigns.length < HOME_CAMPAIGN_PAGE_SIZE) break;
        const last = state.campaigns.at(-1)?.id;
        if (!last || last === before) break;
        before = last;
      }
    } catch { failed = true; }
    if (request !== campaignRequest.current) return;
    setCampaigns(latest);
    setCampaignsNow(ledgerTime);
    setCampaignsError(failed);
    setCampaignsLoading(false);
  }, []);

  useEffect(() => {
    const task = setTimeout(() => { void loadWallet(); void loadCampaigns(); }, 0);
    return () => {
      clearTimeout(task);
      walletRequest.current++;
      campaignRequest.current++;
    };
  }, [loadWallet, loadCampaigns]);

  return <PrototypeHomeScreen liveData={{
    guest,
    handle,
    wallet,
    walletLoading: wallet === null && !walletError,
    walletError,
    campaigns,
    campaignsNow,
    campaignsLoading,
    campaignsError,
    onRetryWallet: () => { void loadWallet(); },
    onRetryCampaigns: () => { void loadCampaigns(); },
  }} />;
}
