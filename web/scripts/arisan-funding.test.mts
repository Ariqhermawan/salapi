import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import * as domain from "../lib/arisan-funding.ts";
import * as feePolicy from "../lib/arisan-funding-fees.ts";
import { arisanRoomPage } from "../lib/arisan-list.ts";

const contract = StrKey.encodeContract(Buffer.alloc(32, 51));
const legacy = StrKey.encodeContract(Buffer.alloc(32, 52));
const caller = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 53)).publicKey();
const other = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 54)).publicKey();
const third = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 55)).publicKey();
const now = 1_800_000_000;
const hash = "a".repeat(64);
const diagnostics = "PRIVATE_PROVIDER_DIAGNOSTICS";
const review = { contractId: contract, roomId: 1, code: "FAM234", viewer: caller,
  memberTarget: 3, shareStroops: "10000000", obligationStroops: "30000000", fundingDeadline: now + 86400, cadence: "Weekly" as const };
const operationReview = { ...review, round: 0 };
const createInput = { contractId: contract, expectedViewer: caller,
  name: "Family", memberTarget: 3, shareXlm: "1", cadence: "Weekly", fundingDays: 7 };
type Core = { status?: string; memberCount?: number; members?: string[]; paid?: bigint[];
  deadline?: number; mode?: string; share?: bigint; code?: string; host?: string; round?: number;
  firstKocok?: number; pooled?: bigint; fullyFundedCount?: number; name?: string };
type Options = { preview?: boolean; env?: string; legacyEnv?: string; auth?: boolean; authSequence?: boolean[];
  viewer?: string; signerViewer?: string; signerDemo?: boolean; signerThrows?: boolean; infoToken?: string;
  infoVersion?: number; readThrows?: boolean; cores?: Core[]; core?: Core; resolvedIds?: number[];
  result?: unknown; phase?: string; roomCount?: number; listThrowsRoom?: number;
  won?: boolean; committed?: boolean; revealed?: boolean; commitCount?: number;
  infoCadence?: { Weekly: number; Biweekly: number; Monthly: number }; infoFirstCommitWindow?: unknown };
