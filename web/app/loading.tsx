/** Route-only fallback. No account, balance or ledger data is cached here. */
export default function Loading() {
  return <div role="status" aria-live="polite" aria-label="Loading screen" data-testid="route-loading" style={{ padding: 24 }}>
    <span style={{ color: "#60718F", fontSize: 14 }}>Loading...</span>
    <div aria-hidden="true" style={{ display: "grid", gap: 16, marginTop: 20 }}>
      <div className="sl-skel" style={{ height: 32, width: "65%", borderRadius: 8 }} />
      <div className="sl-skel" style={{ height: 144, borderRadius: 24 }} />
      <div className="sl-skel" style={{ height: 96, borderRadius: 24 }} />
    </div>
  </div>;
}
