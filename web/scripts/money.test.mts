import test from "node:test";
import assert from "node:assert/strict";
import {
  localToStroops,
  moneyInputToStroops,
  nativeBalanceToStroops,
  pesosToStroopsExact,
} from "../lib/money.ts";

test("PHP conversion uses integer stroops with half-up rounding", () => {
  assert.equal(pesosToStroopsExact("6.5"), 10_000_000n);
  assert.equal(pesosToStroopsExact("13"), 20_000_000n);
  assert.equal(pesosToStroopsExact("0.01"), 15_385n);
});

test("all supported display currencies share the PHP anchor exactly", () => {
  const php = localToStroops("58", "tl");
  assert.equal(localToStroops("1", "en"), php);
  assert.equal(localToStroops("16000", "id"), php);
  assert.equal(localToStroops("25500", "vi"), php);
});

test("money action payloads stay integer and reject malformed input", () => {
  assert.equal(
    moneyInputToStroops({ amount: "13", currency: "tl" }),
    20_000_000n
  );
  assert.equal(moneyInputToStroops({ amount: "", currency: "tl" }), null);
  assert.equal(moneyInputToStroops({ amount: "-1", currency: "tl" }), null);
  assert.equal(moneyInputToStroops({ amount: "1e3", currency: "tl" }), null);
  assert.equal(moneyInputToStroops({ amount: 13, currency: "tl" }), null);
  assert.equal(moneyInputToStroops({ amount: "13", currency: "usd" }), null);
  assert.equal(localToStroops("0.00000001", "tl"), 0n);
});

test("Horizon balances are parsed without floating point", () => {
  assert.equal(nativeBalanceToStroops("1"), 10_000_000n);
  assert.equal(nativeBalanceToStroops("1.00000005"), 10_000_001n);
  assert.equal(nativeBalanceToStroops("not-a-balance"), null);
});

test("integer conversion conserves a split balance with no residual dust", () => {
  const parts = ["40", "60"].map((value) => pesosToStroopsExact(value)!);
  const total = pesosToStroopsExact("100")!;
  assert.equal(parts[0] + parts[1], total);
});

