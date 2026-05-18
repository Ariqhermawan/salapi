"use client";

import { useEffect, useState, useTransition } from "react";
import { walletState, topUpSandbox } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { Button, Card, Input, Label } from "@/components/ui";
import { SuccessCheck } from "@/components/ui/motion";

export default function TopUp() {
  const { t } = useT();
  const [bal, setBal] = useState("…");
  const [amt, setAmt] = useState("");
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  async function refresh() {
    setBal((await walletState()).pesoLabel);
  }
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">{t("wallet.topup")}</h1>
      <p className="s-sub mt-1 mb-5">
        GCash → Salapi. {t("common.testnet")} sandbox.
      </p>

      {done ? (
        <Card className="flex flex-col items-center gap-3 text-center">
          <SuccessCheck />
          <div className="font-semibold text-[var(--color-ink)]">{bal}</div>
          <p className="text-xs text-[var(--color-slate)]">{note}</p>
        </Card>
      ) : (
        <Card>
          <Label>{t("common.amountPeso")}</Label>
          <Input
            className="mt-2"
            inputMode="decimal"
            placeholder="₱ 1,000"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
          />
          <Button
            className="mt-4"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await topUpSandbox();
                setNote(r.note);
                await refresh();
                setDone(true);
              })
            }
          >
            {pending ? t("common.processing") : t("wallet.topup")}
          </Button>
        </Card>
      )}
    </div>
  );
}
