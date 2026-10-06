import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorkspaceActor, WorkspaceCampaign, WorkspaceMedia, WorkspaceReview, WorkspaceSupport, WorkspaceUpdate } from "../circles/workspace";

export type StoredMedia = WorkspaceMedia & { objectPath: string };
export type LocalWorkspaceStore = { version: 1; profiles: WorkspaceActor[]; campaigns: WorkspaceCampaign[]; updates: WorkspaceUpdate[]; reviews: WorkspaceReview[]; supports: WorkspaceSupport[]; follows: { campaignId: string; userId: string }[]; media: StoredMedia[] };
export const newLocalWorkspaceStore = (): LocalWorkspaceStore => ({ version: 1, profiles: [], campaigns: [], updates: [], reviews: [], supports: [], follows: [], media: [] });
/** OS-local path is never a Vercel deployment filesystem or committed public directory. */
export function circleWorkspaceDirectory(): string {
  const project = createHash("sha256").update(path.resolve(/* turbopackIgnore: true */ process.cwd())).digest("hex").slice(0, 16);
  return path.resolve(/* turbopackIgnore: true */ process.env.LOCALAPPDATA || tmpdir(), "Salapi", "circles-workspace", project);
}
export function boundedWorkspacePath(directory: string, name: string): string {
  const base = path.resolve(directory);
  const target = path.resolve(base, name);
  if (!target.startsWith(base + path.sep) || name.includes("..") || path.isAbsolute(name)) throw new Error("Invalid storage path.");
  return target;
}
export async function readLocalWorkspace(directory = circleWorkspaceDirectory()): Promise<LocalWorkspaceStore> {
  try {
    const raw = await readFile(boundedWorkspacePath(directory, "workspace.json"), "utf8");
    if (raw.length > 12 * 1024 * 1024) throw new Error("Local workspace is too large.");
    const data = JSON.parse(raw) as LocalWorkspaceStore;
    if (data.version !== 1 || ![data.profiles, data.campaigns, data.updates, data.reviews, data.supports, data.follows, data.media].every(Array.isArray)) throw new Error("Local workspace format is invalid.");
    return data;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return newLocalWorkspaceStore(); throw error; }
}
/** Serialized across requests/processes, exclusive lock and atomic rename prevent lost writes. */
export async function mutateLocalWorkspace<T>(mutate: (store: LocalWorkspaceStore) => T | Promise<T>, directory = circleWorkspaceDirectory()): Promise<T> {
  await mkdir(directory, { recursive: true });
  const lockPath = boundedWorkspacePath(directory, "workspace.lock");
  let lock;
  // A 1-second budget can reject valid queued writes during a full test/build load.
  // Keep a bounded wait, but allow the filesystem time to serialize the queue.
  for (let attempt = 0; attempt < 400; attempt++) {
    try { lock = await open(lockPath, "wx"); break; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Windows can report EPERM while another request's deleted lock is still
      // delete-pending. Retry acquisition only; never bypass or delete a lock.
      if (code !== "EEXIST" && !(process.platform === "win32" && (code === "EPERM" || code === "EBUSY"))) throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  if (!lock) throw new Error("Workspace sedang dipakai. Coba lagi beberapa saat.");
  const temporary = boundedWorkspacePath(directory, `${randomUUID()}.tmp`);
  try {
    const store = await readLocalWorkspace(directory);
    const result = await mutate(store);
    if (store.campaigns.length > 500 || store.updates.length > 3000 || store.media.length > 4000 || store.reviews.length > 5000) throw new Error("Batas workspace lokal tercapai.");
    const serialized = JSON.stringify(store);
    if (serialized.length > 12 * 1024 * 1024) throw new Error("Batas workspace lokal tercapai.");
    await writeFile(temporary, serialized, { flag: "wx", mode: 0o600 });
    await rename(temporary, boundedWorkspacePath(directory, "workspace.json"));
    return result;
  } finally {
    await unlink(temporary).catch(() => undefined);
    await lock.close();
    await unlink(lockPath);
  }
}
export function registerLocalActor(store: LocalWorkspaceStore, actor: WorkspaceActor) {
  if (!store.profiles.some(p => p.id === actor.id)) store.profiles.push(actor);
}
export function ownedLocalCampaign(store: LocalWorkspaceStore, id: string, actor: WorkspaceActor): WorkspaceCampaign {
  const campaign = store.campaigns.find(c => c.id === id);
  if (!campaign) throw new Error("Campaign tidak ditemukan.");
  if (campaign.organizerId !== actor.id) throw new Error("Hanya organizer campaign ini yang dapat mengubahnya.");
  return campaign;
}
export function ownLocalMedia(store: LocalWorkspaceStore, ids: string[], actor: WorkspaceActor) {
  if (ids.some(id => !store.media.some(m => m.id === id && m.ownerId === actor.id))) throw new Error("Foto tidak tersedia atau bukan milik Anda.");
}
export function localMediaVisible(store: LocalWorkspaceStore, media: StoredMedia, actor: WorkspaceActor | null): boolean {
  return media.ownerId === actor?.id || store.campaigns.some(c => c.coverMediaId === media.id) || store.updates.some(u => u.mediaIds.includes(media.id));
}
