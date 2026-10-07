"use server";

import { resolveCirclesSignupIdentity } from "@/lib/server/circlesSignup";

// Read-only and request-scoped. No wallet provision, lookup of other users,
// subscription, or authorization based on browser-supplied email.
export async function readCirclesSignupIdentity() {
  return resolveCirclesSignupIdentity();
}
