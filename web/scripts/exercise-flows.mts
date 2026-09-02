// End-to-end exerciser for the five SOW day-30 flows, driven through the REAL
// app server actions in web/app/actions.ts (no UI, no long-lived server).
// Loads .env.local first so getSigner() resolves the demo signer and the
// Paluwagan / Smart-Savings contract ids point at the freshly deployed ones.
// Prints one real testnet tx hash per flow. Read DEPLOYMENTS.md for context.
import { readFileSync } from "node:fs";

// --- load .env.local into process.env (before importing the actions) ---
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  process.env[t.slice(0, i)] = t.slice(i + 1);
}

const A = await import("../app/actions");

const out: Record<string, unknown> = {};
const show = (k: string, v: unknown) => {
  out[k] = v;
  console.log(`\n### ${k}\n` + JSON.stringify(v, null, 2));
};

// 1. Username registry: register (or rename if already taken) + resolve.
let uname = "salapidemo";
const reg = await A.registerUsername(uname);
show("1a_registerUsername", reg);
if (!("ok" in reg) || !reg.ok) {
  uname = "salapidemo" + Math.floor(Math.random() * 100000);
  const rn = await A.renameUsername(uname);
  show("1b_renameUsername_fallback", rn);
}
const mine = await A.myUsername();
show("1c_myUsername_resolve", mine);
if (typeof mine === "string") uname = mine;

// 2. P2P send by @username (self-send is a real SAC transfer + event).
show("2_sendByUsername", await A.sendByUsername(uname, { amount: "10", currency: "tl" }));

// 3. Disaster fund contribution.
show("3_disasterContribute", await A.disasterContribute({ amount: "25", currency: "tl" }));

// 4. Paluwagan: pay my share, friends pay, then collect (round rotates).
show("4a_paluwaganPayMine", await A.paluwaganPayMine());
show("4b_paluwaganFriendsPay", await A.paluwaganFriendsPay());
show("4c_paluwaganCollect", await A.paluwaganCollect());

// 5. Smart Savings: open a goal, then deposit into it.
show("5a_smartSavingsOpen", await A.smartSavingsOpen({ amount: "5000", currency: "tl" }));
show("5b_smartSavingsDeposit", await A.smartSavingsDeposit({ amount: "100", currency: "tl" }));

console.log("\n=== HASH SUMMARY ===");
for (const [k, v] of Object.entries(out)) {
  const h =
    v && typeof v === "object" && "hash" in (v as Record<string, unknown>)
      ? (v as { hash?: string }).hash
      : v &&
        typeof v === "object" &&
        "link" in (v as Record<string, unknown>)
      ? String((v as { link?: string }).link).split("/tx/")[1]
      : undefined;
  if (h) console.log(`${k}: ${h}`);
}
console.log("=== DONE ===");
