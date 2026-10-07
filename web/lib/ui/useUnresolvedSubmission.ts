"use client";

import { useEffect, useRef, useState } from "react";
import { checkSubmittedTransaction } from "@/app/actions";
import { isLocalPreview } from "@/lib/local-preview";
import { beginSubmission, readSubmissionState, resolveSubmission, SUBMISSION_EVENT, type SubmissionResult, type SubmissionState } from "./unresolved-submission";

export function useUnresolvedSubmission(context: string, options?: { keepSuccessLocked?: boolean }) {
  const [state, setState] = useState<SubmissionState>({ kind: "clear" });
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    if (isLocalPreview) return;
    const sync = () => setState(readSubmissionState(context));
    const timer = setTimeout(sync, 0);
    window.addEventListener(SUBMISSION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { clearTimeout(timer); window.removeEventListener(SUBMISSION_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [context]);

  async function run<T extends SubmissionResult>(action: () => Promise<T>): Promise<T | null> {
    if (isLocalPreview || inFlight.current) return null;
    const record = beginSubmission(context);
    const current = readSubmissionState(context);
    setState(!record && current.kind === "clear" ? { kind: "unavailable" } : current);
    if (!record) return null;
    inFlight.current = true;
    setNotice("");
    try {
      const result = await action();
      // Some features have a second, independently verified recovery step.
      // Preserve the hash until that step finishes, not merely until RPC SUCCESS.
      setState(resolveSubmission(context, record, options?.keepSuccessLocked && result.ok
        ? { ...result, ok: false, pending: true } : result));
      return result;
    } catch {
      // The pre-submission unknown marker survives transport loss and remount.
      setState(readSubmissionState(context));
      setNotice("The connection ended without a definitive result. Do not submit this operation again.");
      return null;
    } finally { inFlight.current = false; }
  }

  async function check(): Promise<boolean> {
    if (isLocalPreview || inFlight.current) return false;
    const current = readSubmissionState(context);
    if (current.kind !== "locked" || !current.record.hash) return false;
    inFlight.current = true;
    setChecking(true);
    try {
      const result = await checkSubmittedTransaction(current.record.hash);
      const retained = !!options?.keepSuccessLocked && result.ok;
      const next = resolveSubmission(context, current.record, retained ? { ...result, ok: false, pending: true } : result);
      setState(next);
      if (result.pending) { setNotice("Testnet has not returned a definitive result. Retry remains locked."); return false; }
      setNotice(result.ok ? retained
        ? "Testnet confirms success. The recovery safeguard remains locked until the feature verifies and saves its receipt. Do not send again."
        : "Testnet confirms this submission succeeded. Refresh the feature state to view its current result."
        : "Testnet reports a definitive failure. Refresh the feature state before another attempt.");
      if (!retained && next.kind !== "clear") setNotice("The status was checked, but the browser retry safeguard could not be cleared. Do not resubmit.");
      return true;
    } catch { setNotice("Status is still unknown. No transaction was resubmitted."); return false; }
    finally { inFlight.current = false; setChecking(false); }
  }

  function clearVerified(hash: string) {
    if (!options?.keepSuccessLocked || !/^[a-f0-9]{64}$/.test(hash)) return false;
    const current = readSubmissionState(context);
    if (current.kind !== "locked" || current.record.hash !== hash) return false;
    const next = resolveSubmission(context, current.record, { ok: true, hash });
    setState(next);
    if (next.kind === "clear") setNotice("");
    return next.kind === "clear";
  }

  return { state, locked: !isLocalPreview && state.kind !== "clear", checking, notice, run, check, clearVerified };
}
