import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { previewPledgeAllocation } from "../lib/circles/pledge-allocation.ts";
import type { Circle, CircleCategory } from "../lib/circles/types.ts";
import type { CircleOrganizer } from "../lib/circles/organizers.ts";

// Evaluate only known pure fixture/helper modules. Normal Next imports are
// extensionless, so transpiling avoids changing production import conventions
// merely to satisfy Node's strip-types resolver. No server/browser is started.
const cache = new Map<string, Record<string, unknown>>();
function module(path: string): Record<string, unknown> {
  const cached = cache.get(path);
  if (cached) return cached;
  const output = {} as Record<string, unknown>;
  cache.set(path, output);
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports: output,
    require(name: string) {
      if (name === "./organizers") return module("../lib/circles/organizers.ts");
      if (name === "./types") return module("../lib/circles/types.ts");
      if (name === "@/lib/ui/currency") return module("../lib/ui/currency.ts");
      throw new Error(`Unexpected fixture dependency: ${name}`);
    },
  });
  return output;
}
const catalog = module("../lib/circles/seed.ts") as {
  SEED_CIRCLES: Circle[];
  COMPLETED_CIRCLES: Circle[];
  getCircle(id: string): Circle | undefined;
};
const profiles = module("../lib/circles/organizers.ts") as {
  ORGANIZERS: CircleOrganizer[];
  getOrganizer(id: string): CircleOrganizer | undefined;
  getOrganizerForCircle(circle: Pick<Circle, "organizerId" | "organizer" | "organizerLocation">): CircleOrganizer | undefined;
};
const allowance = module("../lib/circles/allowance.ts") as {
  KYC_TIER_CEILING: Record<number, number>;
  splitDonation(amount: number, pct: number): { beneficiary: number; allowance: number };
};
const { SEED_CIRCLES, COMPLETED_CIRCLES, getCircle } = catalog;
const { ORGANIZERS, getOrganizer, getOrganizerForCircle } = profiles;
const all = [...SEED_CIRCLES, ...COMPLETED_CIRCLES];
const categories: CircleCategory[] = ["disaster", "medical", "education", "community", "family", "creator", "animals", "care", "volunteer"];

test("the active catalog has exactly three causes and three distinct organizers in all nine sectors", () => {
  assert.equal(SEED_CIRCLES.length, 27);
  assert.equal(new Set(SEED_CIRCLES.map(circle => circle.category)).size, 9);
  for (const category of categories) {
    const causes = SEED_CIRCLES.filter(circle => circle.category === category);
    assert.equal(causes.length, 3, category);
    assert.equal(new Set(causes.map(circle => circle.organizerId)).size, 3, category);
    assert.ok(causes.every(circle => circle.status === "funding"));
  }
});

test("the six original IDs retain their canonical PHP raised and target amounts", () => {
  const original = {
    "tino-relief": [184500, 250000], "ate-mei-dialysis": [62300, 180000],
    "arisan-banjir-jakarta": [96750, 200000], "barangay-library": [38900, 150000],
    "ofw-family-tuition": [47200, 75000], "creator-baybayin": [24400, 60000],
  };
  for (const [id, [raised, target]] of Object.entries(original)) {
    const circle = getCircle(id)!;
    assert.equal(circle.pesoRaised, raised, id);
    assert.equal(circle.pesoTarget, target, id);
    assert.equal(circle.status, "funding");
  }
  assert.equal(getCircle("creator-baybayin")!.allowance!.tier, 2);
});

