"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  smartSavingsState,
  smartSavingsOpen,
  smartSavingsDeposit,
  smartSavingsWithdraw,
} from "@/app/actions";
import { useT } from "@/components/I18nProvider";
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

export default function SavingsScreen() {
  const { t, currency } = useT();
  const router = useRouter();
  const [st, setSt] = useState<State | null>(null);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [pending, start] = useTransition();
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
    const s = await smartSavingsState();
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
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill the create target in the active display currency.
  useEffect(() => {
    if (!cTouched.current) setCTarget(TARGETS[currency][2]);
  }, [currency]);

  function create() {
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
    start(async () => {
      setMsg(null);
      const r = await smartSavingsOpen(targetPhp, cMode);
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
    const display = Number(depAmt) || 0;
    const amtPhp = pesoFromLocal(display, currency);
    if (!(amtPhp > 0)) {
      setMsg({ tone: "err", text: t("savings.somethingWrong") });
      return;
    }
    const splitMode = goals.length < 2 || depTab === "split";
    const single = goals.find((g) => g.id === depGoal) ?? goals[0];
    start(async () => {
      setMsg(null);
      const r = await smartSavingsDeposit(amtPhp);
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
    start(async () => {
      setMsg(null);
      const r = await smartSavingsWithdraw();
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
    saveGoals(g);
    setGoals(g);
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
  };

  const Toast = () =>
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
            {msg.text}
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

  // ── LOADING ──
  if (st === null) {
    return (
      <div style={shell}>
        <AppBar
          leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
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
          leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
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
          leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
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

        <Toast />

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
          leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
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
        <Toast />
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
        leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
        title={t("savings.title")}
      />

      {/* Vault summary */}
      <div style={{ padding: "4px 16px 0" }}>
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

      <Toast />

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
