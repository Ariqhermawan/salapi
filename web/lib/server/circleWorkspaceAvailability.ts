import { headers } from "next/headers";
import { isLocalPreview } from "@/lib/local-preview";
import { isWorkspaceLocalHost } from "@/lib/circles/workspace";

/** Navigation availability only. Server/API authorization remains authoritative. */
export async function workspaceEntryAvailable(): Promise<boolean> {
  if (!isLocalPreview) return process.env.CIRCLES_WORKSPACE_ENABLED === "1";
  try {
    const request = await headers();
    return isWorkspaceLocalHost(
      request.get("host"), request.get("x-forwarded-host"), request.get("origin"),
      Boolean(process.env.VERCEL || process.env.VERCEL_ENV), isLocalPreview,
    );
  } catch {
    // A missing request context must not advertise a feature it cannot serve.
    return false;
  }
}
