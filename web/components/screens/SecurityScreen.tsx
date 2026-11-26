"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBar, Card, IconButton, Ico, T } from "@/components/ui/kit";
import styles from "./SecurityScreen.module.css";

const HIDE_BALANCE_KEY = "salapi.security.hide-home-balance.v1";

export default function SecurityScreen() {
  const router = useRouter();
  const [hideBalance, setHideBalance] = useState(false);
  useEffect(() => {
    try { setHideBalance(localStorage.getItem(HIDE_BALANCE_KEY) === "1"); }
    catch { setHideBalance(false); }
  }, []);
  function toggleHideBalance() {
    setHideBalance(current => {
      const next = !current;
      try { localStorage.setItem(HIDE_BALANCE_KEY, next ? "1" : "0"); }
      catch { /* Keep the control usable in private browsing for this visit. */ }
      return next;
    });
  }

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back to You" onClick={() => router.push("/you")}>{Ico.back({})}</IconButton>} title="Security" />
    <section className={styles.rows} aria-label="Security settings">
      <Card p={0}>
        <div className={styles.row}>
          <span className={styles.icon}>{Ico.lock({ size: 20, c: T.action })}</span>
          <span className={styles.copy}><strong>Face ID</strong><small>Biometric sign-in is not supported by this web wallet.</small></span>
          <span className={styles.unavailable}>Unavailable</span>
        </div>
        <div className={styles.row}>
          <span className={styles.icon}>{Ico.shield({ size: 20, c: T.action })}</span>
          <span className={styles.copy}><strong>Passcode</strong><small>A separate app passcode is not configured.</small></span>
          <span className={styles.unavailable}>Unavailable</span>
        </div>
        <div className={styles.row}>
          <span className={styles.icon}>{Ico.user({ size: 20, c: T.action })}</span>
          <span className={styles.copy}><strong>Hide balance on Home</strong><small>Mask your balance while viewing the Home screen.</small></span>
          <button type="button" role="switch" aria-checked={hideBalance} aria-label="Hide balance on Home" className={`${styles.switch} ${hideBalance ? styles.switchOn : ""}`} onClick={toggleHideBalance}><span /></button>
        </div>
      </Card>
    </section>
    <p className={styles.note}>Your wallet is service-managed. Hiding the Home balance is a display preference and does not change wallet access or transaction security.</p>
  </div>;
}