const compiled = ts.transpileModule(readFileSync(new URL("../app/arisan-funding-actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Api = Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>;
function setup(options: Options = {}) {
  const calls = { auth: 0, signers: 0, reads: [] as string[], sends: [] as { method: string; args: unknown[] }[], core: 0 };
  let currentCore: Core = options.core ?? {};
  const sandboxModule = { exports: {} as Api };
  const dependencies = {
    "@stellar/stellar-sdk": { StrKey },
    "node:crypto": { randomBytes: () => Buffer.alloc(6, 2) },
    "@/lib/arisan-funding": domain,
    "@/lib/arisan-funding-fees": feePolicy,
    "@/lib/arisan-list": { arisanRoomPage },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/server/arisanAuthorization": { authenticatedArisanWallet: async () => {
      const index = calls.auth++;
      const authorized = options.authSequence?.[Math.min(index, options.authSequence.length - 1)] ?? options.auth ?? true;
      return authorized ? { ok: true, publicKey: options.viewer ?? caller } : { ok: false, error: "Sign in with your saved wallet." };
    } },
    "@/lib/server/userWallet": { getAuthenticatedSigner: async () => {
      calls.signers++;
      if (options.signerThrows) throw new Error(diagnostics);
      return { publicKey: options.signerViewer ?? caller, secret: "ISOLATED_TEST_SECRET", demo: options.signerDemo ?? false };
    } },
    "@/lib/server/arisanCommitment": { deriveArisanSecret: () => Buffer.alloc(32), createArisanCommitment: () => Buffer.alloc(32) },
    "@/lib/server/arisanFundingReceipt": {},
    "@/lib/server/stellar": {
      arisanRoomsId: () => options.legacyEnv ?? legacy, CONTRACTS: { tokenXlmSac: "native-testnet-sac" },
      sc: Object.fromEntries(["u32", "u64", "addr", "sym", "str", "i128", "bytes", "unitVariant"].map(name => [name, (value: unknown) => value])),
      txLink: (value: string) => `https://stellar.expert/explorer/testnet/tx/${value}`,
      readContract: async (id: string, method: string, args: unknown[]) => {
        assert.equal(id, options.env ?? contract); calls.reads.push(method);
        if (options.readThrows) throw new Error(diagnostics);
        if (method === "installment_contract_info") return { version: options.infoVersion ?? 1, token: options.infoToken ?? "native-testnet-sac",
          cadence_weekly: options.infoCadence?.Weekly ?? 60, cadence_biweekly: options.infoCadence?.Biweekly ?? 120,
          cadence_monthly: options.infoCadence?.Monthly ?? 300, max_postpone: 300,
          first_commit_window: options.infoFirstCommitWindow === undefined ? 300 : options.infoFirstCommitWindow, max_funding_window: 30 * 86400 };
        if (method === "room_by_code") return options.resolvedIds?.shift() ?? 1;
        if (method === "room_count") return options.roomCount ?? 1;
        if (method === "get_room") {
          if (args[0] === options.listThrowsRoom) throw new Error(diagnostics);
          currentCore = options.cores?.[Math.min(calls.core, options.cores.length - 1)] ?? options.core ?? {};
          calls.core++;
          return { host: currentCore.host ?? currentCore.members?.[0] ?? other, name: currentCore.name ?? "Isolated installment QA", code: currentCore.code ?? "FAM234",
            member_target: 3, member_count: currentCore.memberCount ?? currentCore.members?.length ?? 1,
            share: currentCore.share ?? 10_000_000n, cadence: ["Weekly"], first_kocok: currentCore.firstKocok ?? 0,
            join_deadline: currentCore.deadline ?? now + 86400, status: [currentCore.status ?? "Open"], round: currentCore.round ?? 0 };
        }
        const members = currentCore.members ?? [other], paid = currentCore.paid ?? members.map(() => 0n);
        if (method === "get_members") return members;
        if (method === "funding_state") return { mode: [currentCore.mode ?? "Installments"], obligation: (currentCore.share ?? 10_000_000n) * 3n,
          pooled: currentCore.pooled ?? paid.reduce((a, b) => a + b, 0n),
          fully_funded_count: currentCore.fullyFundedCount ?? paid.filter(value => value === 30_000_000n).length,
          deadline: currentCore.deadline ?? now + 86400 };
        if (method === "locked_of") return paid[members.indexOf(args[1] as string)] ?? 0n;
        if (method === "draw_phase") return [options.phase ?? "Commit"];
        if (method === "has_won") return options.won ?? false;
        if (method === "has_committed") return options.committed ?? false;
        if (method === "has_revealed") return options.revealed ?? false;
        if (method === "kocok_at") return now + 300;
        if (method === "reveal_at") return now + 330;
        if (method === "commit_count") return options.commitCount ?? 0;
        if (method === "reveal_count") return 0;
        if (method === "winner_of") return caller;
        throw new Error(`Unexpected readonly method ${method}`);
      },
      invokeAs: async (_secret: string, id: string, method: string, args: unknown[], policy: unknown) => {
        assert.deepEqual(policy, feePolicy.FUNDING_INVOKE_OPTIONS, `${method} must use the fixed server fee policy`);
        assert.equal(id, contract); calls.sends.push({ method, args });
        return options.result ?? { ok: true, hash, value: 1 };
      },
    },
  };
  runInNewContext(compiled, { module: sandboxModule, exports: sandboxModule.exports, Buffer, console,
    process: { env: { ARISAN_INSTALLMENTS_CONTRACT: options.env === undefined ? contract : options.env } },
    Date: class extends Date { static now() { return now * 1000; } },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
      return dependencies[name as keyof typeof dependencies];
    },
  });
  return { api: sandboxModule.exports, calls };
}

