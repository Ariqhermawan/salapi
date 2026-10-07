"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/ui/useGoBack";
import { arisanList } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatLocal } from "@/lib/ui/currency";
import Link from "next/link";
import Image from "next/image";
import { isLocalPreview } from "@/lib/local-preview";
import styles from "./CampaignArisan.module.css";
import { readPreviewArisanRoom } from "./arisan-preview";

type State = Awaited<ReturnType<typeof arisanList>>;
const previewRooms: Extract<State, { ready: true }> = { ready: true, total: 2, nextCursor: null, mine: [
  { id: 1, name: "Family arisan", status: "Open", memberCount: 5, memberTarget: 5, sharePeso: "250", potPeso: "1,250", sharePesos: 250, potPesos: 1250, cadence: "Weekly", firstKocok: 1791408000, round: 0, isMember: true, isHost: true, code: "FAM234" },
  { id: 2, name: "Weekend community circle", status: "Active", memberCount: 4, memberTarget: 4, sharePeso: "180", potPeso: "720", sharePesos: 180, potPesos: 720, cadence: "Biweekly", firstKocok: 1791321600, round: 2, isMember: true, isHost: false, code: "CIR234" },
] };

const STATUS_TONE = {
  Open: "action" as const,
  Active: "success" as const,
  Done: "neutral" as const,
  Dissolved: "warn" as const,
};

