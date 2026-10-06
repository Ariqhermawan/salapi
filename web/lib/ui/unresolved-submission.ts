import { isLocalPreview } from "../local-preview";

export type SubmissionResult = { ok: boolean; pending?: boolean; hash?: string };
export type SubmissionRecord = { version: 1; id: string; hash: string | null };
export type SubmissionState = { kind: "clear" } | { kind: "locked"; record: SubmissionRecord } | { kind: "unavailable" };
export const SUBMISSION_EVENT = "salapi:unresolved-submission";
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-f0-9-]{36}$/;
const contextPattern = /^[a-z0-9:_-]{1,80}$/;

function key(context: string) { return `salapi:testnet:unresolved:v1:${context}`; }
function notify() { try { window.dispatchEvent(new Event(SUBMISSION_EVENT)); } catch { /* Storage still guards the next handler. */ } }

// This is a retry safeguard, never a receipt or evidence of a successful payment.
// No amount, identity, credentials or contract result is retained.
export function readSubmissionState(context: string): SubmissionState {
  if (isLocalPreview || typeof window === "undefined") return { kind: "clear" };
  if (!contextPattern.test(context)) return { kind: "unavailable" };
  try {
    const raw = sessionStorage.getItem(key(context));
    if (raw === null) return { kind: "clear" };
    if (raw.length > 256) return { kind: "unavailable" };
    const record = JSON.parse(raw) as SubmissionRecord;
    if (!record || record.version !== 1 || !idPattern.test(record.id) || !(record.hash === null || typeof record.hash === "string" && hashPattern.test(record.hash))) return { kind: "unavailable" };
    return { kind: "locked", record: { version: 1, id: record.id, hash: record.hash } };
  } catch { return { kind: "unavailable" }; }
}

export function beginSubmission(context: string): SubmissionRecord | null {
  if (isLocalPreview || typeof window === "undefined" || readSubmissionState(context).kind !== "clear") return null;
  try {
    const record: SubmissionRecord = { version: 1, id: crypto.randomUUID(), hash: null };
    const raw = JSON.stringify(record);
    sessionStorage.setItem(key(context), raw);
    if (sessionStorage.getItem(key(context)) !== raw) return null;
    notify();
    return record;
  } catch { return null; }
}

export function resolveSubmission(context: string, record: SubmissionRecord, result: SubmissionResult): SubmissionState {
  if (isLocalPreview || typeof window === "undefined") return { kind: "clear" };
  const current = readSubmissionState(context);
  // A late response from an older check must not unlock a newer submission.
  if (current.kind !== "locked" || current.record.id !== record.id) return current;
  try {
    if (result.ok || result.pending !== true) {
      sessionStorage.removeItem(key(context));
    } else {
      const hash = typeof result.hash === "string" && hashPattern.test(result.hash) ? result.hash : current.record.hash;
      sessionStorage.setItem(key(context), JSON.stringify({ ...current.record, hash }));
    }
    notify();
    return readSubmissionState(context);
  } catch { return readSubmissionState(context); }
}
