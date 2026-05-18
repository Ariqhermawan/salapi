"use client";

import { useEffect, useState, useTransition } from "react";
import {
  smartSavingsState,
  smartSavingsOpen,
  smartSavingsDeposit,
  smartSavingsWithdraw,
} from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { Button, Card, Input, Label, Progress, Toast } from "@/components/ui";
import { Confetti } from "@/components/ui/motion";

type State = Awaited<ReturnType<typeof smartSavingsState>>;

export default function SmartSavings() {
  const { t } = useT();
  const [st, setSt] = useState<State | null>(null);
  const [target, setTarget] = useState("");
  const [dep, setDep] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>("");
  const [party, setParty] = useState(false);
  const [pending, start] = useTransition();

  async function refresh() {
    setSt(await smartSavingsState());
  }
  useEffect(() => {
    refresh();
  }, []);

  function run(
    fn: () => Promise<{ ok: boolean; link?: string; error?: string }>,
    okText: string,
    celebrate = false
  ) {
    start(async () => {
      setMsg("");
      const r = await fn();
      if (r.ok) {
        setMsg(
          <Toast tone="success">
            ✓ {okText}
            {r.link && (
              <>
                {" · "}
                <a
                  className="s-link"
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("common.viewOnChain")}
                </a>
              </>
            )}
          </Toast>
        );
        if (celebrate) {
          setParty(true);
          setTimeout(() => setParty(false), 1800);
        }
      } else setMsg(<Toast tone="error">{r.error}</Toast>);
      setDep("");
      setTarget("");
      await refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Confetti fire={party} />
      <div
        className="rounded-2xl p-5 text-white"
        style={{
          background:
            "linear-gradient(150deg,#1d4ed8 0%,#1e3a8a 60%,#0b1220 100%)",
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-200">
          {t("sav.kicker")}
        </div>
        <h2 className="mt-1 text-xl font-extrabold leading-snug">
          {t("sav.title")}
        </h2>
        <p className="mt-1.5 text-sm text-blue-100">{t("sav.sub")}</p>
      </div>

      {st === null ? (
        <p className="s-muted">{t("common.loading")}</p>
      ) : !st.ready ? (
        <Card>
          <p className="text-sm">{t("common.notReady")}</p>
        </Card>
      ) : !st.hasGoal ? (
        <Card>
          <Label>{t("sav.startTitle")}</Label>
          <p className="s-muted mt-1">{t("sav.startHint")}</p>
          <div className="mt-3 flex gap-2">
            <Input
              className="flex-1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
              placeholder={t("sav.targetPh")}
            />
            <Button
              className="!w-auto px-5"
              disabled={pending}
              onClick={() =>
                run(
                  () => smartSavingsOpen(Number(target)),
                  t("sav.startedOk")
                )
              }
            >
              {pending ? "…" : t("sav.start")}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-end justify-between">
              <div>
                <Label>{t("sav.yourSavings")}</Label>
                <div className="tabular mt-1 text-3xl font-extrabold text-[var(--color-ink)]">
                  {st.savedPeso}
                </div>
              </div>
              <div className="text-right">
                <div className="s-muted">{t("sav.target")}</div>
                <div className="font-semibold text-[var(--color-ink)]">
                  {st.targetPeso}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Progress pct={st.pct} />
            </div>
            <div className="s-muted mt-1.5">
              {t("sav.pct", { pct: st.pct })}{" "}
              {st.unlocked ? t("sav.ready") : t("sav.locked")}
            </div>
          </Card>

          <Card>
            <Label>{t("sav.depositTitle")}</Label>
            <div className="mt-3 flex gap-2">
              <Input
                className="flex-1"
                value={dep}
                onChange={(e) => setDep(e.target.value)}
                inputMode="decimal"
                placeholder={t("sav.amountPh")}
              />
              <Button
                className="!w-auto px-5"
                disabled={pending}
                onClick={() =>
                  run(
                    () => smartSavingsDeposit(Number(dep)),
                    t("sav.depositedOk", { amt: dep })
                  )
                }
              >
                {pending ? "…" : t("sav.deposit")}
              </Button>
            </div>
          </Card>

          <Button
            disabled={pending || !st.unlocked}
            style={{
              background: st.unlocked
                ? "var(--color-money)"
                : "var(--color-hairline)",
              color: st.unlocked ? "#fff" : "var(--color-slate)",
            }}
            onClick={() =>
              run(smartSavingsWithdraw, t("sav.withdrewOk"), true)
            }
          >
            {st.unlocked
              ? t("sav.withdrawReady", { amt: st.savedPeso })
              : t("sav.withdrawLocked")}
          </Button>

          {msg && <div>{msg}</div>}
        </>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--color-slate)]">
        {t("sav.note")}
      </p>
    </div>
  );
}
