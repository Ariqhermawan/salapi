"use client";

import Link from "next/link";
import type { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import styles from "./SubmissionStatusPanel.module.css";

export default function SubmissionStatusPanel({ guard, onRefresh, confirmedHash }: { guard: ReturnType<typeof useUnresolvedSubmission>; onRefresh?: () => void | Promise<void>; confirmedHash?: string }) {
  if (guard.state.kind === "clear" && !guard.notice) return null;
  const hash = guard.state.kind === "locked" ? guard.state.record.hash : null;
  // A retained retry safeguard can outlive a confirmed transaction while the
  // feature saves its receipt record. Confirmation must belong to this hash.
  const confirmed = !!hash && confirmedHash === hash;
  return <aside className={styles.panel} role="status" aria-live="polite">
    <strong>{confirmed ? "Testnet submission confirmed" : guard.state.kind === "unavailable" ? "Retry safeguard unavailable" : guard.state.kind === "clear" ? "Submission status checked" : "Submission not yet resolved"}</strong>
    <p>{confirmed ? "The Testnet transaction succeeded. Its receipt record is still pending. This safeguard prevents another submission while the existing receipt is verified and saved." : guard.state.kind === "unavailable" ? "Browser session storage is unavailable or unreadable. Live submissions are disabled to prevent an unsafe retry." : guard.state.kind === "locked" ? hash ? "A Testnet hash was returned, but success has not been established. Check its status without sending another transaction." : "No transaction hash was returned. Do not retry. Inspect your Testnet wallet and contract state; refreshing this page does not unlock another submission." : "This panel reports status only. It is not a payment receipt."}</p>
    {hash && <a className={styles.hash} href={`https://stellar.expert/explorer/testnet/tx/${hash}`} target="_blank" rel="noopener noreferrer">{confirmed ? "Confirmed" : "Reported"} Testnet hash: {hash}</a>}
    {!confirmed && guard.notice && <p>{guard.notice}</p>}
    <div className={styles.actions}>{hash && <button type="button" disabled={guard.checking} onClick={async () => { if (await guard.check()) await onRefresh?.(); }}>{guard.checking ? "Checking status..." : "Check submitted status"}</button>}<Link href="/activity">Open Activity</Link>{onRefresh && <button type="button" disabled={guard.checking} onClick={() => void onRefresh()}>Refresh feature state</button>}</div>
    {guard.state.kind === "locked" && <small>{confirmed ? "Receipt-record recovery never resends funds." : "This safeguard lasts only in this browser session. It does not prove whether funds moved."}</small>}
  </aside>;
}
