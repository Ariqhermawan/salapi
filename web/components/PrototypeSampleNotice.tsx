import { isLocalPreview } from "@/lib/local-preview";
import styles from "./PrototypeSampleNotice.module.css";

type Kind = "arisan-list" | "arisan-room" | "arisan-draw" | "arisan-empty";

const copy: Record<Kind, string> = {
  "arisan-list": "Example rooms, member names, balances and invite codes. Create or join a room to use the Testnet flow.",
  "arisan-room": "Example room details only. Member activity and deposits are not live Testnet data.",
  "arisan-draw": "Example draw state. Signatures and draw controls only demonstrate the flow; they do not write to a contract or move Testnet funds.",
  "arisan-empty": "Example empty state. Create or join a room to use the Testnet flow.",
};

export default function PrototypeSampleNotice({ kind }: { kind: Kind }) {
  if (isLocalPreview) return null;
  return <aside className={styles.notice} aria-label="Example data notice">
    <strong>Example data.</strong> {copy[kind]}
  </aside>;
}
