import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// Fresh unauthenticated HTTP context against the compiled local candidate.
// No mocks, session cookies, account creation or Testnet transaction requests
// with an authenticated signer. This does not prove an authenticated flow.
const blocked = /Sign in with your saved Testnet wallet|Contract not configured|Circle not set up/;
for (const [name, args] of [
  ["arisanFriendsJoin", [1]], ["arisanFriendsCommit", [1]],
  ["arisanFriendsReveal", [1]], ["paluwaganFriendsPay", []],
  ["arisanLeave", [1]], ["arisanStart", [1]],
] as const) test(`${name} rejects a request without a session or configured contract`, async ({ request, baseURL }) => {
  test.skip(!["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname), "Compiled local action IDs must not target a live deployment");
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const id = Object.entries(manifest.node as Record<string, { exportedName: string }>).find(([, action]) => action.exportedName === name)?.[0];
  expect(id, `${name} is included in the production bundle`).toBeTruthy();
  const response = await request.post("/arisan/1", {
    headers: { "Next-Action": id!, "Content-Type": "text/plain;charset=UTF-8", Origin: baseURL! },
    data: JSON.stringify(args),
  });
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain('"ok":false');
  expect(body).toMatch(blocked);
  expect(body).not.toMatch(/"hash"|"link"|secret_cipher|WALLET_ENC_KEY|FRIEND\d_SECRET/);
});
