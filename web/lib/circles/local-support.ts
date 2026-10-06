import { isLocalPreview, PREVIEW_WALLET } from "../local-preview";
import { isLocale, type Locale } from "../i18n/config";
import { pesoFromLocal } from "../ui/currency";
import { getCircle } from "./seed";
import type { Circle } from "./types";
import { previewPledgeAllocation } from "./pledge-allocation";

/** Explicitly confirmed browser demos. These are not payment or chain receipts. */
export type LocalSupportRecord = {
  version: 1;
  id: string;
  walletAddress: string;
  circleId: string;
  circleTitle: string;
  organizerId?: string;
  organizerLabel: string;
  confirmedAt: string;
  currency: Locale;
  displayValue: string;
  totalMinor: string;
  beneficiaryMinor: string;
  organizerMinor: string;
  beneficiaryPct: number;
  organizerPct: number;
  seenUpdateIds: string[];
  unread: 0;
};

type UpdateRef = { id: string };
export type LocalSupportInput = { circle: Circle; displayValue: string; currency: Locale };

const KEY = `salapi.preview.support.v1.${PREVIEW_WALLET.address}`;
const MAX_RECORDS = 50;
const MINOR = /^(0|[1-9]\d{0,15})$/;
const UPDATE_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function cleanUpdateIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 1000 || value.some((id) => typeof id !== "string" || !UPDATE_ID.test(id))) return null;
  return [...new Set(value as string[])];
}

function validRecord(value: unknown): value is LocalSupportRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as LocalSupportRecord;
  if (record.version !== 1 || typeof record.id !== "string" || !/^local-circle-[a-zA-Z0-9-]{1,80}$/.test(record.id)
    || record.walletAddress !== PREVIEW_WALLET.address || typeof record.circleId !== "string" || !getCircle(record.circleId)
    || typeof record.circleTitle !== "string" || record.circleTitle.length === 0 || record.circleTitle.length > 200
    || typeof record.organizerLabel !== "string" || record.organizerLabel.length === 0 || record.organizerLabel.length > 160
    || (record.organizerId !== undefined && (typeof record.organizerId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(record.organizerId)))
    || typeof record.confirmedAt !== "string" || !ISO_TIME.test(record.confirmedAt) || !Number.isFinite(Date.parse(record.confirmedAt))
    || new Date(record.confirmedAt).toISOString() !== record.confirmedAt
    || !isLocale(record.currency) || typeof record.displayValue !== "string"
    || record.unread !== 0 || cleanUpdateIds(record.seenUpdateIds) === null
    || typeof record.totalMinor !== "string" || !MINOR.test(record.totalMinor)
    || typeof record.beneficiaryMinor !== "string" || !MINOR.test(record.beneficiaryMinor)
    || typeof record.organizerMinor !== "string" || !MINOR.test(record.organizerMinor)) return false;
  const allocation = previewPledgeAllocation(record.displayValue, record.currency, record.organizerPct);
  return allocation !== null && pesoFromLocal(allocation.total, record.currency) <= 10_000_000
    && allocation.beneficiaryPct === record.beneficiaryPct
    && allocation.totalMinor.toString() === record.totalMinor
    && allocation.beneficiaryMinor.toString() === record.beneficiaryMinor
    && allocation.organizerMinor.toString() === record.organizerMinor
    && BigInt(record.beneficiaryMinor) + BigInt(record.organizerMinor) === BigInt(record.totalMinor);
}

