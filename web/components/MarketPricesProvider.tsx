"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isLocalPreview } from "@/lib/local-preview";
import { QUOTE_REFRESH_MS, validateMarketPrices, type MarketPriceResult } from "@/lib/market-prices";

type MarketPricesContextValue = {
  prices: MarketPriceResult;
  loading: boolean;
  refresh: () => Promise<void>;
};
const MarketPricesContext = createContext<MarketPricesContextValue | null>(null);
const unavailable = (): MarketPriceResult => ({ status: "unavailable", source: "CoinGecko", reason: isLocalPreview ? "preview" : "provider-unavailable" });

/** One public quote request and one visibility listener for all wallet widgets. */
export function MarketPricesProvider({ children }: { children: React.ReactNode }) {
  const [prices, setPrices] = useState<MarketPriceResult>(unavailable);
  const [loading, setLoading] = useState(!isLocalPreview);
  const currentPrices = useRef(prices);
  const inFlight = useRef<Promise<void> | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const refreshFailed = useRef(false);

  const updateAge = useCallback(() => {
    let aged = validateMarketPrices(currentPrices.current, Date.now());
    if (refreshFailed.current && aged.status !== "unavailable") aged = { ...aged, status: "stale" };
    if (aged.status !== currentPrices.current.status) {
      currentPrices.current = aged;
      setPrices(aged);
    }
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (isLocalPreview || !mounted.current) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 8000);
    const task = (async () => {
      try {
        const response = await fetch("/api/market-prices", { signal: controller.signal, cache: "no-store", credentials: "omit" });
        if (!response.ok) throw new Error("Market quote unavailable");
        const incoming = validateMarketPrices(await response.json(), Date.now());
        if (incoming.status === "unavailable") {
          // The last verified quote may remain usable briefly, never indefinitely.
          const previous = validateMarketPrices(currentPrices.current, Date.now());
          refreshFailed.current = true;
          const next = previous.status === "unavailable" ? incoming : { ...previous, status: "stale" as const };
          if (mounted.current && request.current === controller) {
            currentPrices.current = next;
            setPrices(next);
          }
          return;
        }
        if (mounted.current && request.current === controller) {
          refreshFailed.current = incoming.status === "stale";
          currentPrices.current = incoming;
          setPrices(incoming);
        }
      } catch {
        if (mounted.current && request.current === controller) {
          refreshFailed.current = true;
          const previous = validateMarketPrices(currentPrices.current, Date.now());
          const next = previous.status === "unavailable" ? unavailable() : { ...previous, status: "stale" as const };
          currentPrices.current = next;
          setPrices(next);
        }
      } finally {
        clearTimeout(timeout);
        if (request.current === controller) {
          request.current = null;
          inFlight.current = null;
          if (mounted.current) setLoading(false);
        }
      }
    })();
    inFlight.current = task;
    return task;
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (isLocalPreview) return () => { mounted.current = false; };
    const initial = setTimeout(() => { void refresh(); }, 0);
    const polling = setInterval(() => { if (!document.hidden) void refresh(); }, QUOTE_REFRESH_MS);
    // Age independently of fetching, so hidden tabs or failures cannot keep an
    // expired price labelled fresh. Resume validates immediately before fetching.
    const aging = setInterval(updateAge, 1000);
    const resume = () => { updateAge(); if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", resume);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(polling);
      clearInterval(aging);
      document.removeEventListener("visibilitychange", resume);
      request.current?.abort();
      request.current = null;
      inFlight.current = null;
    };
  }, [refresh, updateAge]);

  const value = useMemo(() => ({ prices, loading, refresh }), [prices, loading, refresh]);
  return <MarketPricesContext value={value}>{children}</MarketPricesContext>;
}

export function useMarketPrices() {
  const context = useContext(MarketPricesContext);
  if (!context) throw new Error("useMarketPrices must be used within MarketPricesProvider");
  return context;
}
