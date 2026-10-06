"use server";

import { cookies } from "next/headers";
import { loadWorkspace, publishWorkspace, postWorkspaceUpdate, completeWorkspace, followWorkspace, supportWorkspace, reviewWorkspace, bindWorkspaceD4, workspaceContext, WORKSPACE_ROLE_COOKIE, workspaceSafeError } from "@/lib/server/circleWorkspace";

export async function workspaceSnapshot(campaignId?: string) { return loadWorkspace(campaignId); }
export async function workspacePublish(input: unknown) { return publishWorkspace(input); }
export async function workspacePostUpdate(input: unknown) { return postWorkspaceUpdate(input); }
export async function workspaceComplete(id: string) { return completeWorkspace(id); }
export async function workspaceFollow(id: string, follow: boolean) { return followWorkspace(id, follow); }
export async function workspaceSupport(id: string, amount: string) { return supportWorkspace(id, amount); }
export async function workspaceReview(input: unknown) { return reviewWorkspace(input); }
export async function workspaceBindD4(id: string, contractId: string) { return bindWorkspaceD4(id, contractId); }
export async function workspaceLocalRole(role: "organizer" | "donor" | "visitor") {
  try {
    const context = await workspaceContext();
    if (context.mode !== "local" || !["organizer", "donor", "visitor"].includes(role)) throw new Error("Peran uji hanya tersedia di localhost.");
    (await cookies()).set(WORKSPACE_ROLE_COOKIE, role, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 8 });
    return { ok: true as const, value: undefined };
  } catch (error) { return { ok: false as const, error: workspaceSafeError(error) }; }
}
