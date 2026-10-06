"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useGoBack } from "@/lib/ui/useGoBack";
import {
  smartSavingsState,
  smartSavingsOpen,
  smartSavingsDeposit,
  smartSavingsWithdraw,
} from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { moneyCopy, moneyMessage } from "@/lib/i18n/revamp-money";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  Money,
  Progress,
  PoweredByStellar,
} from "@/components/ui/kit";
import { SalapiMascot } from "@/components/ui/mascot";
import {
  CURRENCY,
  formatLocal,
  formatLocalAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";
import type { Locale } from "@/lib/i18n/config";
import { isLocalPreview } from "@/lib/local-preview";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import SuccessMotion from "@/components/ui/SuccessMotion";
import { confirmSavingsPreview, readSavingsPreview, reviewSavingsPreview, savingsPreviewAmount, type SavingsPreviewGoal, type SavingsPreviewReview, type SavingsPreviewState } from "@/lib/savings-preview";
import {
  type SavingsGoal,
  allocate,
  clearGoals,
  loadGoals,
  newId,
  reconcile,
  saveGoals,
  share,
} from "@/lib/savings";

type State = Awaited<ReturnType<typeof smartSavingsState>>;

// Quick-pick figures per display currency — round numbers in each.
const TARGETS: Record<Locale, string[]> = {
  en: ["100", "250", "500", "1000"],
  tl: ["5000", "10000", "20000", "50000"],
  id: ["1000000", "2500000", "5000000", "10000000"],
  vi: ["2000000", "5000000", "10000000", "20000000"],
};
const ADDS: Record<Locale, string[]> = {
  en: ["10", "25", "50", "100"],
  tl: ["500", "1000", "2000", "5000"],
  id: ["100000", "250000", "500000", "1000000"],
  vi: ["200000", "500000", "1000000", "2000000"],
};

const kicker: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: T.slate,
};

