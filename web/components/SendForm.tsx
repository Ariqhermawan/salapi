"use client";

import { useEffect, useState, useTransition } from "react";
import { registerUsername, myHandle, sendByUsername } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { Button, Card, Input, Label, Toast } from "@/components/ui";

export default function SendForm() {
  const { t, currency } = useT();
  const [mine, setMine] = useState<string | null>(null);
  const [claim, setClaim] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>("");
  const [pending, start] = useTransition();

  useEffect(() => {
    myHandle().then(setMine);
  }, []);

  const ok = (text: string, link: string) => (
    <Toast tone="success">
      ✓ {text} ·{" "}
      <a className="s-link" href={link} target="_blank" rel="noopener noreferrer">
        {t("common.viewOnChain")}
      </a>
    </Toast>
  );
  const err = (e: string) => <Toast tone="error">{e}</Toast>;

  function doClaim() {
    start(async () => {
      const r = await registerUsername(claim);
      if (r.ok) {
        setMine(r.name);
        setMsg(ok(t("send.claimedOk", { name: r.name }), r.link));
      } else setMsg(err(r.error));
    });
  }
  function doSend() {
    start(async () => {
      const r = await sendByUsername(to, { amount, currency });
      if (r.ok)
        setMsg(ok(t("send.sentOk", { amt: amount, to }), r.link));
      else setMsg(err(r.error));
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <Label>{t("send.yourUsername")}</Label>
        {mine ? (
          <p className="mt-2 text-[15px] text-[var(--color-ink)]">
            {t("send.youAre")}{" "}
            <span className="font-bold text-[var(--color-action-deep)]">
              @{mine}
            </span>
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <Input
              className="flex-1"
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder={t("send.choose")}
            />
            <Button className="!w-auto px-5" disabled={pending} onClick={doClaim}>
              {t("send.claim")}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <Label>{t("send.sendMoney")}</Label>
        <div className="mt-3 space-y-2.5">
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t("send.toUsername")}
          />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={t("common.amountPeso")}
          />
          <Button disabled={pending} onClick={doSend}>
            {pending ? t("send.sending") : t("send.send")}
          </Button>
        </div>
      </Card>

      {msg && <div>{msg}</div>}
    </div>
  );
}
