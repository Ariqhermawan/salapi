/** The exact terms and account shown at invitation review. Server actions
 * re-read every field from the contract and the authenticated saved wallet;
 * this client snapshot is an expectation, never authorization or a quote.
 */
export type ArisanReviewedInvitation = {
  code: string;
  roomId: number;
  memberTarget: number;
  shareStroops: string;
  depositStroops: string;
  viewer: string;
};
