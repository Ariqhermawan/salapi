"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { myHandle, walletState } from "@/app/actions";
import { requireWalletState } from "@/lib/wallet-state";
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
  const walletRequest = useRef(0);

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

  useEffect(() => {
    const task = setTimeout(() => { void loadWallet(); }, 0);
    return () => {
      clearTimeout(task);
      walletRequest.current++;
    };
  }, [loadWallet]);

  return <PrototypeHomeScreen liveData={{
    guest,
    handle,
    wallet,
    walletLoading: wallet === null && !walletError,
    walletError,
    onRetryWallet: () => { void loadWallet(); },
  }} />;
}
