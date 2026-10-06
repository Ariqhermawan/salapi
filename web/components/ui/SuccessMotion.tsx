import type { ReactNode } from "react";
import styles from "./SuccessMotion.module.css";

/** Render only after the caller has confirmed its own successful operation. */
export default function SuccessMotion({ title, children, variant = "default" }: { title: string; children?: ReactNode; variant?: "default" | "transfer" }) {
  return <div className={`${styles.notice} ${variant === "transfer" ? styles.transfer : ""}`} role="status">
    <span className={styles.markWrap} aria-hidden="true">
    {variant === "transfer" ? <span className={styles.ripple} /> : null}
    <svg className={styles.mark} viewBox="0 0 48 48">
      <circle className={styles.halo} cx="24" cy="24" r="22" />
      <circle className={styles.ring} cx="24" cy="24" r="17" />
      <path className={styles.check} d="m16 24 5 5 11-11" />
    </svg>
    </span>
    <div><strong>{title}</strong>{children ? <div className={styles.body}>{children}</div> : null}</div>
  </div>;
}
