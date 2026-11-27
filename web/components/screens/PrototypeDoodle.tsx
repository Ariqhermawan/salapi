import styles from "./PrototypeDoodle.module.css";

export default function PrototypeDoodle({ kind = "coins", variant = "short" }: { kind?: "coins" | "vault"; variant?: "short" | "receive" }) {
  return <div className={styles.frame} data-variant={variant} aria-hidden="true">
    <img className={styles.light} src={`/prototype-ui/doodle-${kind}.png`} alt="" />
    <img className={styles.dark} src={`/prototype-ui/doodle-${kind}-dark.png`} alt="" />
  </div>;
}
