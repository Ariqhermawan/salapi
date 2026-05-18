"use client";

import SendForm from "@/components/SendForm";
import { useT } from "@/components/I18nProvider";

export default function SendPage() {
  const { t } = useT();
  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">{t("send.title")}</h1>
      <p className="s-sub mt-1 mb-5">{t("send.sub")}</p>
      <SendForm />
    </div>
  );
}
