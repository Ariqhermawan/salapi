import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { verifiedAccountOwner } from "@/lib/server/verifiedAccountOwner";
import { parseCircleDraft, type CircleDraft } from "@/lib/circles/drafts";

const TABLE = "circles_drafts";
type Failure = { ok: false; code: "local_preview" | "unavailable" | "unauthenticated" | "unverified" | "account_changed" | "invalid"; error: string };
const ownerError = (code: Exclude<Failure["code"], "invalid">) => ({
  local_preview: "Local preview does not save account drafts.",
  unavailable: "Private draft storage is unavailable. Nothing was saved.",
  unauthenticated: "Sign in with a verified account to save a private draft.",
  unverified: "Verify your account email before saving a private draft.",
  account_changed: "Your signed-in account changed. Refresh the page and try again.",
})[code];

export async function saveCircleDraft(input: unknown, expectedOwnerId: unknown): Promise<{ ok: true; draft: CircleDraft; persisted: true } | Failure> {
  const who = await verifiedAccountOwner(expectedOwnerId);
  if (!who.ok) return { ...who, error: ownerError(who.code) };
  const draft = parseCircleDraft(input, new Date().toISOString());
  if (!draft) return { ok: false, code: "invalid", error: "The draft details could not be verified. Nothing was saved." };
  try {
    const { data, error } = await createSupabaseAdmin().from(TABLE)
      .upsert({ user_id: who.userId, draft, updated_at: draft.savedAt }, { onConflict: "user_id" })
      .select("draft").single();
    const stored = parseCircleDraft(data?.draft, draft.savedAt);
    if (error || !stored) return { ok: false, code: "unavailable", error: "The private draft could not be confirmed. Your local copy is unchanged." };
    return { ok: true, draft: stored, persisted: true };
  } catch {
    return { ok: false, code: "unavailable", error: "The private draft could not be confirmed. Your local copy is unchanged." };
  }
}

export async function readCircleDraft(expectedOwnerId: unknown): Promise<{ ok: true; draft: CircleDraft | null } | Failure> {
  const who = await verifiedAccountOwner(expectedOwnerId);
  if (!who.ok) return { ...who, error: ownerError(who.code) };
  try {
    const { data, error } = await createSupabaseAdmin().from(TABLE).select("draft")
      .eq("user_id", who.userId).maybeSingle();
    if (error) return { ok: false, code: "unavailable", error: "Your private draft could not be loaded. Try again." };
    if (!data) return { ok: true, draft: null };
    const draft = parseCircleDraft(data.draft);
    return draft ? { ok: true, draft } : { ok: false, code: "unavailable", error: "The saved draft could not be verified. It was not changed." };
  } catch {
    return { ok: false, code: "unavailable", error: "Your private draft could not be loaded. Try again." };
  }
}
