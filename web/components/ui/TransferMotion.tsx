import styles from "./TransferMotion.module.css";

/** A visual wait state, not a timer or a claim of network confirmation. */
export default function TransferMotion({ title, description }: { title: string; description: string }) {
  return <section className={styles.wait} role="status" aria-live="polite">
    <div className={styles.scene} aria-hidden="true">
      <span className={styles.orbit} />
      <span className={styles.orbitOuter} />
      <span className={styles.satellite} />
      <span className={styles.plane}>
        <svg viewBox="0 0 48 48" fill="none"><path d="m7 22 34-14-11 33-8-13-15-6Z" /><path d="m22 28 19-20" /></svg>
      </span>
      <span className={styles.spark} />
    </div>
    <strong>{title}</strong>
    <p>{description}</p>
    <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
  </section>;
}
