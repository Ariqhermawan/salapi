"use client";

import { useEffect, useState, useTransition } from "react";
import {
  paluwaganState,
  paluwaganPayMine,
  paluwaganFriendsPay,
  paluwaganCollect,
} from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { Avatar, Button, Card, Toast } from "@/components/ui";
import { Confetti } from "@/components/ui/motion";

type State = Awaited<ReturnType<typeof paluwaganState>>;

export default function PaluwaganCircle() {
  const { t } = useT();
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState<React.ReactNode>("");
  const [party, setParty] = useState(false);
  const [pending, start] = useTransition();

  async function refresh() {
    setSt(await paluwaganState());
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
          {t("pal.kicker")}
        </div>
        <h2 className="mt-1 text-xl font-extrabold leading-snug">
          {t("pal.title")}
        </h2>
        <p className="mt-1.5 text-sm text-blue-100">{t("pal.sub")}</p>
      </div>

      {st === null ? (
        <p className="s-muted">{t("common.loading")}</p>
      ) : !st.ready ? (
        <Card>
          <p className="text-sm">{t("common.notReady")}</p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="s-label">
                {t("pal.round", { n: st.round + 1 })}
              </h3>
              <span className="s-muted">
                {t("pal.meta", { share: st.sharePeso, pot: st.potPeso })}
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {st.seats.map((s) => (
                <li
                  key={s.addr}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-hairline)] px-3 py-2.5"
                >
                  <Avatar label={s.label} highlight={s.isRecipient} />
                  <span className="flex-1 text-sm font-medium text-[var(--color-ink)]">
                    {s.label}
                    {s.isRecipient && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-money)]">
                        {t("pal.turn")}
                      </span>
                    )}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color: s.paid
                        ? "var(--color-money)"
                        : "var(--color-slate)",
                    }}
                  >
                    {s.paid ? t("pal.paid") : t("pal.notPaid")}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="space-y-2.5">
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  paluwaganPayMine,
                  t("pal.payMine", { share: st.sharePeso })
                )
              }
            >
              {pending ? "…" : t("pal.payMine", { share: st.sharePeso })}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => run(paluwaganFriendsPay, t("pal.friendsPay"))}
            >
              {t("pal.friendsPay")}
            </Button>
            <Button
              disabled={pending || !st.allPaid}
              style={{
                background: st.allPaid
                  ? "var(--color-money)"
                  : "var(--color-hairline)",
                color: st.allPaid ? "#fff" : "var(--color-slate)",
              }}
              onClick={() =>
                run(
                  paluwaganCollect,
                  t("pal.collect", {
                    pot: st.potPeso,
                    who: st.recipientLabel,
                  }),
                  true
                )
              }
            >
              {st.allPaid
                ? t("pal.collect", {
                    pot: st.potPeso,
                    who: st.recipientLabel,
                  })
                : t("pal.collectWait")}
            </Button>
          </div>

          {msg && <div>{msg}</div>}
          <p className="text-[11px] leading-relaxed text-[var(--color-slate)]">
            {t("pal.demoNote")}
          </p>
        </>
      )}
    </div>
  );
}