export function readLocalSupports(): LocalSupportRecord[] {
  if (!isLocalPreview || typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.supports)) return [];
    const seen = new Set<string>();
    return data.supports.filter(validRecord).filter((record: LocalSupportRecord) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    }).sort((a: LocalSupportRecord, b: LocalSupportRecord) => Date.parse(b.confirmedAt) - Date.parse(a.confirmedAt))
      .slice(0, MAX_RECORDS).map((record: LocalSupportRecord) => ({
        version: 1, id: record.id, walletAddress: record.walletAddress, circleId: record.circleId,
        circleTitle: record.circleTitle, organizerId: record.organizerId, organizerLabel: record.organizerLabel,
        confirmedAt: record.confirmedAt, currency: record.currency, displayValue: record.displayValue,
        totalMinor: record.totalMinor, beneficiaryMinor: record.beneficiaryMinor, organizerMinor: record.organizerMinor,
        beneficiaryPct: record.beneficiaryPct, organizerPct: record.organizerPct,
        seenUpdateIds: [...new Set(record.seenUpdateIds)], unread: 0,
      }));
  } catch { return []; }
}

/** Only call after explicit confirmation of a local demo. No email or network write. */
export function recordLocalSupport(input: LocalSupportInput): LocalSupportRecord | null {
  if (!isLocalPreview || typeof window === "undefined" || !input || !isLocale(input.currency) || typeof input.displayValue !== "string") return null;
  const circle = getCircle(input.circle?.id);
  if (!circle || circle.status === "completed") return null;
  const allocation = previewPledgeAllocation(input.displayValue, input.currency, circle.allowance?.percentage ?? 0);
  if (!allocation || pesoFromLocal(allocation.total, input.currency) > 10_000_000) return null;
  try {
    const record: LocalSupportRecord = {
      version: 1, id: `local-circle-${crypto.randomUUID()}`, walletAddress: PREVIEW_WALLET.address,
      circleId: circle.id, circleTitle: circle.title, organizerId: circle.organizerId, organizerLabel: circle.organizer,
      confirmedAt: new Date().toISOString(), currency: input.currency, displayValue: input.displayValue.trim(),
      totalMinor: allocation.totalMinor.toString(), beneficiaryMinor: allocation.beneficiaryMinor.toString(), organizerMinor: allocation.organizerMinor.toString(),
      beneficiaryPct: allocation.beneficiaryPct, organizerPct: allocation.organizerPct,
      seenUpdateIds: cleanUpdateIds((circle.updates ?? []).map((update) => update.id)) ?? [], unread: 0,
    };
    sessionStorage.setItem(KEY, JSON.stringify({ version: 1, supports: [record, ...readLocalSupports()].slice(0, MAX_RECORDS) }));
    const persisted = readLocalSupports().find((support) => support.id === record.id);
    return persisted && JSON.stringify(persisted) === JSON.stringify(record) ? persisted : null;
  } catch { return null; }
}

/** Unread means new seed-update IDs since the user's explicit local seen state. */
export function unreadSupportUpdates(record: LocalSupportRecord, updates: readonly UpdateRef[] = []): number {
  const seen = new Set(record.seenUpdateIds);
  return new Set(updates.filter((update) => UPDATE_ID.test(update.id) && !seen.has(update.id)).map((update) => update.id)).size;
}

export function markCircleUpdatesSeen(circleId: string, updateIds: string[]): boolean {
  if (!isLocalPreview || typeof window === "undefined") return false;
  const circle = getCircle(circleId);
  if (!circle) return false;
  const ids = cleanUpdateIds(updateIds);
  const knownIds = new Set((circle.updates ?? []).map((update) => update.id));
  if (!ids || ids.some((id) => !knownIds.has(id))) return false;
  try {
    const supports = readLocalSupports();
    const matching = supports.filter((support) => support.circleId === circleId);
    if (!matching.length) return false;
    const next = supports.map((support) => support.circleId === circleId ? { ...support, seenUpdateIds: [...new Set([...support.seenUpdateIds, ...ids])].slice(-1000) } : support);
    sessionStorage.setItem(KEY, JSON.stringify({ version: 1, supports: next }));
    const persisted = readLocalSupports().filter((support) => matching.some((item) => item.id === support.id));
    return persisted.length === matching.length && persisted.every((support) => ids.every((id) => support.seenUpdateIds.includes(id)));
  } catch { return false; }
}
