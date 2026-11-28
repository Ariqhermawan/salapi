import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEARN } from "../lib/learn-content.ts";

test("Arisan Learn explains upfront, installment and scheduled room rules", () => {
  const en = LEARN.en.circle;
  assert.match(en.p1, /full-cycle obligation.*transferred into contract escrow/i);
  assert.match(en.p2, /joining transfers no contribution.*only when the member confirms it.*voluntary parts/i);
  assert.match(en.p3, /draw dates and intervals agreed in advance.*Start only when every seat is filled and every member has funded the full cycle/i);
  assert.match(en.promise, /Start is blocked until the full roster and funding are ready/i);
  for (const locale of ["en", "tl", "id", "vi"] as const) {
    assert.match(LEARN[locale].circle.p1, /escrow/i);
    assert.match(LEARN[locale].circle.p2, /escrow/i);
    assert.match(LEARN[locale].circle.p3, /contract|kontrak|hợp đồng/i);
  }
  assert.match(LEARN.id.circle.p2, /Mode cicilan/);
  assert.match(LEARN.tl.circle.p3, /Scheduled na room/);
  assert.match(LEARN.vi.circle.p1, /Room trả trước/);
});

test("upfront room creation exposes the implemented installment and scheduled flows", () => {
  const source = readFileSync(new URL("../components/screens/ArisanCreateScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /href="\/arisan\/funding"/);
  assert.match(source, /href="\/arisan\/scheduled"/);
  assert.match(source, /Join without a deposit/);
  assert.match(source, /Everyone still funds the full cycle before Start/);
  const route = readFileSync(new URL("../app/arisan/upfront/page.tsx", import.meta.url), "utf8");
  assert.match(route, /ArisanCreateScreen/);
  const funding = readFileSync(new URL("../components/screens/ArisanFundingScreen.tsx", import.meta.url), "utf8");
  assert.match(funding, /href="\/arisan\/upfront"/);
  assert.match(funding, /href="\/arisan\/funding"/);
  assert.match(funding, /href="\/arisan\/scheduled"/);
});
