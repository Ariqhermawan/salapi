import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Seat = { addr: string; label: string; won: boolean; committed: boolean; revealed: boolean; isYou: boolean };
type Fill = (values: Uint32Array) => void;
type Api = { choosePreviewArisanWinner(seats: readonly Seat[], fill?: Fill): Seat | null };
const source = readFileSync(new URL("../components/screens/arisan-preview.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const seats = (count: number): Seat[] => Array.from({ length: count }, (_, index) => ({ addr: `LOCAL_MEMBER_${index}`, label: `Example ${index}`, won: false, committed: true, revealed: true, isYou: index === 0 }));

function setup(preview = true, cryptoFill?: Fill) {
  const helper = { exports: {} as Api };
  const forbidden = () => { throw Error("Random selection must not access storage, actions or network"); };
  runInNewContext(code, {
    module: helper, exports: helper.exports,
    ...(cryptoFill ? { crypto: { getRandomValues: cryptoFill } } : {}),
    fetch: forbidden,
    sessionStorage: new Proxy({}, { get: forbidden }),
    require(name: string) {
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name === "@/lib/money") return { pesosToStroopsExact: forbidden };
      throw Error(`Unexpected random selection dependency: ${name}`);
    },
  });
  return helper.exports;
}

test("live mode never selects a preview winner or requests entropy", () => {
  const live = setup(false);
  assert.equal(live.choosePreviewArisanWinner(seats(3), () => { throw Error("Must not run"); }), null);
  assert.equal(live.choosePreviewArisanWinner(seats(1)), null);
});

test("zero and one eligible member do not fake a random draw", () => {
  const api = setup();
  const noRandom = () => { throw Error("No random source needed"); };
  assert.equal(api.choosePreviewArisanWinner([], noRandom), null);
  const none = seats(3).map(seat => ({ ...seat, won: true }));
  assert.equal(api.choosePreviewArisanWinner(none, noRandom), null);
  const one = seats(3).map((seat, index) => ({ ...seat, won: index !== 2 }));
  assert.strictEqual(api.choosePreviewArisanWinner(one, noRandom), one[2]);
});

test("crypto.getRandomValues is the default and first join is not privileged", () => {
  let reads = 0;
  const api = setup(true, values => { reads++; values[0] = 2; });
  const members = seats(3);
  assert.strictEqual(api.choosePreviewArisanWinner(members), members[2]);
  assert.equal(reads, 1);
  assert.doesNotMatch(source, /Math\.random\s*\(/);
});

test("every eligible index is selected by every complete input bucket, for 2-20 members", () => {
  const api = setup();
  for (let count = 2; count <= 20; count++) {
    const members = seats(count);
    for (let bucket = 0; bucket < 5; bucket++) {
      for (let index = 0; index < count; index++) {
        assert.strictEqual(api.choosePreviewArisanWinner(members, values => { values[0] = bucket * count + index; }), members[index], `${count} eligible, bucket ${bucket}, index ${index}`);
      }
    }
  }
});

test("32-bit rejection boundary excludes the incomplete upper bucket exactly", () => {
  const api = setup();
  const range = 0x1_0000_0000;
  for (let count = 2; count <= 20; count++) {
    const members = seats(count);
    const limit = range - range % count;
    assert.strictEqual(api.choosePreviewArisanWinner(members, values => { values[0] = limit - 1; }), members[count - 1]);
    if (limit === range) continue;
    let reads = 0;
    assert.strictEqual(api.choosePreviewArisanWinner(members, values => { values[0] = reads++ === 0 ? limit : 1; }), members[1]);
    assert.equal(reads, 2, `first rejected value for ${count} eligible`);
    reads = 0;
    assert.strictEqual(api.choosePreviewArisanWinner(members, values => { values[0] = reads++ === 0 ? range - 1 : 0; }), members[0]);
    assert.equal(reads, 2, `largest uint32 for ${count} eligible`);
  }
});

test("won, uncommitted and unrevealed members never enter the candidate set", () => {
  const api = setup();
  const members = seats(5);
  members[0].won = true;
  members[1].committed = false;
  members[1].revealed = false;
  members[2].revealed = false;
  Object.freeze(members);
  members.forEach(Object.freeze);
  for (let sample = 0; sample < 12; sample++) {
    assert.strictEqual(api.choosePreviewArisanWinner(members, values => { values[0] = sample; }), members[3 + sample % 2]);
  }
});

test("each completed winner can be excluded until every member has won once", () => {
  const api = setup();
  const members = seats(5);
  const winners: string[] = [];
  for (let round = 0; round < 5; round++) {
    const winner = api.choosePreviewArisanWinner(members, values => { values[0] = 3; });
    assert.ok(winner);
    assert.ok(!winners.includes(winner.addr));
    winners.push(winner.addr);
    winner.won = true;
  }
  assert.equal(new Set(winners).size, 5);
  assert.equal(api.choosePreviewArisanWinner(members), null);
});

test("malformed or duplicated seats fail closed before requesting entropy", () => {
  const api = setup();
  const members = seats(3);
  const invalid: unknown[] = [
    null, {}, "seats", [null], seats(21),
    [members[0], members[0], members[2]],
    [{ ...members[0], addr: " " }, ...members.slice(1)],
    [{ ...members[0], label: 1 }, ...members.slice(1)],
    [{ ...members[0], won: "false" }, ...members.slice(1)],
    [{ ...members[0], committed: false, revealed: true }, ...members.slice(1)],
    [{ ...members[0], isYou: undefined }, ...members.slice(1)],
  ];
  for (const candidate of invalid) {
    assert.equal(api.choosePreviewArisanWinner(candidate as Seat[], () => { throw Error("Must not run for invalid seats"); }), null);
  }
});

test("missing, throwing or repeatedly rejected entropy returns null without fallback", () => {
  const api = setup();
  assert.equal(api.choosePreviewArisanWinner(seats(3)), null);
  assert.equal(api.choosePreviewArisanWinner(seats(3), () => { throw Error("Entropy unavailable"); }), null);
  let reads = 0;
  assert.equal(api.choosePreviewArisanWinner(seats(3), values => { reads++; values[0] = 0xffff_ffff; }), null);
  assert.equal(reads, 128);
});
