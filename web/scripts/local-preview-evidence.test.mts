import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { publicProofUrl } from "../lib/campaign.ts";
import type { Campaign } from "../lib/campaign.ts";

type Preview = {
  PREVIEW_PROOF_URL: string;
  PREVIEW_PROOF_HASH: string;
  PREVIEW_CAMPAIGNS: { id: string; proofUrl: string; proofHash: string | null }[];
  previewEvidenceUrl(input: unknown): string | null;
  normalizePreviewCampaigns(campaigns: Campaign[]): Campaign[];
};
function loadPreview(preview: boolean): Preview {
  const source = readFileSync(new URL("../lib/local-preview.ts", import.meta.url), "utf8");
  const exports = {} as Preview;
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, process: { env: { NEXT_PUBLIC_LOCAL_PREVIEW: preview ? "1" : "0" } } });
  return exports;
}
function proofLink(preview: Preview) {
  const source = readFileSync(new URL("../components/screens/CampaignScreen.tsx", import.meta.url), "utf8");
  const definition = source.match(/^const safeProof = .*;$/m)?.[0];
  assert.ok(definition, "Read the actual component link validator");
  const exports = {} as { safeProof(url: string): string | null };
  runInNewContext(ts.transpileModule(`${definition}\nexports.safeProof = safeProof;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, publicProofUrl, previewEvidenceUrl: preview.previewEvidenceUrl });
  return exports.safeProof;
}

test("preview evidence points to the existing same-origin fictional document", () => {
  const preview = loadPreview(true);
  assert.equal(preview.PREVIEW_PROOF_URL, "/evidence/local-example-proof.txt");
  assert.equal(preview.PREVIEW_CAMPAIGNS.find(campaign => campaign.id === "103")?.proofUrl, preview.PREVIEW_PROOF_URL);
  for (const campaign of preview.PREVIEW_CAMPAIGNS)
    if (campaign.proofUrl) assert.equal(campaign.proofUrl, preview.PREVIEW_PROOF_URL);
  const bytes = readFileSync(new URL(`../public${preview.PREVIEW_PROOF_URL}`, import.meta.url));
  const document = bytes.toString("utf8");
  assert.match(document, /fictional campaign/);
  assert.match(document, /No real donation/);
  assert.equal(preview.PREVIEW_PROOF_HASH, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(preview.PREVIEW_CAMPAIGNS.find(campaign => campaign.id === "103")?.proofHash, preview.PREVIEW_PROOF_HASH);
  assert.equal(proofLink(preview)(preview.PREVIEW_PROOF_URL), preview.PREVIEW_PROOF_URL);
});

test("only the exact sample evidence path is allowed, and only in preview", () => {
  for (const enabled of [false, true]) {
    const preview = loadPreview(enabled);
    const safeProof = proofLink(preview);
    assert.equal(preview.previewEvidenceUrl(preview.PREVIEW_PROOF_URL), enabled ? preview.PREVIEW_PROOF_URL : null);
    assert.equal(safeProof(preview.PREVIEW_PROOF_URL), enabled ? preview.PREVIEW_PROOF_URL : null);
    for (const path of ["/evidence/other.txt", "//salapi.app/evidence/local-example-proof.txt", "/evidence/local-example-proof.txt?redirect=1", "file:///evidence/local-example-proof.txt", "javascript:alert(1)", "http://example.com/proof"])
      assert.equal(safeProof(path), null, `${enabled}: ${path}`);
    assert.equal(safeProof("https://example.com/proof.txt"), "https://example.com/proof.txt");
  }
});

test("live public proof submission still rejects local paths and credential URLs", () => {
  assert.throws(() => publicProofUrl(loadPreview(false).PREVIEW_PROOF_URL));
  assert.throws(() => publicProofUrl("https://user:password@example.com/proof"));
});

test("migrates only the exact legacy seeded proof while preserving all stored money and approval state", () => {
  const preview = loadPreview(true);
  const original = JSON.parse(JSON.stringify(preview.PREVIEW_CAMPAIGNS.find(campaign => campaign.id === "103"))) as Campaign;
  original.proofUrl = "https://salapi.app/evidence/d4-demo-proof.txt";
  original.proofHash = "a".repeat(64);
  original.total = "9000000000"; original.escrow = "9000000000"; original.approvals = ["existing-approval"];
  original.contribution = { amount: "100000001", refunded: false };
  const customUrl = { ...original, proofUrl: "https://example.com/my-proof.txt" };
  const customHash = { ...original, proofHash: "b".repeat(64) };
  const customId = { ...original, id: "9001" };
  const input = [original, customUrl, customHash, customId];
  const normalized = preview.normalizePreviewCampaigns(input);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized[0])), { ...original, proofUrl: preview.PREVIEW_PROOF_URL, proofHash: preview.PREVIEW_PROOF_HASH });
  assert.equal(original.proofHash, "a".repeat(64), "Do not mutate the stored input object");
  assert.equal(normalized[1], customUrl); assert.equal(normalized[2], customHash); assert.equal(normalized[3], customId);
  assert.equal(loadPreview(false).normalizePreviewCampaigns(input), input, "Nonpreview never migrates example data");
});

test("all preview session readers apply the exact seeded evidence migration", () => {
  for (const path of ["../app/page.tsx", "../components/screens/VaultsScreen.tsx", "../components/screens/CampaignScreen.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /normalizePreviewCampaigns\(saved\)/, path);
  }
});
