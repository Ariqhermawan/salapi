import { SEED_CIRCLES } from "./circles/seed";

/** Cover only for an active catalog association already verified by the server.
 * Never infer an association from a numeric campaign ID or user-authored title,
 * and never present a fictional organizer as the owner of a Testnet wallet.
 */
export function vaultCircleCover(circleId: string | undefined): string | null {
  if (!circleId) return null;
  return SEED_CIRCLES.find(circle => circle.id === circleId)?.coverImage ?? null;
}
