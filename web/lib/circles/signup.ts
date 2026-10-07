// Launch notifications are subscriptions, never financial contributions.
// The verified account fields below come from server auth.getUser(), not form input.
export type CirclesSignupIdentity =
  | { status: "guest" }
  | { status: "verified"; ownerId: string; email: string; source: "google" | "account" }
  | { status: "unavailable" | "unverified" };

export type CirclesSignupInput = {
  email?: string;
  expectedOwnerId?: string;
  circleId: string;
  locale: string;
  pesoPledge: number;
  anonymous: boolean;
  notifyOk: boolean;
  marketingOk: boolean;
};

export type CirclesSignupResult =
  | { ok: true; kind: "launch-subscription"; persisted: true }
  | { ok: false; error: string };
