import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as policy from "../lib/arisan-funding-fees.ts";

test("installment fee policy is fixed, frozen and expressed in exact stroops", () => {
  assert.equal(policy.MAX_FUNDING_FEE_STROOPS, "50000000");
  assert.equal(policy.MAX_FUNDING_FEE_XLM, "5");
  assert.equal(policy.MIN_FUNDING_RESOURCE_BUFFER_STROOPS, "1000000");
  assert.equal(BigInt(policy.MAX_FUNDING_FEE_XLM) * 10_000_000n, BigInt(policy.MAX_FUNDING_FEE_STROOPS));
  assert.deepEqual(policy.FUNDING_INVOKE_OPTIONS, { maxFeeStroops: "50000000", bufferRefundableResourceFee: true });
  assert.equal(Object.isFrozen(policy.FUNDING_INVOKE_OPTIONS), true);
  assert.throws(() => Object.assign(policy.FUNDING_INVOKE_OPTIONS, { maxFeeStroops: "50000001" }), TypeError);
  assert.match(policy.FUNDING_FEE_LIMIT_ERROR, /5 Testnet XLM.*Nothing was signed or submitted/);
});

test("transaction fees require canonical positive uint32 strings and a valid cap", () => {
  for (const value of ["1", "100", "50000000", "4294967295"]) assert.equal(policy.validTransactionFee(value), true, value);
  for (const value of [undefined, null, {}, [], 1, 1n, NaN, Infinity, "", "0", "00", "01", "-1", "+1", "1.0", "1e7", " 1", "1 ", "4294967296", "99999999999", "１"])
    assert.equal(policy.validTransactionFee(value), false, String(value));
  assert.equal(policy.transactionFeeWithinCap("50000000", "50000000"), true);
  assert.equal(policy.transactionFeeWithinCap("50000001", "50000000"), false);
  assert.equal(policy.transactionFeeWithinCap("100", "0"), false);
  assert.equal(policy.transactionFeeWithinCap("100", "4294967296"), false);
  assert.equal(policy.transactionFeeWithinCap("-1", "50000000"), false);
});

test("refundable allowance is original plus max(ceil(10%), 0.1 XLM), with exact integer arithmetic", () => {
  for (const [input, expected] of [
    ["0", "1000000"], ["1", "1000001"], ["30000", "1030000"],
    ["9999999", "10999999"], ["10000000", "11000000"], ["10000001", "11000002"],
    ["20000000", "22000000"], ["44138940", "48552834"], ["45454454", "49999900"],
    ["3904515722", "4294967295"],
  ]) assert.equal(policy.bufferedFundingResourceFee(input), expected, input);
  for (const input of [undefined, null, {}, 0, 1n, "", "-1", "+1", "00", "01", "1.1", "1e6", " 1", "3904515723", "4294967295", "4294967296", "6105129207"])
    assert.equal(policy.bufferedFundingResourceFee(input), null, String(input));
});

function source(path: string, kind = ts.ScriptKind.TS) {
  const file = readFileSync(new URL(path, import.meta.url), "utf8");
  return ts.createSourceFile(path, file, ts.ScriptTarget.Latest, true, kind);
}
function descendants(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  function visit(child: ts.Node) { if (predicate(child)) found.push(child); ts.forEachChild(child, visit); }
  visit(node);
  return found;
}

test("all three installment invocation sites take only the fixed server fee policy", () => {
  const actions = source("../app/arisan-funding-actions.ts");
  const invocations = descendants(actions, node => ts.isCallExpression(node) && node.expression.getText(actions) === "invokeAs") as ts.CallExpression[];
  assert.equal(invocations.length, 3, "create, reviewed join/deposit, and room/draw mutations must each be guarded");
  for (const invocation of invocations) {
    assert.equal(invocation.arguments.length, 5);
    assert.equal(invocation.arguments[4].getText(actions), "FUNDING_INVOKE_OPTIONS");
  }
  const imports = descendants(actions, node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.getText(actions) === '"@/lib/arisan-funding-fees"') as ts.ImportDeclaration[];
  assert.equal(imports.length, 1);
  assert.match(imports[0].importClause!.getText(actions), /\bFUNDING_INVOKE_OPTIONS\b/);
});

test("fee review copy binds every fee cap and zero-deposit join/create maximum to the server policy", () => {
  const screen = source("../components/screens/ArisanFundingScreen.tsx", ts.ScriptKind.TSX);
  const elements = descendants(screen, ts.isJsxElement) as ts.JsxElement[];
  const definitions = elements.filter(node => node.openingElement.tagName.getText(screen) === "dl");
  const pairs = definitions.flatMap(node => {
    const children = node.children.filter(ts.isJsxElement);
    const result: { label: string; value: string }[] = [];
    for (let index = 0; index < children.length - 1; index++) {
      if (children[index].openingElement.tagName.getText(screen) !== "dt") continue;
      assert.equal(children[index + 1].openingElement.tagName.getText(screen), "dd");
      result.push({ label: children[index].children.map(child => child.getText(screen)).join(""), value: children[index + 1].getText(screen) });
    }
    return result;
  });
  const feeReviews = pairs.filter(pair => pair.label === "Maximum network fee");
  assert.equal(feeReviews.length, 3, "join, creation and contribution reviews each disclose the cap");
  for (const pair of feeReviews) assert.match(pair.value, /\{MAX_FUNDING_FEE_XLM\} Testnet XLM/);
  for (const operation of ["join", "creation"]) {
    const maximum = pairs.find(pair => pair.label === `Maximum wallet debit at ${operation}`);
    assert.ok(maximum);
    assert.match(maximum.value, /\{MAX_FUNDING_FEE_XLM\} Testnet XLM, fee only/);
    const contribution = pairs.find(pair => pair.label === `Contribution at ${operation}`);
    assert.ok(contribution);
    assert.match(contribution.value, />0 XLM(?: deposit)?</);
  }
  const contributionMaximum = pairs.find(pair => pair.label === "Maximum wallet debit");
  assert.ok(contributionMaximum);
  assert.match(contributionMaximum.value, /\{maximumDebit\}, including fee/);
  const debit = descendants(screen, node => ts.isVariableDeclaration(node) && node.name.getText(screen) === "maximumDebit") as ts.VariableDeclaration[];
  assert.equal(debit.length, 1);
  assert.match(debit[0].initializer!.getText(screen), /BigInt\(depositReview.amountStroops\) \+ BigInt\(MAX_FUNDING_FEE_STROOPS\)/);
  const text = screen.getFullText();
  assert.match(text, /Network fee: at most \{MAX_FUNDING_FEE_XLM\} Testnet XLM per transaction/);
  assert.match(text, /The server refuses to sign if its total fee exceeds this limit/);
  assert.match(text, /This is a maximum, not a fixed charge/);
  assert.match(text, /unused allowance is returned by Stellar/);
  assert.match(text, /Actual charged fees are separate from your contribution and are not refunded when you leave or cancel/);
  assert.match(text, /Charged network fees are not refundable/);
});
