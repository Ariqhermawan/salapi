import type { ReactNode } from "react";
import styles from "./SuccessMotion.module.css";

/** Render only after the caller has confirmed its own successful operation. */
export default function SuccessMotion({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.notice} role="status">
    <svg className={styles.mark} viewBox="0 0 48 48" aria-hidden="true">
      <circle className={styles.halo} cx="24" cy="24" r="22" />
      <circle className={styles.ring} cx="24" cy="24" r="17" />
      <path className={styles.check} d="m16 24 5 5 11-11" />
    </svg>
    <div><strong>{title}</strong>{children ? <div className={styles.body}>{children}</div> : null}</div>
  </div>;
}
