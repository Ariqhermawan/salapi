import Link from "next/link";

const labels = { en: "Arisan notifications", id: "Notifikasi arisan", tl: "Mga notification sa arisan", vi: "Thông báo arisan" } as const;

/** Icon-only, named link keeps room titles usable on narrow screens. */
export default function ArisanInboxLink({ locale }: { locale: keyof typeof labels }) {
  return <Link href="/notifications" aria-label={labels[locale]} title={labels[locale]} style={{ width: 44, height: 44, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 14, color: "#4465e8", border: "1px solid #d6dff2", background: "#fff" }}>
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
  </Link>;
}
