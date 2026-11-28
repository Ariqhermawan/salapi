"use server";

import { StrKey } from "@stellar/stellar-sdk";
import { isLocalPreview } from "@/lib/local-preview";
import { xlmToStroopsExact } from "@/lib/money";
import {
  STELLAR_BASE_FEE_STROOPS,
  prepareNativePaymentAs,
  submitPreparedNativePaymentAs,
  txLink,
} from "@/lib/server/stellar";
import { getAuthenticatedSigner } from "@/lib/server/userWallet";
import { WalletAccountMissingError, getTestnetNativeBalance } from "@/lib/server/walletReadiness";
import { recordWalletWithdrawalLabel } from "@/lib/server/walletActivityWithdrawal";
import {
  cancelConfirmationIntent,
  consumeConfirmationIntent,
  createConfirmationIntent,
  getConfirmationWallet,
} from "@/lib/server/confirmationIntent";

const MINIMUM_ACCOUNT_RESERVE_STROOPS = 10_000_000n;
const MAX_WITHDRAWAL_STROOPS = 10_000_000_000_000_000n;

type WithdrawalPayload = {
  network: "Testnet";
  sender: string;
  recipient: string;
  amountStroops: string;
  memoType: "none" | "text" | "id";
  memo: string;
};

function parseWithdrawalPayload(value: unknown): WithdrawalPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.network !== "Testnet"
    || typeof payload.sender !== "string" || !StrKey.isValidEd25519PublicKey(payload.sender)
    || typeof payload.recipient !== "string" || !StrKey.isValidEd25519PublicKey(payload.recipient)
    || payload.sender === payload.recipient
    || typeof payload.amountStroops !== "string" || !/^[1-9]\d{0,15}$/.test(payload.amountStroops)
    || BigInt(payload.amountStroops) > MAX_WITHDRAWAL_STROOPS
    || typeof payload.memo !== "string"
    || payload.memoType !== "none" && payload.memoType !== "text" && payload.memoType !== "id"
    || payload.memoType === "none" && payload.memo !== ""
    || payload.memoType === "text" && Buffer.byteLength(payload.memo, "utf8") > 28
    || payload.memoType === "id" && (!/^(?:0|[1-9]\d{0,19})$/.test(payload.memo) || BigInt(payload.memo) > 18_446_744_073_709_551_615n))
    return null;
  return payload as WithdrawalPayload;
}

/** Read the current account's balance without creating or funding a wallet. */
export async function walletWithdrawalState() {
  if (isLocalPreview) return { ok: false as const, error: "Local preview does not read or use Testnet wallets." };
  try {
    const wallet = await getConfirmationWallet();
    const balance = await getTestnetNativeBalance(wallet.address);
    const fee = BigInt(STELLAR_BASE_FEE_STROOPS);
    const withdrawable = balance > MINIMUM_ACCOUNT_RESERVE_STROOPS + fee
      ? balance - MINIMUM_ACCOUNT_RESERVE_STROOPS - fee
      : 0n;
    return {
      ok: true as const,
      address: wallet.address,
      balanceStroops: balance.toString(),
      withdrawableStroops: withdrawable.toString(),
      feeStroops: fee.toString(),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Your Testnet wallet is unavailable.",
    };
  }
}

