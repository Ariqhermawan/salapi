import { isLocalPreview, PREVIEW_WALLET } from "./local-preview";

/** Receipts for explicitly confirmed browser demos, never network receipts. */
export type PreviewTransfer = {
  id: string;
  createdAt: string;
  senderAddress: string;
  recipientHandle: string;
  recipientAddress: string;
  pesos: number;
  amountStroops: string;
};

export type PreviewTransferInput = Pick<
  PreviewTransfer,
  "recipientHandle" | "recipientAddress" | "pesos" | "amountStroops"
>;

const KEY = `salapi.preview.transfers.v1.${PREVIEW_WALLET.address}`;
const MAX_RECEIPTS = 50;
const ADDRESS = /^G[A-Z2-7]{55}$/;
const HANDLE = /^[a-z0-9_]{3,32}$/;
const AMOUNT = /^\d{1,39}$/;
const LOCAL_SEND_ID = /^local-send-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isPreviewTransferId(value: string): boolean {
  return LOCAL_SEND_ID.test(value);
}

function validInput(value: unknown): value is PreviewTransferInput {
  if (!value || typeof value !== "object") return false;
  const input = value as PreviewTransferInput;
  return (
    typeof input.recipientHandle === "string" &&
    HANDLE.test(input.recipientHandle) &&
    typeof input.recipientAddress === "string" &&
    ADDRESS.test(input.recipientAddress) &&
    input.recipientAddress !== PREVIEW_WALLET.address &&
    Number.isFinite(input.pesos) &&
    input.pesos >= 0 &&
    input.pesos <= 1_000_000_000 &&
    typeof input.amountStroops === "string" &&
    AMOUNT.test(input.amountStroops) &&
    BigInt(input.amountStroops) > 0n &&
    BigInt(input.amountStroops) < 1n << 127n
  );
}

function validReceipt(value: unknown): value is PreviewTransfer {
  if (!validInput(value)) return false;
  const receipt = value as PreviewTransfer;
  return (
    typeof receipt.id === "string" &&
    receipt.id.startsWith("local-send-") &&
    receipt.id.length <= 100 &&
    typeof receipt.createdAt === "string" &&
    Number.isFinite(Date.parse(receipt.createdAt)) &&
    receipt.senderAddress === PREVIEW_WALLET.address
  );
}

export function listPreviewTransfers(): PreviewTransfer[] {
  if (!isLocalPreview || typeof window === "undefined") return [];
  try {
    // Local demos belong to this browser profile, not to a single page visit.
    // Migrate any earlier session-only receipts so existing previews survive.
    let raw = window.localStorage.getItem(KEY);
    if (!raw) {
      raw = window.sessionStorage.getItem(KEY);
      if (raw) {
        try { window.localStorage.setItem(KEY, raw); } catch { /* Keep the session copy available. */ }
      }
    }
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.transfers)) return [];
    return data.transfers
      .filter(validReceipt)
      .slice(0, MAX_RECEIPTS)
      .sort(
        (a: PreviewTransfer, b: PreviewTransfer) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      )
      .map((receipt: PreviewTransfer) => ({
        id: receipt.id,
        createdAt: receipt.createdAt,
        senderAddress: receipt.senderAddress,
        recipientHandle: receipt.recipientHandle,
        recipientAddress: receipt.recipientAddress,
        pesos: receipt.pesos,
        amountStroops: receipt.amountStroops,
      }));
  } catch {
    // A disabled storage service or invalid prior schema must not break Activity.
    return [];
  }
}

/** Call only after the user confirms a local Send demo. Never generates a hash. */
export function recordPreviewTransfer(
  input: PreviewTransferInput,
): PreviewTransfer | null {
  if (!isLocalPreview || typeof window === "undefined" || !validInput(input))
    return null;
  try {
    const receipt: PreviewTransfer = {
      recipientHandle: input.recipientHandle,
      recipientAddress: input.recipientAddress,
      pesos: input.pesos,
      amountStroops: input.amountStroops,
      senderAddress: PREVIEW_WALLET.address,
      id: `local-send-${window.crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    const transfers = [receipt, ...listPreviewTransfers()].slice(
      0,
      MAX_RECEIPTS,
    );
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, transfers }));
    return receipt;
  } catch {
    return null;
  }
}
