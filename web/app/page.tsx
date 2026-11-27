"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { myHandle, walletState } from "@/app/actions";
import { requireWalletState } from "@/lib/wallet-state";
import { readPublicCampaigns } from "@/lib/ui/public-read";
import type { Campaign } from "@/lib/campaign";
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
  const [campaignsLoading, setCampaignsLoading] = useState(true);
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
    try {
      const state = await readPublicCampaigns("0");
      if (request !== campaignRequest.current) return;
      setCampaigns(state.ok ? state.campaigns : []);
    } catch {
      if (request === campaignRequest.current) setCampaigns([]);
    } finally {
      if (request === campaignRequest.current) setCampaignsLoading(false);
    }
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
    campaignsLoading,
    onRetryWallet: () => { void loadWallet(); },
  }} />;
}