export default function ArisanListScreen() {
  const { t, currency } = useT();
  const router = useRouter();
  const goBack = useGoBack("/vaults");
  const [st, setSt] = useState<State | null>(null);
  const [filter, setFilter] = useState("All");
  const [loadError, setLoadError] = useState("");
  const [loading, startLoad] = useTransition();
  const loadingRef = useRef(false);

  function loadPage(cursor?: number) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    startLoad(async () => {
      try {
        setLoadError("");
        if (isLocalPreview) {
          let mine = previewRooms.mine.map(room => ({ ...room }));
          try {
            const draft = JSON.parse(sessionStorage.getItem("salapi.preview.arisan-draft") || "null");
            const sharePesos = draft?.sharePesos ?? draft?.share;
            if (draft?.id === 9001 && typeof draft.name === "string" && Number.isFinite(sharePesos)) mine.unshift({ ...previewRooms.mine[0], id: 9001, name: draft.name, memberTarget: draft.members, memberCount: 1, sharePeso: String(sharePesos), potPeso: String(sharePesos*draft.members), sharePesos, potPesos: sharePesos*draft.members, cadence: draft.cadence, code: "NEW234" });
            if (sessionStorage.getItem("salapi.preview.arisan-joined")) mine.forEach(room => { if (room.id === 1) room.isHost = false; });
            if (sessionStorage.getItem("salapi.preview.arisan-left") === "1") mine = mine.filter(room => room.id !== 1);
            mine.forEach(room => { if (sessionStorage.getItem(`salapi.preview.arisan-cancelled.${room.id}`) === "1") room.status = "Dissolved"; });
            mine = mine.flatMap(room => {
              const saved = readPreviewArisanRoom(room.id);
              if (!saved) return [room];
              if (!saved.isMember) return [];
              return [{ ...room, name: saved.name, status: saved.status, memberCount: saved.memberCount, memberTarget: saved.memberTarget, sharePeso: saved.sharePeso, potPeso: saved.potPeso, sharePesos: saved.sharePesos, potPesos: saved.potPesos, cadence: saved.cadence, firstKocok: saved.firstKocok, round: saved.round, isMember: saved.isMember, isHost: saved.isHost, code: saved.code ?? room.code }];
            });
          } catch { /* Local preview can start fresh if a previous draft is unreadable. */ }
          setSt({ ...previewRooms, total: mine.length, mine }); return;
        }
        const page = await arisanList(cursor);
        if (!page.ready) {
          setLoadError(page.error ?? "Rooms could not load. Please retry.");
          setSt(previous => previous?.ready ? previous : page);
          return;
        }
        setSt(previous => {
          if (cursor === undefined || !previous?.ready) return page;
          const byId = new Map(previous.mine.map(room => [room.id, room]));
          for (const room of page.mine) byId.set(room.id, room);
          return { ...page, mine: [...byId.values()].sort((a, b) => b.id - a.id) };
        });
      } catch {
        const error = "Rooms could not load. Your loaded rooms are unchanged. Please retry.";
        setLoadError(error);
        setSt(previous => previous?.ready ? previous : { ready: false, error });
      } finally { loadingRef.current = false; }
    });
  }
  function refresh() { loadPage(); }
  function loadOlder() { if (st?.ready && st.nextCursor !== null) loadPage(st.nextCursor); }
  useEffect(() => {
    refresh();
    // Only the initial load runs on mount; later pages are explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 130,
  };

  return (
    <div style={shell}>
      <AppBar
        leading={
          <IconButton ariaLabel="Back to vaults" onClick={goBack}>
            {Ico.back({})}
          </IconButton>
        }
        title={t("arisan.title")}
      />

      {(isLocalPreview || process.env.NEXT_PUBLIC_ARISAN_INSTALLMENTS === "1") && <div className={styles.body}><Link href="/arisan/funding" className={styles.roomLink}><span className={styles.eyebrow}>Separate installment candidate · Testnet</span><h2>Join first. Pay in steps.</h2><p className={styles.muted}>No deposit at join. Fund in smaller amounts before the deadline. Start only after every member is fully funded. Existing rooms below keep their original terms.</p></Link></div>}

      <div className={styles.body} style={{ paddingTop: 20, paddingBottom: 20, gap: 12 }}>
        <header className={`${styles.hero} ${styles.compactHero}`}><div><span className={styles.eyebrow}>Arisan / Paluwagan · Testnet</span><h1>Save together.</h1><p>Each member deposits N × their share upfront. One payout per member across the circle.</p></div><Image className={styles.doodle} width={95} height={95} src="/illustrations/arisan.png" alt="Friends contributing to a shared money pool" /></header>
        <p className={styles.muted}>{isLocalPreview ? "Example data · Local preview · No transactions" : "Valueless Testnet XLM. Display amounts are illustrative."}</p>
      </div>

      {/* Action rail */}
      <div style={{ padding: "0 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Btn
          kind="primary"
          onClick={() => router.push("/arisan/new")}
          leading={Ico.plus({ size: 16, c: "#fff" })}
        >
          {t("arisan.createCta")}
        </Btn>
        <Btn
          kind="secondary"
          onClick={() => router.push("/arisan/join")}
          leading={Ico.qr({ size: 16, c: T.ink })}
        >
          {t("arisan.joinCta")}
        </Btn>
      </div>

      {/* My rooms */}
      <div style={{ padding: "24px 20px 0" }}>
        <div className={styles.toolbar}><h2 style={{ fontSize: 20, fontWeight: 750, letterSpacing: "-.035em" }}>{t("arisan.myRooms")}</h2><button className={styles.textButton} onClick={refresh} disabled={loading}>Refresh</button></div>
        <nav className={styles.filters} aria-label="Filter rooms">{["All", "Open", "Active", "Done"].map(label => <button key={label} className={`${styles.filter} ${filter === label ? styles.filterActive : ""}`} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</nav>

        {st === null && (
          <div className={styles.skeleton} aria-label={t("common.loading")} style={{ marginTop: 15 }} />
        )}

        {st && st.ready && st.mine.length === 0 && (
          <Card p={24} style={{ background: "#F2EFE7", marginTop: 15 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t("arisan.noneTitle")}</div>
            <div style={{ marginTop: 4, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
              {st.nextCursor !== null ? "No memberships were found in the rooms checked so far. Older rooms are still available below." : t("arisan.noneBody")}
            </div>
          </Card>
        )}

        {st && !st.ready && (
          <Card p={18} style={{ marginTop: 15 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t("arisan.notConfiguredTitle")}</div>
            <div style={{ marginTop: 4, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
              {t("arisan.notConfiguredBody")}
            </div>
            <button className={styles.textButton} onClick={refresh} disabled={loading}>Try again</button>
          </Card>
        )}

        {st && st.ready && st.mine.length > 0 && (
          <div className={styles.roomList} style={{ marginTop: 15 }}>
            {st.mine.filter(r => filter === "All" || r.status === filter).map((r) => (
              <Link key={r.id} className={styles.roomLink} href={`/arisan/${r.id}`}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <h2>
                      {r.name}
                    </h2>
                    <div style={{ marginTop: 4, fontSize: 12, color: T.slate, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span>{r.memberCount}/{r.memberTarget} {t("arisan.members")}</span>
                      <span>·</span>
                      <span>{t("arisan.cadence." + r.cadence)}</span>
                      {r.isHost && (
                        <>
                          <span>·</span>
                          <span style={{ color: T.action, fontWeight: 600 }}>{t("arisan.youHost")}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <Chip kind={STATUS_TONE[r.status]}>
                      {t("arisan.status." + r.status)}
                    </Chip>
                  </div>
                </div>
                <div className={styles.progress}><span style={{ width: `${Math.min(100,r.memberCount/r.memberTarget*100)}%` }} /></div>
                <div className={styles.roomFooter}><span>Per draw <strong>{formatLocal(r.potPesos, currency)}</strong></span><span style={{ color: T.action }}>View room →</span></div>
              </Link>
            ))}
            {!st.mine.some(r => filter === "All" || r.status === filter) && <div className={styles.empty}><h2>No {filter.toLowerCase()} rooms</h2><p className={styles.muted}>Choose another status to see your rooms.</p></div>}
          </div>
        )}
        {loadError ? <p className={styles.error} role="alert">{loadError}</p> : null}
        {st?.ready && st.nextCursor !== null ? <div style={{ marginTop: 16 }}>
          <Btn kind="secondary" disabled={loading} loading={loading} onClick={loadOlder}>Load older rooms</Btn>
          <p className={styles.muted} role="status" style={{ marginTop: 8 }}>Each request checks up to 50 older rooms. Only your memberships are listed.</p>
        </div> : null}
      </div>

      <div style={{ padding: "30px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
