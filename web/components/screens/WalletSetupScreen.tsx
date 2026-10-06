"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { initializeWallet } from "@/app/wallet-setup-actions";
import { useT } from "@/components/I18nProvider";
import TransferMotion from "@/components/ui/TransferMotion";
import SuccessMotion from "@/components/ui/SuccessMotion";
import { authRedirectPath } from "@/lib/authRedirect";
import { safeAppFallback } from "@/lib/ui/app-navigation";
import { walletSetupCopy } from "@/lib/i18n/wallet-setup";
import { isLocalPreview } from "@/lib/local-preview";
import styles from "./WalletSetupScreen.module.css";

export default function WalletSetupScreen({ nextPath }: { nextPath: string }) {
  const { locale } = useT();
  const router = useRouter();
  const copy = (key: Parameters<typeof walletSetupCopy>[1]) => walletSetupCopy(locale, key);
  const destination = safeAppFallback(authRedirectPath(nextPath));
  const next = decodeURIComponent(destination.split(/[?#]/)[0]).replace(/\/+$/, "") === "/wallet/setup" ? "/" : destination;
  const inFlight = useRef(false);
  const [status, setStatus] = useState<"idle" | "waiting" | "failed" | "ready">("idle");
  const [address, setAddress] = useState("");

  async function retry() {
    if (inFlight.current || isLocalPreview) return;
    inFlight.current = true;
    setStatus("waiting");
    try {
      const result = await initializeWallet();
      if (!result.ok) { setStatus("failed"); return; }
      setAddress(result.address);
      setStatus("ready");
    } catch {
      setStatus("failed");
    } finally {
      inFlight.current = false;
    }
  }

  return <div className={styles.page}>
    <p className={styles.eyebrow}>STELLAR TESTNET</p>
    <h1>{copy("title")}</h1>
    <p>{copy("intro")}</p>
    <section className={styles.card} aria-busy={status === "waiting"}>
      {status === "waiting" ? <TransferMotion title={copy("waiting")} description={copy("checking")} />
        : status === "ready" ? <SuccessMotion title={copy("ready")}><p className={styles.address}>{address}</p></SuccessMotion>
        : <p role={status === "failed" ? "alert" : undefined}>{copy(isLocalPreview ? "preview" : "unavailable")}</p>}
      {status === "ready" ? <button type="button" className={styles.primary} onClick={() => router.replace(next)}>{copy("continue")}</button>
        : <button type="button" className={styles.primary} onClick={retry} disabled={isLocalPreview || status === "waiting"}>{copy("retry")}</button>}
      {status !== "waiting" && status !== "ready" ? <Link className={styles.signin} href={`/signin?next=${encodeURIComponent(next)}`}>{copy("signin")}</Link> : null}
    </section>
    <small>{copy("testnet")}</small>
  </div>;
}
