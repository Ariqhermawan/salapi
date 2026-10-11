import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type GuidancePhase = "Open" | "Commit" | "Reveal" | "Finalizable" | "Done";
const addresses = ["G" + "A".repeat(55), "G" + "B".repeat(55), "G" + "C".repeat(55), "G" + "D".repeat(55), "G" + "E".repeat(55)];
const handles = ["ariqhermawan", "nonimaharani", "maya_test", "rina_test", "bayu_test"];

export function guidanceRoom(phase: GuidancePhase, now = Math.floor(Date.now() / 1000)) {
  const active = !["Open", "Done"].includes(phase), done = phase === "Done";
  const seats = addresses.map((addr, index) => ({ addr, label: handles[index], won: done || active && index === 1,
    committed: active && phase !== "Commit" && index !== 1, revealed: active && phase === "Finalizable" && index !== 1,
    isYou: index === 0, fundedStroops: index === 4 ? null : "500000000" }));
  return { ready: true as const, id: 71, viewer: addresses[0], viewerIdentity: "personal" as "personal" | "demo" | "unverified", name: "QA isolated arisan guidance", code: phase === "Open" ? "QA7123" : null,
    host: addresses[0], hostLabel: handles[0], cadence: "Weekly" as const, cadenceSecs: 604800, memberTarget: 5, memberCount: 5,
    sharePesos: 65, shareStroops: "100000000", depositStroops: "500000000", sharePeso: "65", potPesos: 325, potPeso: "325",
    status: done ? "Done" : active ? "Active" : "Open", round: done ? 6 : active ? 2 : 0, drawPhase: active ? phase : null,
    firstKocok: now + 3600, joinDeadline: now + 1800, commitAt: now + 3600, revealAt: now + 7200, nextActionAt: now + (phase === "Commit" ? 3600 : 7200),
    commitCount: active && phase !== "Commit" ? 4 : 0, revealCount: phase === "Finalizable" ? 4 : 0, eligibleCount: done ? 0 : active ? 4 : 5, seats,
    winners: done ? addresses.map((addr, index) => ({ round: index + 1, addr, label: handles[index], ts: now - (5 - index) * 604800 })) : active ? [{ round: 1, addr: addresses[1], label: handles[1], ts: now - 604800 }] : [],
    isMember: true, isHost: true, canUseDemoFriends: false, readyToStart: phase === "Open", canCommit: phase === "Commit", canReveal: phase === "Reveal", canFinalize: phase === "Finalizable" };
}

// Actual production React route, display-only transport doubles. No session,
// signer, account mutation, membership write or Testnet transaction is used.
export async function installGuidanceFixture(page: Page, phase: GuidancePhase, target: string, locale = "en") {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), ".next/server/server-reference-manifest.json"), "utf8"));
  const names: Record<string, string> = Object.fromEntries(Object.entries(manifest.node).map(([id, entry]) => [id, (entry as { exportedName: string }).exportedName]));
  let room = guidanceRoom(phase);
  const calls = { reads: 0, blockedActions: [] as string[] };
  const errors: string[] = [], warnings: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", event => { if (["error", "warning"].includes(event.type()) && event.text() !== "Service Worker registration blocked by Playwright") warnings.push(event.text()); });
  await page.context().addCookies([{ name: "salapi_locale", value: locale, url: new URL(target).origin }]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/api/market-prices") {
      const time = Math.floor(Date.now() / 1000);
      return route.fulfill({ json: { status: "fresh", source: "CoinGecko", fetchedAt: time, assets: { xlm: { updatedAt: time, prices: { usd: .2, php: 11.6, idr: 3200, vnd: 5000 } }, usdc: { updatedAt: time, prices: { usd: 1, php: 58, idr: 16000, vnd: 25000 } } } } });
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      const name = names[request.headers()["next-action"]];
      let value: unknown = { ok: false, error: "Blocked by isolated display-only QA" };
      if (name === "arisanRoomState") { calls.reads++; value = room; }
      else if (name === "arisanMemberIdentities") value = { ok: true, kind: "upfront", roomId: room.id, identities: addresses.map((address, index) => ({ address, handle: handles[index], photoUrl: null })) };
      else if (name === "arisanList") value = { ready: true, total: 0, nextCursor: null, mine: [] };
      else if (name === "myHandle") value = null;
      else if (name === "walletState") value = { address: addresses[0], pesos: 0, nativeStroops: "500000000" };
      else calls.blockedActions.push(name || request.url());
      return route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(value)}\n` });
    }
    return route.continue();
  });
  return { calls, errors, warnings, setPhase(next: GuidancePhase) { room = guidanceRoom(next); },
    setRoom(next: ReturnType<typeof guidanceRoom>) { room = next; } };
}
