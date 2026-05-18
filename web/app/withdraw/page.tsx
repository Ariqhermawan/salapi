"use client";

import { useState, useTransition } from "react";
import { withdrawSandbox } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { Button, Card, Input, Label, Toast } from "@/components/ui";

export default function Withdraw() {
  const { t } = useT();
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">Withdraw to GCash</h1>
      <p className="s-sub mt-1 mb-5">
        Salapi → GCash. {t("common.testnet")} sandbox.
      </p>
      <Card>
        <Label>{t("common.amountPeso")}</Label>
        <Input
          className="mt-2"
          inputMode="decimal"
          placeholder="₱ 500"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
        />
        <Button
          className="mt-4"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await withdrawSandbox(Number(amt));
              setNote(r.note);
            })
          }
        >
          {pending ? t("common.processing") : "Withdraw to GCash"}
        </Button>
      </Card>
      {note && (
        <div className="mt-3">
          <Toast tone="success">{note}</Toast>
        </div>
      )}
    </div>
  );
}