function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ position: "relative", width: 120, height: 120, flex: "0 0 auto" }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} stroke={T.hairline} strokeWidth="10" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke={T.moneyIn}
          strokeWidth="10"
          fill="none"
          strokeDasharray={`${(circ * p) / 100} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dasharray .6s" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div className="sl-balance" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {Math.round(p)}%
        </div>
        <div style={{ fontSize: 11, color: T.slate, fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  icon,
  name,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        cursor: "pointer",
        padding: "12px 14px",
        borderRadius: 12,
        background: T.surface,
        boxShadow:
          "inset 0 0 0 " + (selected ? "1.5px " + T.action : "1px " + T.hairline),
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: selected ? T.actionTint : T.canvas,
          color: selected ? T.action : T.slate,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{name}</div>
        <div style={{ fontSize: 11.5, color: T.slate, marginTop: 2, lineHeight: 1.4 }}>
          {desc}
        </div>
      </div>
      {selected && Ico.check({ size: 16, c: T.action })}
    </button>
  );
}

const previewInput: React.CSSProperties = { width: "100%", minHeight: 48, padding: "12px 14px", border: "1px solid #dce4ef", borderRadius: 14, background: "#fff", color: T.ink, fontSize: 16, boxSizing: "border-box" };
const previewLabel: React.CSSProperties = { display: "grid", gap: 8, fontSize: 13, fontWeight: 600, color: T.slate };
const previewAmount = (units: string, currency: Locale) => formatLocal(Number(BigInt(units)) * 13 / 20_000_000, currency);

function PreviewSavingsScreen() {
  const { currency, locale } = useT();
  const m = moneyCopy(locale);
  const goBack = useGoBack("/vaults");
  const [state, setState] = useState<SavingsPreviewState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<SavingsPreviewGoal["mode"]>("disciplined");
  const [deposit, setDeposit] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const [review, setReview] = useState<SavingsPreviewReview | null>(null);
  const confirming = useRef(false);
  const reviewedId = useRef<string | null>(null);
  function restore() {
    reviewedId.current = null;
    const result = readSavingsPreview(); setLoaded(true); setReview(null);
    if (!result.ok) { setError(result.error); setState(null); return; }
    setState(result.value); setError("");
    setSelected(current => result.value.goals.some(goal => goal.id === current) ? current : result.value.goals[0]?.id ?? "");
  }
  useEffect(() => { const timer = setTimeout(restore, 0); return () => clearTimeout(timer); }, []);
  const goal = state?.goals.find(goal => goal.id === selected) ?? state?.goals[0];
  const meta = CURRENCY[currency];
  const amountValid = (value: string) => savingsPreviewAmount({ amount: value, currency }) !== null;
  const createView = creating || state?.goals.length === 0;
  function prepare(kind: SavingsPreviewReview["kind"]) {
    if (!state || confirming.current) return;
    const result = reviewSavingsPreview(state, { kind, goalId: goal?.id, name, mode, money: { amount: kind === "create" ? target : kind === "deposit" ? deposit : withdrawal, currency } });
    setNotice("");
    if (!result.ok) { setError(result.error); return; }
    reviewedId.current = result.value.id;
    setError(""); setReview(result.value);
  }
  function confirm() {
    if (!review || reviewedId.current !== review.id || confirming.current) return;
    confirming.current = true;
    reviewedId.current = null;
    try {
      const result = confirmSavingsPreview(review);
      if (!result.ok) { setError(result.error); setReview(null); setState(null); return; }
      setState(result.value.state); setSelected(review.goalId); setCreating(false); setReview(null); setError(""); setDeposit(""); setWithdrawal("");
      setNotice(result.value.duplicate ? m("This local review was already saved. No duplicate change was made.") : m("{result}. Browser-session simulation only. No wallet balance changed and no money moved.", { result: review.kind === "create" ? m("Goal created") : review.kind === "deposit" ? m("Deposit added to the example") : m("Saved demo released") }));
    } finally { confirming.current = false; }
  }
  const reviewGoal = review ? state?.goals.find(current => current.id === review.goalId) : undefined;
  return <div style={{ fontFamily: T.fontSans, color: T.ink, paddingBottom: 16 }}>
    <AppBar title={m("Smart Savings")} leading={<IconButton ariaLabel={m("Back to Vaults")} onClick={goBack}>{Ico.back({})}</IconButton>} />
    <div style={{ display: "grid", gap: 16, padding: "4px 16px 0" }}>
      <Card p={20} style={{ background: "#F2EFE7", borderRadius: 26 }}><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div style={{ minWidth: 0, flex: 1 }}><Chip kind="warn">{m("LOCAL SAVINGS DEMO")}</Chip><h1 style={{ fontSize: 28, lineHeight: 1.15, letterSpacing: "-.04em", margin: "14px 0 8px", fontWeight: 800 }}>{m("A little closer.")}<br />{m("One step at a time.")}</h1><p style={{ margin: 0, color: T.slate, fontSize: 13, lineHeight: 1.55 }}>{m("Set a goal, practice deposits, and see its withdrawal rules before confirming.")}</p></div><Image src="/illustrations/savings.png" alt="A plant growing from a savings jar" width={104} height={116} style={{ objectFit: "contain", flex: "0 0 auto", width: "27%", maxWidth: 104 }} /></div></Card>
      <p style={{ margin: 0, color: T.slate, fontSize: 12, lineHeight: 1.55 }}>{m("Examples are saved only in this browser session. Display currency is illustrative. No interest, yield, auth, provider or blockchain request is involved.")}</p>
      {error ? <div role="alert" style={{ borderRadius: 14, padding: 14, background: "#FBEAE8", color: T.danger, fontSize: 13, lineHeight: 1.5 }}>{moneyMessage(locale, error)}</div> : null}
      {notice ? <SuccessMotion key={notice} title={m("Local savings demo saved")}>{notice}</SuccessMotion> : null}
      {!loaded ? <p role="status">{m("Reading this browser session…")}</p> : !state ? <Card p={20}><h2 style={{ fontSize: 19, margin: "0 0 10px" }}>{m("Your session could not load.")}</h2><p style={{ color: T.slate, fontSize: 13, lineHeight: 1.5 }}>{m("Existing savings data has not been reset. Restore browser storage access before saving another demo.")}</p><Btn kind="secondary" onClick={restore}>{m("Retry reading local savings")}</Btn></Card> : review ? <Card p={20} style={{ background: "#fff", borderRadius: 24 }}>
        <Chip kind="action">{m("REVIEW · NO MONEY MOVES")}</Chip><h2 style={{ fontSize: 23, fontWeight: 750, letterSpacing: "-.03em", margin: "14px 0" }}>{review.kind === "create" ? m("Check your goal.") : review.kind === "deposit" ? m("Review your deposit demo.") : m("Review your withdrawal demo.")}</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", margin: 0, fontSize: 14 }}><dt style={{ color: T.slate }}>{m("Goal")}</dt><dd style={{ margin: 0, textAlign: "right", overflowWrap: "anywhere", fontWeight: 700 }}>{review.name ?? reviewGoal?.name}</dd><dt style={{ color: T.slate }}>{review.kind === "create" ? m("Target") : m("Demo amount")}</dt><dd style={{ margin: 0, textAlign: "right", fontWeight: 700 }}>{previewAmount(review.amount,currency)}</dd><dt style={{ color: T.slate }}>{m("Rule")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{m((review.mode ?? reviewGoal?.mode) === "disciplined" ? "Disciplined" : "Flexible")}</dd><dt style={{ color: T.slate }}>{m("Wallet balance change")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{m("None")}</dd></dl>
        <p style={{ color: T.slate, fontSize: 13, lineHeight: 1.55, margin: "18px 0" }}>{(review.mode ?? reviewGoal?.mode) === "disciplined" ? m("Disciplined: release the full saved demo only after reaching the target.") : m("Flexible: withdraw a positive demo amount up to this goal's saved amount.")} {m("This changes only the local example, not your wallet.")}</p>
        <Btn onClick={confirm}>{m("Confirm local savings demo")}</Btn><Btn kind="secondary" onClick={() => { reviewedId.current = null; setReview(null); setError(""); }}>{m("Edit before confirming")}</Btn>
      </Card> : createView ? <Card p={20} style={{ borderRadius: 24 }}>
        <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 750 }}>{m("Give your goal a name.")}</h2>
        <div style={{ display: "grid", gap: 18 }}><label style={previewLabel}>{m("Goal name")}<input aria-label={m("Local goal name")} style={previewInput} value={name} maxLength={40} placeholder={m("e.g. Emergency fund")} onChange={event => setName(event.target.value)} /></label><label style={previewLabel}>{m("Target ·")} {meta.code}<input aria-label={m("Local goal target")} inputMode="decimal" style={previewInput} value={target} placeholder="0" onChange={event => setTarget(event.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>{TARGETS[currency].map(value => <button type="button" key={value} onClick={() => setTarget(value)} style={{ border: "1px solid #dce4ef", borderRadius: 12, minHeight: 44, background: T.actionTint, color: T.action, fontSize: 12, fontWeight: 650 }}>{formatLocalAmount(Number(value),currency)}</button>)}</div>
          <div role="group" aria-label={m("Local goal withdrawal rule")} style={{ display: "grid", gap: 8 }}><ModeCard selected={mode === "disciplined"} onClick={() => setMode("disciplined")} icon={Ico.lock({})} name={m("Disciplined")} desc={m("Release the full saved demo once the target is reached.")} /><ModeCard selected={mode === "flexible"} onClick={() => setMode("flexible")} icon={Ico.shield({})} name={m("Flexible")} desc={m("Withdraw any positive demo amount up to the saved amount.")} /></div>
          <Btn disabled={!name.trim() || !amountValid(target) || state.goals.length >= 12} onClick={() => prepare("create")}>{m("Review local goal")}</Btn>{state.goals.length ? <Btn kind="quiet" onClick={() => { setCreating(false); setError(""); }}>{m("Back to your local goals")}</Btn> : null}
        </div>
      </Card> : goal ? <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} aria-label={m("Choose local savings goal")}>{state.goals.map(current => <button key={current.id} type="button" aria-pressed={current.id === goal.id} onClick={() => { setSelected(current.id); setError(""); setNotice(""); setDeposit(""); setWithdrawal(""); }} style={{ maxWidth: "100%", minHeight: 44, borderRadius: 14, border: "1px solid #dce4ef", padding: "10px 14px", color: current.id === goal.id ? "#fff" : T.ink, background: current.id === goal.id ? T.action : "#fff", fontWeight: 650, overflowWrap: "anywhere" }}>{current.name}</button>)}</div>
        <Card p={20} style={{ background: "#0C2447", color: "#fff", borderRadius: 24 }}><div style={{ display: "flex", alignItems: "center", gap: 18 }}><div style={{ flex: 1, minWidth: 0 }}><span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "#acc8ff" }}>{m(goal.mode === "disciplined" ? "Disciplined" : "Flexible")} {m("· local goal")}</span><h2 style={{ margin: "10px 0", fontSize: 25, fontWeight: 750, overflowWrap: "anywhere" }}>{goal.name}</h2><strong style={{ fontSize: 27, overflowWrap: "anywhere" }}>{previewAmount(goal.saved,currency)}</strong><p style={{ color: "#bdccea", fontSize: 13, margin: "8px 0" }}>{m("of")} {previewAmount(goal.target,currency)} {m("target")}</p></div><Ring pct={Number(BigInt(goal.saved) * 100n / BigInt(goal.target))} label="demo progress" /></div><p style={{ color: "#bdccea", fontSize: 12, margin: "16px 0 0" }}>{m("An example tally only. Your Salapi wallet balance is unchanged.")}</p></Card>
        <Card p={20} style={{ borderRadius: 24 }}><h3 style={{ fontSize: 18, margin: "0 0 14px" }}>{m("Take the next small step.")}</h3><label style={previewLabel}>{m("Deposit demo ·")} {meta.code}<input aria-label={m("Local savings deposit")} style={previewInput} inputMode="decimal" placeholder="0" value={deposit} onChange={event => setDeposit(event.target.value)} /></label><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, margin: "12px 0" }}>{ADDS[currency].map(value => <button type="button" key={value} onClick={() => setDeposit(value)} style={{ minHeight: 44, border: 0, borderRadius: 12, background: T.actionTint, color: T.action, fontWeight: 650, fontSize: 12 }}>{formatLocalAmount(Number(value),currency)}</button>)}</div><Btn disabled={!amountValid(deposit)} onClick={() => prepare("deposit")}>{m("Review deposit demo")}</Btn></Card>
        <Card p={20} style={{ background: "#F2EFE7", borderRadius: 24 }}><h3 style={{ fontSize: 18, margin: "0 0 10px" }}>{m("Your withdrawal rule.")}</h3><p style={{ fontSize: 13, color: T.slate, lineHeight: 1.55 }}>{goal.mode === "disciplined" ? m("Release the full saved demo only after the target is reached. There is no time-based unlock or interest.") : m("Choose a positive amount up to this goal's saved demo tally. This does not cash out real money.")}</p>{goal.mode === "flexible" ? <label style={{ ...previewLabel, marginBottom: 14 }}>{m("Withdrawal demo ·")} {meta.code}<input aria-label={m("Local savings withdrawal")} style={previewInput} inputMode="decimal" placeholder="0" value={withdrawal} onChange={event => setWithdrawal(event.target.value)} /></label> : null}<Btn kind="secondary" disabled={goal.mode === "disciplined" ? BigInt(goal.saved) === 0n || BigInt(goal.saved) < BigInt(goal.target) : !amountValid(withdrawal) || (savingsPreviewAmount({ amount: withdrawal, currency }) ?? 0n) > BigInt(goal.saved)} onClick={() => prepare("withdraw")}>{m("Review withdrawal demo")}</Btn>{goal.mode === "disciplined" && BigInt(goal.saved) < BigInt(goal.target) ? <p role="status" style={{ margin: "12px 0 0", fontSize: 12, color: T.slate }}>{m("Target not reached. Withdrawal demo is locked.")}</p> : null}</Card>
        <Btn kind="quiet" disabled={state.goals.length >= 12} onClick={() => { setCreating(true); setName(""); setTarget(""); setNotice(""); setError(""); }}>{m("Create another local goal")}</Btn>
      </> : null}
      <div style={{ display: "grid", gap: 8, justifyItems: "center", color: T.slate, fontSize: 12, marginTop: 8 }}><PoweredByStellar /><span>{m("Local simulation · no money or Testnet tokens move.")}</span></div>
    </div>
  </div>;
}

export default function SavingsScreen() { return isLocalPreview ? <PreviewSavingsScreen /> : <LiveSavingsScreen />; }

function LiveSavingsScreen() {
  const submission = useUnresolvedSubmission("savings:experimental");
  const { t, currency, locale } = useT();
  const m = moneyCopy(locale);
  const goBack = useGoBack("/vaults");
  const [st, setSt] = useState<State | null>(null);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [transitionPending, start] = useTransition();
  const pending = transitionPending || submission.locked;
  const submitting = useRef(false);
  const [msg, setMsg] = useState<{
    tone: "ok" | "err";
    text: string;
    link?: string;
  } | null>(null);

  // Create-screen fields.
  const [cName, setCName] = useState("");
  const [cTarget, setCTarget] = useState("");
  const [cMode, setCMode] = useState<"flexible" | "disciplined">("disciplined");
  const cTouched = useRef(false);

  // In-progress fields.
  const [depTab, setDepTab] = useState<"split" | "one">("split");
  const [depAmt, setDepAmt] = useState("");
  const [depGoal, setDepGoal] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [aName, setAName] = useState("");
  const [aTarget, setATarget] = useState("");

  // A goal's display name; an auto-reconstructed envelope has an empty name
  // and shows the localized default (resolved at render, not at refresh time).
  const goalLabel = (g: SavingsGoal) => g.name || t("savings.defaultGoalName");

  async function refresh() {
    if (isLocalPreview) return;
    let s: State;
    try { s = await smartSavingsState(); }
    catch {
      setSt({ ready: false });
      setMsg({ tone: "err", text: "The experimental savings vault could not be loaded. Reload this page to try again." });
      return;
    }
    setSt(s);
    if (s.ready && s.hasGoal) {
      let g = loadGoals();
      if (g.length === 0) {
        // No stored envelopes (storage cleared, or a goal opened before
        // multi-goal shipped) — reconstruct one default envelope from the
        // on-chain vault. Empty name → goalLabel renders the localized default.
        g = [
          {
            id: newId(),
            name: "",
            target: s.targetPesos,
            weight: 100,
            saved: s.savedPesos,
          },
        ];
      }
      g = reconcile(g, s.savedPesos);
      saveGoals(g);
      setGoals(g);
    } else {
      setGoals([]);
    }
  }

  useEffect(() => {
    Promise.resolve().then(refresh);
  }, []);

  // Prefill the create target in the active display currency.
  useEffect(() => {
    if (!cTouched.current) setCTarget(TARGETS[currency][2]);
  }, [currency]);

  function execute(operation: () => Promise<void>) {
    if (isLocalPreview || submitting.current || submission.locked) return;
    submitting.current = true;
    start(async () => {
      try { await operation(); }
      catch { setMsg({ tone: "err", text: m("The operation was not confirmed. Check the wallet history before trying again.") }); }
      finally { submitting.current = false; }
    });
  }

  function create() {
    if (isLocalPreview) return;
    const targetPhp = pesoFromLocal(Number(cTarget) || 0, currency);
    const name = cName.trim();
    if (!name) {
      setMsg({ tone: "err", text: t("savings.nameYourGoal") });
      return;
    }
    if (!(targetPhp > 0)) {
      setMsg({ tone: "err", text: t("savings.somethingWrong") });
      return;
    }
    execute(async () => {
      setMsg(null);
      const r = await submission.run(() => smartSavingsOpen(
        { amount: cTarget, currency },
        cMode
      ));
      if (!r) return;
      if (r.ok) {
        saveGoals([{ id: newId(), name, target: targetPhp, weight: 100, saved: 0 }]);
        setMsg({
          tone: "ok",
          text: t("savings.goalOpenedOk", {
            amount: formatLocalAmount(Number(cTarget) || 0, currency),
          }),
          link: r.link,
        });
      } else {
        setMsg({ tone: "err", text: r.error || t("savings.somethingWrong") });
      }
      await refresh();
    });
  }

  function deposit() {
    if (isLocalPreview) return;
    const display = Number(depAmt) || 0;
    const amtPhp = pesoFromLocal(display, currency);
    if (!(amtPhp > 0)) {
      setMsg({ tone: "err", text: t("savings.somethingWrong") });
      return;
    }
    const splitMode = goals.length < 2 || depTab === "split";
    const single = goals.find((g) => g.id === depGoal) ?? goals[0];
    execute(async () => {
      setMsg(null);
      const r = await submission.run(() => smartSavingsDeposit({ amount: depAmt, currency }));
      if (!r) return;
      if (r.ok) {
        let g: SavingsGoal[];
        let text: string;
        if (splitMode) {
          const parts = allocate(amtPhp, goals);
          g = goals.map((go) => {
            const p = parts.find((x) => x.id === go.id);
            return p ? { ...go, saved: go.saved + p.amount } : go;
          });
          text =
            goals.length < 2
              ? t("savings.addedOk", { amount: formatLocalAmount(display, currency) })
              : t("savings.splitAcrossOk", {
                  amount: formatLocalAmount(display, currency),
                });
        } else {
          g = goals.map((go) =>
            go.id === single.id ? { ...go, saved: go.saved + amtPhp } : go
          );
          text = t("savings.addedOk", {
            amount: formatLocalAmount(display, currency),
          });
        }
        saveGoals(g);
        setDepAmt("");
        setMsg({ tone: "ok", text, link: r.link });
      } else {
        setMsg({ tone: "err", text: r.error || t("savings.somethingWrong") });
      }
      await refresh();
    });
  }

  function withdraw() {
    if (isLocalPreview) return;
    execute(async () => {
      setMsg(null);
      const r = await submission.run(() => smartSavingsWithdraw());
      if (!r) return;
      if (r.ok) {
        clearGoals();
        setMsg({ tone: "ok", text: t("savings.releasedOk"), link: r.link });
      } else {
        setMsg({ tone: "err", text: r.error || t("savings.somethingWrong") });
      }
      await refresh();
    });
  }

  // Adding a goal is app-layer only (no transaction): a new envelope of the
  // one on-chain vault. It starts empty and joins the allocator split.
  function addGoal() {
    const targetPhp = pesoFromLocal(Number(aTarget) || 0, currency);
    const name = aName.trim();
    if (!name || !(targetPhp > 0)) {
      setMsg({ tone: "err", text: t("savings.nameYourGoal") });
      return;
    }
    const avg =
      goals.reduce((a, g) => a + g.weight, 0) / Math.max(1, goals.length);
    const g = [
      ...goals,
      {
        id: newId(),
        name,
        target: targetPhp,
        weight: Math.round(avg) || 50,
        saved: 0,
      },
    ];
    saveGoals(g);
    setGoals(g);
    setAdding(false);
    setAName("");
    setATarget("");
    setMsg(null);
  }

  function bumpWeight(id: string, delta: number) {
    const g = goals.map((go) =>
      go.id === id ? { ...go, weight: Math.max(0, go.weight + delta) } : go
    );
    if (g.every((go) => go.weight === 0)) {
      setMsg({ tone: "err", text: m("Keep at least one goal allocation above zero.") });
      return;
    }
    saveGoals(g);
    setGoals(g);
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
  };

  const messageToast =
    msg ? (
      <div style={{ padding: "14px 16px 0" }}>
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: msg.tone === "ok" ? T.moneyInTint : "#FBEAE8",
            color: msg.tone === "ok" ? T.moneyIn : T.danger,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {msg.tone === "ok" ? "✓ " : ""}
            {moneyMessage(locale, msg.text)}
          </span>
          {msg.link && (
            <a
              href={msg.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: T.action,
                fontFamily: T.fontMono,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {t("savings.viewOnStellar")} {Ico.link({ size: 13, c: T.action })}
            </a>
          )}
        </div>
      </div>
    ) : null;
  const toast = <><SubmissionStatusPanel guard={submission} onRefresh={refresh} />{messageToast}</>;

  // ── LOADING ──
  if (st === null) {
    return (
      <div style={shell}>
        {toast}
        <AppBar
          leading={<IconButton onClick={goBack}>{Ico.back({})}</IconButton>}
          title={t("savings.title")}
        />
        <div style={{ padding: "60px 24px", textAlign: "center", color: T.slate, fontSize: 14 }}>
          {t("savings.loadingGoal")}
        </div>
      </div>
    );
  }

  // ── VAULT NOT CONFIGURED ──
  if (!st.ready) {
    return (
      <div style={shell}>
        <AppBar
          leading={<IconButton onClick={goBack}>{Ico.back({})}</IconButton>}
          title={t("savings.title")}
        />
        <div style={{ padding: "60px 28px 0", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, margin: "0 auto", borderRadius: 18, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Ico.lock({ size: 32, c: T.action })}
          </div>
          <div style={{ marginTop: 18, fontSize: 20, fontWeight: 600 }}>{t("savings.title")}</div>
          <div style={{ marginTop: 8, fontSize: 14, color: T.slate, lineHeight: 1.5 }}>
            {t("savings.notConfigured")}
          </div>
        </div>
        {toast}
        <div style={{ padding: "26px 16px 0", display: "flex", justifyContent: "center" }}>
          <PoweredByStellar />
        </div>
      </div>
    );
  }

  // ── NO VAULT YET → CREATE ──
  if (!st.hasGoal) {
    const cTargetNum = Number(cTarget) || 0;
    return (
      <div style={shell}>
        <AppBar
          leading={<IconButton onClick={goBack}>{Ico.back({})}</IconButton>}
          title={t("savings.newGoal")}
        />
        <div style={{ padding: "6px 20px 8px" }}>
          <div style={kicker}>{t("savings.kicker")}</div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>
            {t("savings.whatFor")}
          </div>
        </div>

        {/* Goal name */}
        <div style={{ padding: "8px 16px 0" }}>
          <div style={{ ...kicker, marginBottom: 6 }}>{t("savings.goalNameLabel")}</div>
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value.slice(0, 40))}
            placeholder={t("savings.goalNamePh")}
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: 12,
              border: "none",
              boxShadow: "inset 0 0 0 1px " + T.hairline,
              background: T.surface,
              fontSize: 15,
              fontFamily: T.fontSans,
              color: T.ink,
              outline: "none",
            }}
          />
        </div>

        {/* Target */}
        <div style={{ padding: "16px 24px 0", textAlign: "center" }}>
          <div style={kicker}>{t("savings.targetAmount")}</div>
          <div
            className="sl-balance"
            style={{ marginTop: 6, fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", display: "inline-flex", alignItems: "baseline", gap: 4 }}
          >
            <span style={{ fontSize: 22, color: T.slate, fontWeight: 500 }}>
              {CURRENCY[currency].symbol}
            </span>
            <input
              value={cTarget}
              onChange={(e) => {
                cTouched.current = true;
                setCTarget(e.target.value.replace(/[^0-9]/g, ""));
              }}
              inputMode="numeric"
              placeholder="0"
              style={{ width: Math.max(2, cTarget.length || 1) + "ch", border: "none", outline: "none", background: "transparent", font: "inherit", color: T.ink, textAlign: "center" }}
            />
          </div>
        </div>
        <div style={{ padding: "12px 16px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {TARGETS[currency].map((a) => (
            <span
              key={a}
              onClick={() => {
                cTouched.current = true;
                setCTarget(a);
              }}
              style={{ cursor: "pointer" }}
            >
              <Chip kind={a === cTarget ? "action" : "neutral"} size="md">
                {formatLocalAmount(Number(a), currency)}
              </Chip>
            </span>
          ))}
        </div>

        {/* Mode */}
        <div style={{ padding: "18px 16px 0" }}>
          <div style={{ ...kicker, marginBottom: 8 }}>{t("savings.modeQuestion")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ModeCard
              selected={cMode === "disciplined"}
              onClick={() => setCMode("disciplined")}
              icon={Ico.lock({ size: 18 })}
              name={t("savings.discName")}
              desc={t("savings.discDesc")}
            />
            <ModeCard
              selected={cMode === "flexible"}
              onClick={() => setCMode("flexible")}
              icon={Ico.refresh({ size: 18 })}
              name={t("savings.flexName")}
              desc={t("savings.flexDesc")}
            />
          </div>
        </div>

        {/* Mode-specific reassurance */}
        <div style={{ padding: "12px 16px 0" }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: cMode === "disciplined" ? T.warnTint : T.actionTint,
              color: cMode === "disciplined" ? T.warn : T.action,
              fontSize: 12,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              lineHeight: 1.45,
            }}
          >
            {cMode === "disciplined"
              ? Ico.lock({ size: 16, c: T.warn })
              : Ico.shield({ size: 16, c: T.action })}
            <div>
              {cMode === "disciplined"
                ? t("savings.lockWarn")
                : t("savings.flexReassure")}
            </div>
          </div>
        </div>

        {toast}

        <div style={{ padding: "16px 16px 0" }}>
          <Btn
            kind="primary"
            disabled={pending || cTargetNum <= 0 || !cName.trim()}
            loading={pending}
            onClick={create}
          >
            {t("savings.openGoal")}
          </Btn>
        </div>
      </div>
    );
  }

  // ── MATURED — a single-goal vault hit its target → celebrate + release.
  // A multi-goal vault stays on the in-progress screen (its plan total can
  // exceed the on-chain contract target); withdraw is still offered there.
  if (st.reached && goals.length < 2) {
    return (
      <div style={shell}>
        <AppBar
          leading={<IconButton onClick={goBack}>{Ico.back({})}</IconButton>}
          title=""
        />
        <div style={{ padding: "32px 28px 0", textAlign: "center" }}>
          <div className="sl-tick" style={{ width: 88, height: 88, margin: "0 auto", borderRadius: 99, background: T.moneyIn, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 18px 40px -8px rgba(5,150,105,0.5)" }}>
            {Ico.check({ size: 44, c: "#fff" })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <SalapiMascot size={52} c={T.moneyIn} pose="cheer" />
          </div>
          <div style={{ marginTop: 22, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: T.moneyIn }}>
            {t("savings.goalReached")}
          </div>
          <div className="sl-rise" style={{ marginTop: 12 }}>
            <Money value={st.savedPesos} size={46} />
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: T.slate }}>{t("savings.maturedNote")}</div>
        </div>
        {toast}
        <div style={{ padding: "30px 16px 0" }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0 12px" }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {Ico.star({ size: 14, c: T.action })}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t("savings.releaseTitle")}</div>
            </div>
            <Btn
              kind="primary"
              disabled={pending}
              loading={pending}
              leading={!pending && Ico.arrowUp({ c: "#fff" })}
              onClick={withdraw}
            >
              {t("savings.releaseCta")}
            </Btn>
          </Card>
        </div>
      </div>
    );
  }

  // ── IN PROGRESS — multi-goal vault ──
  const totalTarget = goals.reduce((a, g) => a + g.target, 0);
  const totalPct =
    totalTarget > 0 ? Math.min(100, (st.savedPesos / totalTarget) * 100) : 0;
  const multi = goals.length >= 2;
  const splitMode = !multi || depTab === "split";
  const activeDepGoal = goals.find((g) => g.id === depGoal) ?? goals[0];
  const depDisplay = Number(depAmt) || 0;
  const depPhp = pesoFromLocal(depDisplay, currency);
  const parts = depPhp > 0 ? allocate(depPhp, goals) : [];

  return (
    <div style={shell}>
      <AppBar
        leading={<IconButton onClick={goBack}>{Ico.back({})}</IconButton>}
        title={t("savings.title")}
      />

      {/* Vault summary */}
      <div style={{ padding: "4px 16px 0" }}>
        <p style={{ padding: 14, borderRadius: 14, background: T.warnTint, color: T.warn, fontSize: 12, lineHeight: 1.5 }}>{m("Experimental Testnet savings. Goals below are local envelopes of one contract vault, not separate locks. No yield or fiat withdrawal is available.")}</p>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Ring pct={totalPct} label={t("savings.savedLabel")} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Chip kind={st.mode === "flexible" ? "action" : "warn"} size="sm">
                  {st.mode === "flexible" ? t("savings.flexChip") : t("savings.discChip")}
                </Chip>
              </div>
              <div style={kicker}>{t("savings.savedSoFar")}</div>
              <div style={{ marginTop: 2 }}>
                <Money value={st.savedPesos} size={24} usdc={false} />
              </div>
              <div style={{ marginTop: 2, fontSize: 12, color: T.slate }}>
                {t("savings.ofTargetShort", {
                  target: formatLocal(totalTarget, currency),
                })}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid " + T.hairline,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: T.slate,
              display: "flex",
              gap: 8,
            }}
          >
            {Ico.shield({ size: 14, c: T.slate })}
            <span>{t("savings.onchainVaultNote")}</span>
          </div>
        </Card>
      </div>

      {/* Goals */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={kicker}>{t("savings.goalsHeading")}</div>
          {multi && (
            <span style={{ fontSize: 11, color: T.slate }}>
              {t("savings.allocatorTitle")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {goals.map((g) => {
            const gp =
              g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
            const pctShare = Math.round(share(g, goals) * 100);
            return (
              <Card key={g.id} p={12}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {goalLabel(g)}
                  </div>
                  {multi && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => bumpWeight(g.id, -10)}
                        style={stepBtn}
                      >
                        −
                      </button>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: T.action, minWidth: 64, textAlign: "center" }}>
                        {t("savings.allocationPct", { pct: pctShare })}
                      </span>
                      <button
                        type="button"
                        onClick={() => bumpWeight(g.id, 10)}
                        style={stepBtn}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8 }}>
                  <Progress pct={gp} color={T.moneyIn} />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: T.slate }}>
                  <span style={{ color: T.ink, fontWeight: 600 }}>
                    {formatLocal(g.saved, currency)}
                  </span>{" "}
                  {t("savings.ofTargetShort", {
                    target: formatLocal(g.target, currency),
                  })}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Add a goal */}
        {adding ? (
          <Card p={12} style={{ marginTop: 8 }}>
            <div style={{ ...kicker, marginBottom: 6 }}>{t("savings.newGoal")}</div>
            <input
              value={aName}
              onChange={(e) => setAName(e.target.value.slice(0, 40))}
              placeholder={t("savings.goalNamePh")}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                boxShadow: "inset 0 0 0 1px " + T.hairline,
                background: T.canvas,
                fontSize: 14,
                fontFamily: T.fontSans,
                color: T.ink,
                outline: "none",
              }}
            />
            <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 16, color: T.slate, fontWeight: 500 }}>
                {CURRENCY[currency].symbol}
              </span>
              <input
                value={aTarget}
                onChange={(e) => setATarget(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder={t("savings.targetAmount")}
                className="sl-balance"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 20, fontWeight: 600, color: T.ink }}
              />
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <Btn kind="primary" size="md" disabled={!aName.trim() || !aTarget} onClick={addGoal}>
                {t("savings.add")}
              </Btn>
              <Btn
                kind="secondary"
                size="md"
                onClick={() => {
                  setAdding(false);
                  setAName("");
                  setATarget("");
                }}
              >
                {t("savings.cancel")}
              </Btn>
            </div>
          </Card>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "11px 14px",
              borderRadius: 12,
              border: "1px dashed " + T.hairline,
              background: "transparent",
              color: T.action,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: T.fontSans,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {Ico.plus({ size: 16, c: T.action })}
            {t("savings.addGoalCta")}
          </button>
        )}
      </div>

      {/* Deposit */}
      <div style={{ padding: "16px 16px 0" }}>
        <Card p={14}>
          {multi && (
            <>
              <div style={{ fontSize: 12, color: T.slate, lineHeight: 1.45, marginBottom: 10 }}>
                {t("savings.allocatorDesc")}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {(["split", "one"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDepTab(tab)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 9,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12.5,
                      fontWeight: 600,
                      fontFamily: T.fontSans,
                      background: depTab === tab ? T.action : T.canvas,
                      color: depTab === tab ? "#fff" : T.slate,
                    }}
                  >
                    {tab === "split" ? t("savings.splitTab") : t("savings.oneGoalTab")}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* One-goal picker */}
          {multi && depTab === "one" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...kicker, marginBottom: 6 }}>{t("savings.pickGoalLabel")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {goals.map((g) => (
                  <span key={g.id} onClick={() => setDepGoal(g.id)} style={{ cursor: "pointer" }}>
                    <Chip kind={activeDepGoal.id === g.id ? "action" : "neutral"} size="md">
                      {goalLabel(g)}
                    </Chip>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Amount */}
          <div style={{ ...kicker }}>{t("savings.addToGoal")}</div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 20, color: T.slate, fontWeight: 500 }}>
              {CURRENCY[currency].symbol}
            </span>
            <input
              value={depAmt}
              onChange={(e) => setDepAmt(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              className="sl-balance"
              style={{ width: Math.max(3, depAmt.length || 1) + "ch", border: "none", outline: "none", background: "transparent", fontSize: 26, fontWeight: 600, color: T.ink }}
            />
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ADDS[currency].map((a) => (
              <span key={a} onClick={() => setDepAmt(a)} style={{ cursor: "pointer" }}>
                <Chip kind={a === depAmt ? "action" : "neutral"} size="md">
                  {formatLocalAmount(Number(a), currency)}
                </Chip>
              </span>
            ))}
          </div>

          {/* Split preview */}
          {multi && splitMode && parts.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: T.canvas }}>
              {goals.map((g) => {
                const part = parts.find((p) => p.id === g.id);
                return (
                  <div
                    key={g.id}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: T.slate }}
                  >
                    <span>{goalLabel(g)}</span>
                    <span style={{ color: T.ink, fontWeight: 600 }}>
                      {formatLocal(part ? part.amount : 0, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {toast}

      {/* Deposit CTA */}
      <div style={{ padding: "14px 16px 0" }}>
        <Btn
          kind="primary"
          disabled={pending || depPhp <= 0}
          loading={pending}
          leading={!pending && Ico.plus({ c: "#fff" })}
          onClick={deposit}
        >
          {multi && splitMode
            ? t("savings.depositSplitCta", {
                amount: formatLocalAmount(depDisplay, currency),
              })
            : t("savings.addCta", {
                amount: formatLocalAmount(depDisplay, currency),
              })}
        </Btn>
      </div>

      {/* Withdraw — a flexible vault, or any vault past its target, can
          release now; a disciplined vault still below target cannot. */}
      <div style={{ padding: "10px 16px 0" }}>
        {st.mode === "flexible" || st.reached ? (
          <Btn
            kind="secondary"
            disabled={pending}
            loading={pending}
            leading={!pending && Ico.arrowUp({ c: T.ink })}
            onClick={withdraw}
          >
            {t("savings.withdrawNow")}
          </Btn>
        ) : (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: T.warnTint,
              color: T.warn,
              fontSize: 12,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              lineHeight: 1.45,
            }}
          >
            {Ico.lock({ size: 15, c: T.warn })}
            <div>
              {t("savings.discLockedNote", {
                target: formatLocal(st.targetPesos, currency),
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "16px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}

const stepBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 99,
  border: "none",
  background: T.canvas,
  color: T.ink,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
};
