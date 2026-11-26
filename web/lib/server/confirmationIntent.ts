import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { readAccountWallet } from "@/lib/server/accountWallet";
import {
  confirmationIntentDigest,
  CONFIRMATION_INTENT_TTL_SECONDS,
  type ConfirmationIntentAction,
  validConfirmationIntentId,
} from "@/lib/confirmation-intent";

export type ConfirmationWallet = Extract<Awaited<ReturnType<typeof readAccountWallet>>, { ok: true }>;

export type StoredConfirmationIntent = {
  id: string;
  action: ConfirmationIntentAction;
  ownerId: string;
  walletAddress: string;
  payload: unknown;
  transactionXdr: string;
  feeStroops: string;
  expiresAt: string;
};

function canonicalExpiry(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new Error("The saved confirmation expiry is invalid.");
  return new Date(value).toISOString();
}

async function confirmationWallet(): Promise<ConfirmationWallet> {
  const result = await readAccountWallet();
  if (result.ok) return result;
  if (result.code === "guest") throw new Error("Sign in with your Salapi account before confirming this transaction.");
  if (result.code === "no_wallet") throw new Error("Your personal Testnet wallet is not ready. Set it up before confirming a transaction.");
  throw new Error("Your authenticated wallet could not be verified. No transaction was prepared.");
}

export async function getConfirmationWallet(): Promise<ConfirmationWallet> {
  return confirmationWallet();
}

export async function createConfirmationIntent(input: {
  action: ConfirmationIntentAction;
  payload: unknown;
  transactionXdr: string;
  feeStroops: string;
  expectedWallet?: Pick<ConfirmationWallet, "ownerId" | "address">;
}): Promise<StoredConfirmationIntent & { summaryWallet: string }> {
  const wallet = await confirmationWallet();
  if (input.expectedWallet && (input.expectedWallet.ownerId !== wallet.ownerId
    || input.expectedWallet.address !== wallet.address))
    throw new Error("Your account wallet changed. Review the action again.");
  if (typeof input.transactionXdr !== "string" || input.transactionXdr.length > 128_000
    || !/^[1-9]\d{0,15}$/.test(input.feeStroops))
    throw new Error("The transaction could not be prepared safely. Review it again.");

  const payloadJson = JSON.stringify(input.payload);
  if (payloadJson === undefined || payloadJson.length > 24_000)
    throw new Error("The action is too large to confirm safely.");
  const payload = JSON.parse(payloadJson) as unknown;
  const expiresAt = new Date(Date.now() + CONFIRMATION_INTENT_TTL_SECONDS * 1000).toISOString();
  const intentHash = confirmationIntentDigest({
    action: input.action,
    ownerId: wallet.ownerId,
    walletAddress: wallet.address,
    payload,
    transactionXdr: input.transactionXdr,
    feeStroops: input.feeStroops,
    expiresAt,
  });
  const { data, error } = await createSupabaseAdmin().from("wallet_confirmation_intents")
    .insert({
      owner_id: wallet.ownerId,
      wallet_address: wallet.address,
      action: input.action,
      payload,
      transaction_xdr: input.transactionXdr,
      fee_stroops: input.feeStroops,
      intent_hash: intentHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || typeof data?.id !== "string")
    throw new Error("The transaction could not be saved for confirmation. No transaction was submitted.");

  return {
    id: data.id,
    action: input.action,
    ownerId: wallet.ownerId,
    walletAddress: wallet.address,
    payload,
    transactionXdr: input.transactionXdr,
    feeStroops: input.feeStroops,
    expiresAt,
    summaryWallet: wallet.address,
  };
}

export async function consumeConfirmationIntent(
  id: unknown,
  action: ConfirmationIntentAction,
): Promise<StoredConfirmationIntent> {
  if (!validConfirmationIntentId(id)) throw new Error("This confirmation is invalid. Review the transaction again.");
  const wallet = await confirmationWallet();
  const consumedAt = new Date().toISOString();
  const { data, error } = await createSupabaseAdmin().from("wallet_confirmation_intents")
    .update({ consumed_at: consumedAt })
    .eq("id", id)
    .eq("owner_id", wallet.ownerId)
    .eq("wallet_address", wallet.address)
    .eq("action", action)
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select("id, owner_id, wallet_address, action, payload, transaction_xdr, fee_stroops, intent_hash, expires_at")
    .maybeSingle();
  if (error) throw new Error("The confirmation service is unavailable. No transaction was submitted.");
  if (!data) throw new Error("This confirmation expired or was already used. Review the action again.");

  const intent = {
    action: data.action as ConfirmationIntentAction,
    ownerId: data.owner_id as string,
    walletAddress: data.wallet_address as string,
    payload: data.payload as unknown,
    transactionXdr: data.transaction_xdr as string,
    feeStroops: data.fee_stroops as string,
    expiresAt: canonicalExpiry(data.expires_at),
  };
  if (intent.action !== action || typeof intent.transactionXdr !== "string"
    || !/^[1-9]\d{0,15}$/.test(intent.feeStroops)
    || confirmationIntentDigest(intent) !== data.intent_hash)
    throw new Error("The saved confirmation changed. Review the action again.");

  return { id: data.id as string, ...intent };
}

export async function cancelConfirmationIntent(
  id: unknown,
  action: ConfirmationIntentAction,
): Promise<boolean> {
  if (!validConfirmationIntentId(id)) return false;
  const wallet = await confirmationWallet();
  const { data, error } = await createSupabaseAdmin().from("wallet_confirmation_intents")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", wallet.ownerId)
    .eq("wallet_address", wallet.address)
    .eq("action", action)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  return !error && typeof data?.id === "string";
}
