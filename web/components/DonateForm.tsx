"use client";

import { useEffect, useState, useTransition } from "react";
import { disasterContribute, disasterState } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { Badge, Button, Card, Input, Label, Toast } from "@/components/ui";

export default function DonateForm() {
  const { t } = useT();
  const [pool, setPool] = useState("…");
  const [active, setActive] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>("");
  const [pending, start] = useTransition();

  async function refresh() {
    const s = await disasterState();
    if (s.ok) {
      setPool(s.pesoLabel);
      setActive(s.active);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  function donate() {
    start(async () => {
      const r = await disasterContribute(Number(amount));
      if (r.ok) {
        setMsg(
          <Toast tone="success">
            ✓ {t("donate.donatedOk", { amt: amount })} ·{" "}
            <a
              className="s-link"
              href={r.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("common.viewOnChain")}
            </a>
          </Toast>
        );
        setAmount("");
        await refresh();
      } else setMsg(<Toast tone="error">{r.error}</Toast>);
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <Label>{t("donate.poolTitle")}</Label>
        <Badge tone={active ? "active" : "neutral"}>
          {active === null
            ? "…"
            : active
              ? t("donate.active")
              : t("donate.standby")}
        </Badge>
      </div>
      <div className="tabular mt-1.5 text-3xl font-extrabold text-[var(--color-ink)]">
        {pool}
      </div>
      <p className="s-muted mt-1">{t("donate.note")}</p>
      <div className="mt-4 flex gap-2">
        <Input
          className="flex-1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder={t("common.amountPeso")}
        />
        <Button className="!w-auto px-5" disabled={pending} onClick={donate}>
          {pending ? "…" : t("donate.donate")}
        </Button>
      </div>
      {msg && <div className="mt-3">{msg}</div>}
    </Card>
  );
}
