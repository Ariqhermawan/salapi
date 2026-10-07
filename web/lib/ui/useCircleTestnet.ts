"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readPublicCircleTestnet } from "@/lib/ui/public-read";
import type { CircleTestnetCampaignResult } from "@/lib/circles/testnet";

function unavailable(circleId: string): CircleTestnetCampaignResult {
  return { ok: false, available: false, code: "unavailable", network: "testnet", contractId: null,
    circleId, qaLabel: "QA Testnet · fictional cause", donationOpen: false, mapping: null, campaign: null, now: null };
}

/** Public mapping only. Personal donation contributions must stay request/auth scoped. */
export function useCircleTestnet(circleId: string, enabled = true) {
  const [state, setState] = useState<{ circleId: string; result: CircleTestnetCampaignResult | null; loading: boolean }>(
    { circleId, result: null, loading: enabled });
  const active = useRef<{ circleId: string; alive: boolean } | null>(null);
  const revision = useRef(0);
  const refresh = useCallback(async (): Promise<CircleTestnetCampaignResult | null> => {
    const effect = active.current;
    if (!enabled || !effect?.alive || effect.circleId !== circleId) return null;
    const request = ++revision.current;
    setState({ circleId, result: null, loading: true });
    let result: CircleTestnetCampaignResult;
    try {
      const read = await readPublicCircleTestnet(circleId);
      result = read.circleId === circleId ? read : unavailable(circleId);
    } catch { result = unavailable(circleId); }
    if (!effect.alive || active.current !== effect || request !== revision.current) return null;
    setState({ circleId, result, loading: false });
    return result;
  }, [circleId, enabled]);
  useEffect(() => {
    const effect = { circleId, alive: true };
    const sequence = revision;
    active.current = effect;
    if (enabled) queueMicrotask(() => { if (effect.alive) void refresh(); });
    return () => { effect.alive = false; sequence.current++; };
  }, [circleId, enabled, refresh]);
  // A changed route never flashes the previous cause's recipient or total.
  return { result: enabled && state.circleId === circleId ? state.result : null,
    loading: enabled && (state.circleId !== circleId || state.loading), refresh };
}