/** Prepare a reviewed native-XLM transfer; no transaction is submitted here. */
export async function prepareWalletWithdrawal(input: {
  recipient: unknown;
  amountXlm: unknown;
  memoType: unknown;
  memo: unknown;
}) {
  if (isLocalPreview) return { ok: false as const, error: "Local preview cannot prepare Testnet withdrawals." };
  if (!input || typeof input !== "object") return { ok: false as const, error: "Enter valid withdrawal details." };
  const recipient = typeof input.recipient === "string" ? input.recipient.trim() : "";
  const memo = typeof input.memo === "string" ? input.memo.trim() : "";
  const memoType = memo ? input.memoType : "none";
  const amount = xlmToStroopsExact(input.amountXlm);
  if (!StrKey.isValidEd25519PublicKey(recipient))
    return { ok: false as const, error: "Enter a valid Stellar public address." };
  if (amount == null || amount <= 0n || amount > MAX_WITHDRAWAL_STROOPS)
    return { ok: false as const, error: "Enter an XLM amount with up to 7 decimal places." };
  if (memoType !== "none" && memoType !== "text" && memoType !== "id")
    return { ok: false as const, error: "Choose a valid Stellar memo type." };
  if (memoType === "text" && Buffer.byteLength(memo, "utf8") > 28)
    return { ok: false as const, error: "The memo must be 28 bytes or fewer." };
  if (memoType === "id" && (!/^(?:0|[1-9]\d{0,19})$/.test(memo) || BigInt(memo) > 18_446_744_073_709_551_615n))
    return { ok: false as const, error: "Enter a valid numeric Stellar memo ID." };

  try {
    const wallet = await getConfirmationWallet();
    if (wallet.address === recipient) return { ok: false as const, error: "Choose a wallet other than your own." };
    const balance = await getTestnetNativeBalance(wallet.address);
    const fee = BigInt(STELLAR_BASE_FEE_STROOPS);
    const reserveAndFee = MINIMUM_ACCOUNT_RESERVE_STROOPS + fee;
    if (balance <= reserveAndFee || amount > balance - reserveAndFee)
      return { ok: false as const, error: "The amount exceeds your spendable Testnet XLM balance." };

    try {
      await getTestnetNativeBalance(recipient);
    } catch (error) {
      if (error instanceof WalletAccountMissingError)
        return { ok: false as const, error: "That Stellar wallet is not active on Testnet yet." };
      throw error;
    }

    const payload: WithdrawalPayload = {
      network: "Testnet",
      sender: wallet.address,
      recipient,
      amountStroops: amount.toString(),
      memoType,
      memo,
    };
    const prepared = await prepareNativePaymentAs(wallet.address, recipient, amount.toString(), memoType, memo);
    const intent = await createConfirmationIntent({
      action: "wallet_withdrawal",
      payload,
      transactionXdr: prepared.transactionXdr,
      feeStroops: prepared.feeStroops,
      expectedWallet: wallet,
    });
    return {
      ok: true as const,
      intentId: intent.id,
      sender: wallet.address,
      recipient,
      amountStroops: amount.toString(),
      feeStroops: intent.feeStroops,
      expiresAt: intent.expiresAt,
    };
  } catch (error) {
    if (error instanceof WalletAccountMissingError)
      return { ok: false as const, error: "Your Testnet wallet is not active yet. Finish wallet setup and try again." };
    return { ok: false as const, error: "Testnet could not prepare this withdrawal. Nothing was sent; check the wallet and try again." };
  }
}

/** Confirm the single-use review intent, then sign and submit its exact payment. */
export async function confirmWalletWithdrawal(intentId: string) {
  if (isLocalPreview) return { ok: false as const, error: "Local preview cannot submit Testnet withdrawals." };
  try {
    const intent = await consumeConfirmationIntent(intentId, "wallet_withdrawal");
    const payload = parseWithdrawalPayload(intent.payload);
    if (!payload || payload.sender !== intent.walletAddress)
      return { ok: false as const, error: "The saved withdrawal details are invalid. Review it again." };
    const signer = await getAuthenticatedSigner(intent.ownerId);
    if (signer.demo || signer.publicKey !== payload.sender)
      return { ok: false as const, error: "Your signed-in wallet changed. Review the withdrawal again." };
    const result = await submitPreparedNativePaymentAs(signer.secret, intent.transactionXdr, {
      source: payload.sender,
      destination: payload.recipient,
      amountStroops: payload.amountStroops,
      memoType: payload.memoType,
      memo: payload.memo,
      feeStroops: intent.feeStroops,
    });
    if (result.ok || result.pending && result.hash) {
      const activityLabelSaved = await recordWalletWithdrawalLabel({ ownerId: intent.ownerId, walletAddress: payload.sender, hash: result.hash });
      if (result.ok) return { ok: true as const, hash: result.hash, link: txLink(result.hash), activityLabelSaved };
      return { ok: false as const, pending: true as const, hash: result.hash, link: txLink(result.hash), activityLabelSaved,
        error: "The transaction status is still unknown. Do not send it again; check the Testnet transaction." };
    }
    return { ok: false as const, ...(result.hash ? { hash: result.hash, link: txLink(result.hash) } : {}),
      error: "The Testnet network did not confirm this withdrawal. Check its status before trying again." };
  } catch {
    return { ok: false as const, error: "The withdrawal could not be confirmed. Check wallet activity before trying again." };
  }
}

/** Cancel an unsubmitted review without exposing or changing its transaction. */
export async function cancelWalletWithdrawal(intentId: string) {
  if (isLocalPreview) return { ok: false as const };
  try {
    return { ok: await cancelConfirmationIntent(intentId, "wallet_withdrawal") };
  } catch {
    return { ok: false as const };
  }
}