test("XLM decimal parsing is exact, bounded and never rounds", () => {
  for (const [text, expected] of [["0.0000001", "1"], ["1.2345678", "12345678"], ["1", "10000000"], [" 20.0500 ", "200500000"], ["1000000000", "10000000000000000"]])
    assert.equal(domain.parseFundingXlm(text), expected);
  for (const input of ["0", "-1", "+1", "1e2", "1,25", "1.12345678", "01", "1.", "1000000001", Infinity, null, 1])
    assert.equal(domain.parseFundingXlm(input), null);
  assert.equal(domain.formatFundingXlm("12345678"), "1.2345678");
  assert.equal(domain.formatFundingXlm("30000000"), "3");
  assert.equal(domain.formatFundingXlm("0"), "0");
  assert.equal(domain.formatFundingXlm("-1"), "Unavailable");
});
test("review fixes the original contract, room, account, obligation and deadline", () => {
  assert.equal(domain.validFundingReview(review), true);
  assert.equal(domain.validFundingReview({ ...review, obligationStroops: "1" }), false);
  assert.equal(domain.validFundingDepositReview({ ...review, paidBeforeStroops: "10000000", amountStroops: "20000000" }), true);
  for (const change of [{ paidBeforeStroops: "0", amountStroops: "0" }, { paidBeforeStroops: "10000000", amountStroops: "20000001" }, { paidBeforeStroops: "-1", amountStroops: "1" }])
    assert.equal(domain.validFundingDepositReview({ ...review, ...change }), false);
  const room = { ...review, id: 1, code: "FAM234" };
  assert.equal(domain.fundingReviewMatches(review, room), true);
  for (const change of [{ contractId: legacy }, { fundingDeadline: now + 1 }, { memberTarget: 4 }, { shareStroops: "1" }, { id: 2 }])
    assert.equal(domain.fundingReviewMatches(review, { ...room, ...change }), false);
});
test("unset, malformed, legacy-equal or local-preview candidate rejects before auth, reads or signer", async () => {
  for (const options of [{ env: "" }, { env: "invalid" }, { env: legacy, legacyEnv: legacy }, { preview: true }]) {
    const { api, calls } = setup(options);
    assert.equal((await api.fundingJoin(review)).ok, false);
    assert.equal((await api.fundingState(1)).ready, false);
    assert.equal(calls.auth, 0); assert.equal(calls.reads.length, 0); assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
});
test("all mutation controls reject unauthenticated ownership before custody and contract reads", async () => {
  for (const [method, args] of [["fundingJoin", [review]], ["fundingDeposit", [{ ...review, paidBeforeStroops: "0", amountStroops: "1" }]],
    ["fundingCreate", [createInput]],
    ...["fundingStart", "fundingLeave", "fundingCancel", "fundingCommit", "fundingReveal", "fundingFinalize"].map(method => [method, [operationReview]])] as [string, unknown[]][]) {
    const { api, calls } = setup({ auth: false });
    const result = await api[method](...args);
    assert.equal(result.ok, false, method); assert.equal(calls.signers, 0, method); assert.equal(calls.sends.length, 0, method);
    assert.equal(calls.reads.length, 0, method);
  }
});
test("create validates its native-XLM terms and contract capability before signer access", async () => {
  const input = { ...createInput, shareXlm: "1.25" };
  for (const change of [{ shareXlm: "1.00000001" }, { memberTarget: 2 }, { fundingDays: 2 }, { cadence: "Bogus" }, { name: "" }]) {
    const { api, calls } = setup(); assert.equal((await api.fundingCreate({ ...input, ...change })).ok, false);
    assert.equal(calls.auth, 0); assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
  for (const options of [{ infoToken: "USDC" }, { infoVersion: 2 }, { readThrows: true }]) {
    const { api, calls } = setup(options); assert.equal((await api.fundingCreate(input)).ok, false);
    assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
  const { api, calls } = setup(); const result = await api.fundingCreate(input);
  assert.equal(result.ok, true); assert.equal(calls.sends[0].method, "create_installment_room");
  assert.equal(calls.sends[0].args[4], 12_500_000n); assert.equal(calls.sends[0].args[6], now + 7 * 86400);
  assert.equal(calls.sends[0].args.length, 7);
});
test("join reserves membership only and never includes a payment amount", async () => {
  const { api, calls } = setup(); assert.equal((await api.fundingJoin(review)).ok, true);
  assert.equal(calls.signers, 1); assert.equal(calls.core, 2); assert.equal(calls.sends[0].method, "join_room");
  assert.deepEqual(Array.from(calls.sends[0].args), [1, "FAM234", caller]);
});
test("join rejects exact-deadline, full, already-member or legacy-mode rooms before signer", async () => {
  for (const core of [{ deadline: now }, { members: [caller] }, { members: [other, third, caller] }, { mode: "LegacyFull" }]) {
    const { api, calls } = setup({ core }); assert.equal((await api.fundingJoin(review)).ok, false);
    assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
});
test("join detects invitation, account and signer changes, including changes after custody resolution", async () => {
  for (const options of [{ viewer: other }, { signerViewer: other }, { signerDemo: true }, { authSequence: [true, false] },
    { resolvedIds: [1, 2] }, { cores: [{}, { code: "FAM235" }] }, { cores: [{}, { deadline: now + 1 }] }]) {
    const { api, calls } = setup(options); const result = await api.fundingJoin(review);
    assert.equal(result.ok, false); assert.equal(calls.sends.length, 0); assert.equal(JSON.stringify(result).includes(diagnostics), false);
  }
});
test("deposit moves the reviewed exact partial amount, only for a member with remaining obligation", async () => {
  const payment = { ...review, paidBeforeStroops: "10000000", amountStroops: "5000000" };
  const { api, calls } = setup({ core: { members: [caller, other], paid: [10_000_000n, 0n] } });
  assert.equal((await api.fundingDeposit(payment)).ok, true);
  assert.equal(calls.sends[0].method, "deposit_room"); assert.deepEqual(Array.from(calls.sends[0].args), [1, caller, 5_000_000n]);
});
test("deposit blocks invalid, excessive, changed-paid and expired requests without submitting", async () => {
  const payment = { ...review, paidBeforeStroops: "10000000", amountStroops: "5000000" };
  for (const [options, input] of [
    [{ core: { members: [caller], paid: [10_000_000n] } }, { ...payment, amountStroops: "20000001" }],
    [{ core: { members: [caller], paid: [10_000_000n] } }, { ...payment, amountStroops: "0" }],
    [{ core: { members: [caller], paid: [15_000_000n] } }, payment],
    [{ core: { members: [caller], paid: [10_000_000n], deadline: now } }, payment],
    [{ cores: [{ members: [caller], paid: [10_000_000n] }, { members: [caller], paid: [15_000_000n] }] }, payment],
    [{}, payment],
  ] as [Options, unknown][]) {
    const { api, calls } = setup(options); assert.equal((await api.fundingDeposit(input)).ok, false); assert.equal(calls.sends.length, 0);
  }
});
test("unknown accepted transaction preserves original hash/link and never becomes success", async () => {
  const { api, calls } = setup({ result: { ok: false, pending: true, hash, error: diagnostics } });
  const result = await api.fundingJoin(review); assert.equal(result.ok, false); assert.equal(result.pending, true);
  assert.equal(result.hash, hash); assert.equal(result.link, `https://stellar.expert/explorer/testnet/tx/${hash}`);
  assert.equal(calls.sends.length, 1); assert.equal(JSON.stringify(result).includes(diagnostics), false);
});
test("readonly state contains exact paid and remaining amounts without any signer use", async () => {
  const { api, calls } = setup({ core: { members: [caller, other], paid: [10_000_000n, 30_000_000n] } });
  const result = await api.fundingState(1); assert.equal(result.ready, true); assert.equal(result.viewerIdentity, "personal");
  assert.equal(result.canDeposit, true); assert.equal(result.readyToStart, false); assert.equal(result.fullyFundedCount, 1);
  const seats = result.seats as { paidStroops: string; remainingStroops: string }[];
  assert.equal(seats[0].paidStroops, "10000000"); assert.equal(seats[0].remainingStroops, "20000000"); assert.equal(calls.signers, 0);
  assert.equal(JSON.stringify(result).includes("ISOLATED_TEST_SECRET"), false);
});
test("guest readonly state never claims You, host ownership, or personal controls", async () => {
  const { api, calls } = setup({ auth: false, core: { host: caller, members: [caller] } });
  const result = await api.fundingState(1); assert.equal(result.ready, true); assert.equal(result.viewer, null);
  assert.equal(result.viewerIdentity, "unverified"); assert.equal(result.isHost, false); assert.equal(result.isMember, false);
  assert.equal(result.code, null); assert.equal(result.canDeposit, false); assert.equal(result.canJoin, false); assert.equal(calls.signers, 0);
});
test("contradictory funding sum fails closed rather than authorizing Start", async () => {
  const { api } = setup({ core: { host: caller, members: [caller, other, third], paid: [30_000_000n, 30_000_000n, 30_000_000n], pooled: 1n } });
  assert.equal((await api.fundingState(1)).ready, false);
});
test("list is bounded, readonly and retains cursor on any failed room read", async () => {
  const { api, calls } = setup({ roomCount: 12, core: { members: [caller] } });
  const result = await api.fundingList(); assert.equal(result.ready, true); assert.equal((result.rooms as unknown[]).length, 10);
  assert.equal(result.nextCursor, 2); assert.equal(calls.core, 10); assert.equal(calls.signers, 0);
  const broken = setup({ roomCount: 12, listThrowsRoom: 9 }); assert.equal((await broken.api.fundingList()).ready, false);
});
test("list returns verified artifact timing, never assumes demo cadence or first commit window", async () => {
  const demo = setup({ core: { members: [caller] } });
  const demoList = await demo.api.fundingList();
  assert.equal(demoList.ready, true); assert.equal(demoList.firstCommitWindow, 300);
  assert.equal(JSON.stringify(demoList.cadenceSecs), JSON.stringify({ Weekly: 60, Biweekly: 120, Monthly: 300 }));
  const cadence = { Weekly: 7 * 86400, Biweekly: 14 * 86400, Monthly: 30 * 86400 };
  const production = setup({ core: { members: [caller] }, infoCadence: cadence, infoFirstCommitWindow: 86400 });
  const productionList = await production.api.fundingList();
  assert.equal(productionList.ready, true); assert.equal(productionList.firstCommitWindow, 86400);
  assert.equal(JSON.stringify(productionList.cadenceSecs), JSON.stringify(cadence));
  assert.equal((productionList.rooms as { cadenceSecs: number }[])[0].cadenceSecs, cadence.Weekly);
  for (const value of [0, -1, "300", null, NaN, Infinity]) {
    const invalid = setup({ infoFirstCommitWindow: value });
    assert.equal((await invalid.api.fundingList()).ready, false);
    assert.equal((await invalid.api.fundingCreate(createInput)).ok, false);
    assert.equal(invalid.calls.signers, 0); assert.equal(invalid.calls.sends.length, 0);
  }
});
test("list skips a positively confirmed LegacyFull room, but does not skip unknown modes or failed reads", async () => {
  const legacyRoom = setup({ roomCount: 12, core: { mode: "LegacyFull", members: [caller] } });
  const result = await legacyRoom.api.fundingList();
  assert.equal(result.ready, true); assert.equal((result.rooms as unknown[]).length, 0); assert.equal(result.nextCursor, 2);
  assert.equal((await legacyRoom.api.fundingState(1)).ready, false);
  const unknown = setup({ core: { mode: "Unrecognized", members: [caller] } });
  assert.equal((await unknown.api.fundingList()).ready, false);
  const unavailable = setup({ readThrows: true }); assert.equal((await unavailable.api.fundingList()).ready, false);
});

test("Start requires a full roster, every exact obligation and unexpired funding, before custody", async () => {
  const full = { host: caller, members: [caller, other, third], paid: [30_000_000n, 30_000_000n, 30_000_000n] };
  for (const core of [
    { ...full, members: [caller, other], paid: [30_000_000n, 30_000_000n] },
    { ...full, paid: [30_000_000n, 30_000_000n, 29_999_999n] },
    { ...full, deadline: now },
    { ...full, host: other },
    { ...full, pooled: 1n },
  ] as Core[]) {
    const { api, calls } = setup({ core });
    const updated = { ...operationReview, fundingDeadline: core.deadline ?? review.fundingDeadline };
    assert.equal((await api.fundingStart(updated)).ok, false); assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
  const { api, calls } = setup({ core: full });
  assert.equal((await api.fundingStart(operationReview)).ok, true);
  assert.equal(calls.sends[0].method, "start_room"); assert.deepEqual(Array.from(calls.sends[0].args), [1, caller]);
});
test("Start rechecks funded roster after resolving the signer", async () => {
  const { api, calls } = setup({ cores: [
    { host: caller, members: [caller, other, third], paid: [30_000_000n, 30_000_000n, 30_000_000n] },
    { host: caller, members: [caller, other], paid: [30_000_000n, 30_000_000n] },
  ] });
  assert.equal((await api.fundingStart(operationReview)).ok, false); assert.equal(calls.signers, 1); assert.equal(calls.sends.length, 0);
});
test("Leave refunds through contract with no invented amount, including an expired partial deposit", async () => {
  for (const deadline of [now + 86400, now]) {
    const { api, calls } = setup({ core: { host: other, members: [other, caller], paid: [30_000_000n, 5_000_000n], deadline } });
    const result = await api.fundingLeave({ ...operationReview, fundingDeadline: deadline });
    assert.equal(result.ok, true); assert.equal(calls.sends[0].method, "leave_room");
    assert.deepEqual(Array.from(calls.sends[0].args), [1, caller]);
  }
  const host = setup({ core: { host: caller, members: [caller] } });
  assert.equal((await host.api.fundingLeave(operationReview)).ok, false); assert.equal(host.calls.signers, 0);
});
test("Cancel allows host before deadline and a member at deadline, not early nonhost or outsiders", async () => {
  const host = setup({ core: { host: caller, members: [caller], paid: [5_000_000n] } });
  assert.equal((await host.api.fundingCancel(operationReview)).ok, true); assert.equal(host.calls.sends[0].method, "cancel_room");
  const expired = setup({ core: { host: other, members: [other, caller], deadline: now, paid: [0n, 5_000_000n] } });
  assert.equal((await expired.api.fundingCancel({ ...operationReview, fundingDeadline: now })).ok, true);
  for (const core of [{ host: other, members: [other, caller] }, { host: other, members: [other], deadline: now }]) {
    const { api, calls } = setup({ core });
    assert.equal((await api.fundingCancel({ ...operationReview, fundingDeadline: core.deadline ?? review.fundingDeadline })).ok, false);
    assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
});
test("room operation review blocks contract, account, deadline and round changes", async () => {
  const core = { host: caller, members: [caller], paid: [5_000_000n] };
  for (const changed of [{ ...operationReview, viewer: other }, { ...operationReview, contractId: legacy },
    { ...operationReview, fundingDeadline: now + 1 }, { ...operationReview, round: 1 }, { ...operationReview, cadence: "Monthly" }]) {
    const { api, calls } = setup({ core });
    assert.equal((await api.fundingCancel(changed)).ok, false); assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
  const swapped = setup({ core, signerViewer: other });
  assert.equal((await swapped.api.fundingCancel(operationReview)).ok, false); assert.equal(swapped.calls.sends.length, 0);
});
test("active lifecycle uses exact reviewed round and participant-bound commit/reveal", async () => {
  const core = { status: "Active", firstKocok: now + 300, round: 1, host: caller,
    members: [caller, other, third], paid: [30_000_000n, 30_000_000n, 30_000_000n], pooled: 90_000_000n };
  const activeReview = { ...operationReview, round: 1 };
  const commit = setup({ core }); assert.equal((await commit.api.fundingCommit(activeReview)).ok, true);
  assert.equal(commit.calls.sends[0].method, "commit_draw"); assert.equal(commit.calls.sends[0].args.length, 3);
  const reveal = setup({ core, phase: "Reveal", committed: true }); assert.equal((await reveal.api.fundingReveal(activeReview)).ok, true);
  assert.equal(reveal.calls.sends[0].method, "reveal_draw");
  const finalize = setup({ core, phase: "Finalizable" }); assert.equal((await finalize.api.fundingFinalize(activeReview)).ok, true);
  assert.equal(finalize.calls.sends[0].method, "finalize_draw");
  for (const [method, options] of [["fundingCommit", { phase: "Reveal" }], ["fundingCommit", { won: true }],
    ["fundingCommit", { committed: true }], ["fundingReveal", { phase: "Reveal" }], ["fundingReveal", { phase: "Reveal", committed: true, revealed: true }],
    ["fundingFinalize", { phase: "Commit" }]] as [string, Options][]) {
    const invalid = setup({ core, ...options }); assert.equal((await invalid.api[method](activeReview)).ok, false);
    assert.equal(invalid.calls.signers, 0); assert.equal(invalid.calls.sends.length, 0);
  }
  const changedRound = setup({ cores: [core, { ...core, round: 2 }] });
  assert.equal((await changedRound.api.fundingCommit(activeReview)).ok, false); assert.equal(changedRound.calls.sends.length, 0);
});
test("postponement follows actual contract limit and cannot follow an existing commitment", async () => {
  const core = { status: "Active", firstKocok: now + 300, round: 1, host: caller,
    members: [caller, other, third], paid: [30_000_000n, 30_000_000n, 30_000_000n], pooled: 90_000_000n };
  const activeReview = { ...operationReview, round: 1 };
  const valid = setup({ core }); assert.equal((await valid.api.fundingPostpone(activeReview, 300)).ok, true);
  assert.deepEqual(Array.from(valid.calls.sends[0].args), [1, caller, 300]);
  for (const [options, delay] of [[{}, 301], [{ commitCount: 1 }, 60], [{ phase: "Reveal" }, 60]] as [Options, number][]) {
    const invalid = setup({ core, ...options }); assert.equal((await invalid.api.fundingPostpone(activeReview, delay)).ok, false);
    assert.equal(invalid.calls.signers, 0); assert.equal(invalid.calls.sends.length, 0);
  }
});
test("a confirmed create with unreadable ID retains receipt and warns against creating twice", async () => {
  const { api } = setup({ result: { ok: true, hash, value: null } });
  const result = await api.fundingCreate(createInput);
  assert.equal(result.ok, false); assert.equal(result.hash, hash); assert.equal(typeof result.link, "string");
  assert.equal(result.pending, true);
  assert.match(result.error as string, /confirmed.*Do not create/i);
});
test("create review rejects changed account or configured contract before custody", async () => {
  for (const input of [{ ...createInput, expectedViewer: other }, { ...createInput, contractId: legacy }]) {
    const { api, calls } = setup(); assert.equal((await api.fundingCreate(input)).ok, false);
    assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
  const swapped = setup({ signerViewer: other });
  assert.equal((await swapped.api.fundingCreate(createInput)).ok, false); assert.equal(swapped.calls.sends.length, 0);
});
test("confirmed create can recover its exact room by code without resubmitting", async () => {
  const { api, calls } = setup({ result: { ok: true, hash, value: null }, core: {
    host: caller, members: [caller], name: "Family", code: "444444", deadline: now + 7 * 86400,
  } });
  const result = await api.fundingCreate(createInput);
  assert.equal(result.ok, true); assert.equal(result.id, 1); assert.equal(result.hash, hash);
  assert.equal(calls.sends.length, 1); assert.equal(calls.reads.filter(method => method === "room_by_code").length, 1);
});
test("confirmed create with unreadable room remains retry-locked even after RPC SUCCESS, until receipt verification", async () => {
  const data = new Map<string, string>();
  const cells: unknown[] = [];
  let cursor = 0, actionCalls = 0;
  const context = "arisan:funding:create-qa";
  const globals = { window: new EventTarget(), Event,
    crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    sessionStorage: { getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) },
  };
  function load<T>(path: string, dependencies: Record<string, unknown>): T {
    const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const sandboxModule = { exports: {} as T };
    runInNewContext(compiled, { ...globals, module: sandboxModule, exports: sandboxModule.exports,
      require(name: string) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; } });
    return sandboxModule.exports;
  }
  const preview = { isLocalPreview: false };
  const helper = load("../lib/ui/unresolved-submission.ts", { "../local-preview": preview });
  type Guard = { locked: boolean; run(action: () => Promise<Record<string, unknown>>): Promise<unknown>;
    check(): Promise<boolean>; clearVerified(hash: string): boolean };
  const hook = load<{ useUnresolvedSubmission(context: string, options: { keepSuccessLocked: boolean }): Guard }>("../lib/ui/useUnresolvedSubmission.ts", {
    react: { useState(initial: unknown) { const index = cursor++; if (!(index in cells)) cells[index] = initial;
      return [cells[index], (next: unknown) => { cells[index] = next; }]; },
      useRef(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: initial }); },
      useEffect() { /* This test drives render and storage directly, not browser events. */ } },
    "@/lib/local-preview": preview, "./unresolved-submission": helper,
    "@/app/actions": { checkSubmittedTransaction: async () => ({ ok: true, hash }) },
  });
  const render = () => { cursor = 0; return hook.useUnresolvedSubmission(context, { keepSuccessLocked: true }); };
  const backend = setup({ result: { ok: true, hash, value: null } });
  await render().run(async () => { actionCalls++; return backend.api.fundingCreate(createInput); });
  assert.equal(render().locked, true); assert.equal(backend.calls.sends.length, 1);
  assert.equal(await render().check(), true); assert.equal(render().locked, true);
  assert.equal(await render().run(async () => { actionCalls++; return backend.api.fundingCreate(createInput); }), null);
  assert.equal(actionCalls, 1); assert.equal(backend.calls.sends.length, 1);
  assert.equal(render().clearVerified("b".repeat(64)), false); assert.equal(render().locked, true);
  // Only the feature's independent, matching-hash receipt verification may
  // clear this safeguard; a generic successful RPC status above could not.
  assert.equal(render().clearVerified(hash), true); assert.equal(render().locked, false);
});
