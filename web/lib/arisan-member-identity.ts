import type { WalletActivityIdentity } from "./wallet-activity";

export type ArisanRoomKind = "upfront" | "installments";
export type ArisanMemberIdentity = WalletActivityIdentity;
export type ArisanMemberIdentityResult =
  | { ok: true; kind: ArisanRoomKind; roomId: number; identities: ArisanMemberIdentity[] }
  | { ok: false };

/** This display projection never establishes authorization or changes a seat. */
export function arisanMemberName(address: string, identity?: ArisanMemberIdentity, previewLabel?: string): string {
  if (identity?.address === address && typeof identity.handle === "string" && /^[a-z0-9_]{3,32}$/.test(identity.handle)) return `@${identity.handle}`;
  return previewLabel || "Wallet user";
}

export function arisanMemberAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 6)}...${address.slice(-6)}` : address;
}