test("nine fictional organizer profiles each have active causes and exactly three completed histories", () => {
  assert.equal(ORGANIZERS.length, 9);
  assert.equal(new Set(ORGANIZERS.map(profile => profile.id)).size, 9);
  assert.equal(ORGANIZERS.filter(profile => profile.kind === "individual").length, 4);
  assert.equal(ORGANIZERS.filter(profile => profile.kind === "ngo").length, 5);
  assert.equal(COMPLETED_CIRCLES.length, 27);
  for (const profile of ORGANIZERS) {
    assert.match(profile.bio, /fictional/i);
    assert.ok(SEED_CIRCLES.some(circle => circle.organizerId === profile.id));
    assert.equal(profile.historyIds.length, 3, profile.id);
    assert.equal(new Set(profile.historyIds).size, 3);
    assert.equal(COMPLETED_CIRCLES.filter(circle => circle.organizerId === profile.id).length, 3);
    for (const id of profile.historyIds) {
      const history = getCircle(id)!;
      assert.ok(history, id);
      assert.equal(history.organizerId, profile.id);
      assert.equal(history.status, "completed");
      assert.match(history.completedOn!, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(history.daysRemaining, 0);
    }
  }
});

test("all 54 IDs resolve without collisions and organizer lookup preserves legacy circles", () => {
  assert.equal(all.length, 54);
  assert.equal(new Set(all.map(circle => circle.id)).size, 54);
  for (const circle of all) {
    assert.equal(getCircle(circle.id), circle);
    const organizer = getOrganizer(circle.organizerId!)!;
    assert.equal(getOrganizerForCircle(circle), organizer);
    assert.equal(circle.organizer, organizer.name);
    assert.equal(circle.organizerLocation, organizer.location);
    assert.equal(getOrganizerForCircle({ organizer: circle.organizer, organizerLocation: circle.organizerLocation }), organizer);
  }
  assert.equal(getCircle("not-a-demo-cause"), undefined);
  assert.equal(getOrganizer("not-a-demo-organizer"), undefined);
});

test("synthetic reviews link only to the reviewer's organizer's completed examples and aggregate coherently", () => {
  const reviewIds = new Set<string>();
  for (const profile of ORGANIZERS) {
    assert.ok(profile.rating >= 1 && profile.rating <= 5);
    assert.ok(profile.reviews.length >= 3);
    assert.equal(profile.reviewCount, profile.reviews.length);
    let total = 0;
    for (const review of profile.reviews) {
      assert.equal(reviewIds.has(review.id), false);
      reviewIds.add(review.id);
      assert.ok(review.score >= 1 && review.score <= 5);
      assert.match(review.body, /synthetic demo review/i);
      assert.match(review.reviewer, /example/i);
      const cause = getCircle(review.causeId)!;
      assert.ok(cause);
      assert.equal(cause.status, "completed");
      assert.equal(cause.organizerId, profile.id);
      assert.ok(profile.historyIds.includes(cause.id));
      assert.ok(review.date >= cause.completedOn!);
      total += review.score;
    }
    assert.equal(profile.rating, Math.round(total / profile.reviews.length * 10) / 10);
    assert.equal(Object.keys(profile).some(key => /wallet|email|secret|address/i.test(key)), false);
  }
});

test("all configured organizer allocations respect the mock tier and conserve the pledge without extra fees", () => {
  const percentages = new Set<number>();
  for (const circle of all) {
    const config = circle.allowance!;
    percentages.add(config.percentage);
    assert.ok(config.percentage >= 0 && config.percentage <= allowance.KYC_TIER_CEILING[config.tier]);
    assert.equal(config.organizerName, circle.organizer);
    assert.equal(config.proofRequired, config.percentage > 0);
    assert.equal(config.escrowed, config.percentage > 0);
    const split = allowance.splitDonation(1000, config.percentage);
    assert.equal(split.beneficiary + split.allowance, 1000);
    for (const currency of ["en", "tl", "id", "vi"] as const) {
      const pledge = previewPledgeAllocation(currency === "id" || currency === "vi" ? "100000" : "100.01", currency, config.percentage)!;
      assert.equal(pledge.beneficiaryPct + pledge.organizerPct, 100);
      assert.equal(pledge.beneficiaryMinor + pledge.organizerMinor, pledge.totalMinor);
    }
    assert.equal(Object.keys(config).some(key => /platform|fee/i.test(key)), false);
  }
  assert.deepEqual([...percentages].sort((a, b) => a - b), [0, 2, 3, 5, 7, 8, 10]);
});

test("each cause points to a unique generated cover with explicit fictional-image wording", () => {
  const paths = new Set<string>();
  for (const circle of all) {
    assert.equal(circle.coverImage, `/circles/generated/${circle.id}.png`);
    assert.equal(paths.has(circle.coverImage!), false);
    paths.add(circle.coverImage!);
    assert.match(circle.imageAlt!, /generated.*fictional.*not verified/i);
    assert.match(circle.summary!, /fictional example/i);
    assert.match(circle.story, /synthetic examples/);
    assert.doesNotMatch(circle.story, /every peso.*on-chain|keep more.*kitabisa|receipts.*build-award/i);
  }
  assert.equal(paths.size, 54);
});

test("each active and completed cause has dated milestone, spend and delivery updates marked as synthetic", () => {
  const updateIds = new Set<string>();
  for (const circle of all) {
    const updates = circle.updates!;
    assert.ok(updates.length >= 3);
    assert.equal(new Set(updates.map(update => update.kind)).size, 3);
    let previousDate = "";
    for (const update of updates) {
      assert.equal(updateIds.has(update.id), false);
      updateIds.add(update.id);
      assert.match(update.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(Number.isFinite(Date.parse(update.date)));
      assert.ok(update.date >= previousDate);
      previousDate = update.date;
      assert.match(update.body, /fictional demo update/i);
      assert.match(update.proofLabel!, /synthetic|generated/i);
      assert.equal(update.image, circle.coverImage);
      assert.doesNotMatch(update.body + update.proofLabel, /\b[a-f0-9]{64}\b/i);
      if (update.kind === "spend") {
        assert.ok(Number.isFinite(update.amountPHP));
        assert.ok(update.amountPHP! > 0 && update.amountPHP! <= circle.pesoRaised);
      }
    }
    if (circle.status === "completed") assert.equal(previousDate, circle.completedOn);
  }
  assert.equal(updateIds.size, 162);
});

test("all displayed goals and synthetic totals are finite and statuses have coherent timelines", () => {
  for (const circle of all) {
    assert.ok(Number.isFinite(circle.pesoTarget) && circle.pesoTarget > 0);
    assert.ok(Number.isFinite(circle.pesoRaised) && circle.pesoRaised > 0);
    assert.ok(circle.pesoRaised <= circle.pesoTarget);
    assert.ok(Number.isInteger(circle.donorCount) && circle.donorCount >= 0);
    if (circle.status === "funding") {
      assert.ok(circle.daysRemaining > 0);
      assert.equal(circle.completedOn, undefined);
    } else {
      assert.equal(circle.pesoRaised, circle.pesoTarget);
      assert.ok(circle.completedOn! <= "2026-10-06");
    }
    assert.ok(circle.recentDonations.every(entry => /example/i.test(entry.donorLabel) && /fictional/i.test(entry.note!)));
  }
});
