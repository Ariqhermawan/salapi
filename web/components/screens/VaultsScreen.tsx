"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { arisanList, disasterState, paluwaganState } from "@/app/actions";
import type { campaignState } from "@/app/campaign-actions";
import { vaultOverview } from "@/app/vault-read-actions";
import { useT } from "@/components/I18nProvider";
import { homeCopy } from "@/lib/i18n/revamp-home";
import { Ico, T, PoweredByStellar } from "@/components/ui/kit";
import { formatLocal } from "@/lib/ui/currency";
import { formatStroops } from "@/lib/format-stroops";
import type { Campaign } from "@/lib/campaign";
import type { Locale } from "@/lib/i18n/config";
import { vaultCampaignMedia } from "@/lib/vault-campaign-media";
import {
  PREVIEW_CAMPAIGNS,
  PREVIEW_TIME,
  PREVIEW_WALLET,
  normalizePreviewCampaigns,
} from "@/lib/local-preview";
import styles from "./VaultsRevamp.module.css";
import { readPreviewArisanRoom } from "./arisan-preview";

type Rooms = Awaited<ReturnType<typeof arisanList>>;
type Campaigns = Awaited<ReturnType<typeof campaignState>>;
type Pool = Awaited<ReturnType<typeof disasterState>>;
type LegacyCircle = Awaited<ReturnType<typeof paluwaganState>>;
type VaultTab = "arisan" | "crowdfund";
const VAULT_TAB_KEY = "salapi.vaults.tab.v1";
const PREVIEW = process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1";
const vaultContentCopy = {
  en: { tabs: "Vault categories", arisan: "Arisan", crowdfund: "Crowdfund", roomTitle: "Arisan rooms", campaignTitle: "Crowdfunding", roomSub: "Rooms linked to your active wallet. Demo wallets use shared data.", campaignSub: "Campaigns you organize, review or support. Testnet tokens only.", roomLoading: "Loading arisan rooms", campaignLoading: "Loading crowdfunding campaigns", roomError: "Your rooms could not be loaded.", campaignError: "Your campaigns could not be loaded.", refresh: "Refresh", retry: "Try again", create: "Create a room", join: "Join a room", explore: "Explore causes", start: "Start a campaign", emptyRoom: "Your next room starts here.", emptyRoomSub: "Create a room with people you know, or join with an invite.", emptyCampaign: "No campaigns linked to this wallet yet.", emptyCampaignSub: "Explore a cause or start a Testnet campaign.", more: "More ways to give", moreSub: "Campaign discovery and shared community pools" },
  tl: { tabs: "Mga kategorya ng vault", arisan: "Arisan", crowdfund: "Crowdfund", roomTitle: "Mga room ng Arisan", campaignTitle: "Crowdfunding", roomSub: "Mga room na naka-link sa aktibong wallet mo. Shared data ang gamit ng demo wallets.", campaignSub: "Mga kampanyang inorganisa, nire-review o sinusuportahan mo. Testnet tokens lamang.", roomLoading: "Nilo-load ang mga room ng Arisan", campaignLoading: "Nilo-load ang mga crowdfunding campaign", roomError: "Hindi ma-load ang mga room mo.", campaignError: "Hindi ma-load ang mga kampanya mo.", refresh: "I-refresh", retry: "Subukan muli", create: "Gumawa ng room", join: "Sumali sa room", explore: "Tuklasin ang mga layunin", start: "Magsimula ng kampanya", emptyRoom: "Dito magsisimula ang susunod mong room.", emptyRoomSub: "Gumawa ng room kasama ang mga kakilala mo, o sumali gamit ang imbitasyon.", emptyCampaign: "Wala pang kampanyang naka-link sa wallet na ito.", emptyCampaignSub: "Tuklasin ang isang layunin o magsimula ng Testnet campaign.", more: "Iba pang paraan ng pagbibigay", moreSub: "Mga kampanya at shared community pool" },
  id: { tabs: "Kategori vault", arisan: "Arisan", crowdfund: "Crowdfund", roomTitle: "Room Arisan", campaignTitle: "Crowdfunding", roomSub: "Room yang terhubung ke wallet aktifmu. Wallet demo memakai data bersama.", campaignSub: "Campaign yang kamu kelola, tinjau, atau dukung. Hanya token Testnet.", roomLoading: "Memuat room Arisan", campaignLoading: "Memuat campaign crowdfunding", roomError: "Room kamu belum dapat dimuat.", campaignError: "Campaign kamu belum dapat dimuat.", refresh: "Muat ulang", retry: "Coba lagi", create: "Buat room", join: "Gabung room", explore: "Jelajahi campaign", start: "Buat campaign", emptyRoom: "Mulai room berikutnya di sini.", emptyRoomSub: "Buat room bersama orang yang kamu kenal, atau gabung melalui undangan.", emptyCampaign: "Belum ada campaign yang terhubung ke wallet ini.", emptyCampaignSub: "Jelajahi sebuah campaign atau buat campaign Testnet.", more: "Pilihan crowdfunding lainnya", moreSub: "Jelajahi campaign dan pool komunitas" },
  vi: { tabs: "Danh mục kho quỹ", arisan: "Arisan", crowdfund: "Crowdfund", roomTitle: "Phòng Arisan", campaignTitle: "Gây quỹ cộng đồng", roomSub: "Phòng liên kết với ví đang dùng. Ví demo dùng dữ liệu chung.", campaignSub: "Chiến dịch bạn tổ chức, xem xét hoặc hỗ trợ. Chỉ token Testnet.", roomLoading: "Đang tải phòng Arisan", campaignLoading: "Đang tải chiến dịch gây quỹ", roomError: "Không thể tải phòng của bạn.", campaignError: "Không thể tải chiến dịch của bạn.", refresh: "Tải lại", retry: "Thử lại", create: "Tạo phòng", join: "Tham gia phòng", explore: "Khám phá chiến dịch", start: "Tạo chiến dịch", emptyRoom: "Phòng tiếp theo bắt đầu tại đây.", emptyRoomSub: "Tạo phòng với người quen hoặc tham gia bằng lời mời.", emptyCampaign: "Chưa có chiến dịch liên kết với ví này.", emptyCampaignSub: "Khám phá một chiến dịch hoặc tạo chiến dịch Testnet.", more: "Các cách đóng góp khác", moreSub: "Khám phá chiến dịch và quỹ cộng đồng" },
};
const campaignCardCopy: Record<Locale, {
  campaign: string; organizer: string; beneficiary: string; approver: string; donor: string;
  exampleOrganizer: string; organizerWallet: string; photo: string; portrait: string;
  viewProfile: string; noPhoto: string; inEscrow: string; review: string; viewCampaign: string;
}> = {
  en: { campaign: "Donation campaign", organizer: "Organizer", beneficiary: "Beneficiary", approver: "Approver", donor: "Donor", exampleOrganizer: "Fictional organizer example", organizerWallet: "Organizer wallet", photo: "Illustrative campaign photo", portrait: "Illustrative profile photo, not a verified identity", viewProfile: "View example organizer profile", noPhoto: "Campaign photo not provided", inEscrow: "Testnet XLM in escrow", review: "Proof review", viewCampaign: "View campaign" },
  tl: { campaign: "Kampanya ng donasyon", organizer: "Organizer", beneficiary: "Benepisyaryo", approver: "Tagapag-apruba", donor: "Donor", exampleOrganizer: "Halimbawang kathang-isip na organizer", organizerWallet: "Wallet ng organizer", photo: "Larawang ilustrasyon ng kampanya", portrait: "Ilustrasyong larawan sa profile, hindi beripikadong pagkakakilanlan", viewProfile: "Tingnan ang halimbawang profile ng organizer", noPhoto: "Walang ibinigay na larawan ng kampanya", inEscrow: "Testnet XLM sa escrow", review: "Pagsusuri ng patunay", viewCampaign: "Tingnan ang kampanya" },
  id: { campaign: "Campaign donasi", organizer: "Penyelenggara", beneficiary: "Penerima manfaat", approver: "Pemberi persetujuan", donor: "Donatur", exampleOrganizer: "Contoh penyelenggara fiktif", organizerWallet: "Wallet penyelenggara", photo: "Foto campaign ilustrasi", portrait: "Foto profil ilustrasi, bukan identitas terverifikasi", viewProfile: "Lihat profil penyelenggara contoh", noPhoto: "Foto campaign belum tersedia", inEscrow: "Testnet XLM dalam escrow", review: "Tinjauan bukti", viewCampaign: "Lihat campaign" },
  vi: { campaign: "Chiến dịch quyên góp", organizer: "Nhà tổ chức", beneficiary: "Người thụ hưởng", approver: "Người phê duyệt", donor: "Người quyên góp", exampleOrganizer: "Nhà tổ chức hư cấu mẫu", organizerWallet: "Ví nhà tổ chức", photo: "Ảnh minh họa chiến dịch", portrait: "Ảnh hồ sơ minh họa, không phải danh tính đã xác minh", viewProfile: "Xem hồ sơ nhà tổ chức mẫu", noPhoto: "Chưa cung cấp ảnh chiến dịch", inEscrow: "Testnet XLM trong ký quỹ", review: "Xem xét bằng chứng", viewCampaign: "Xem chiến dịch" },
};
const previewRooms: Rooms = {
  ready: true,
  total: 2,
  nextCursor: null,
  mine: [
    {
      id: 1,
      name: "Family arisan",
      status: "Open",
      memberCount: 5,
      memberTarget: 5,
      sharePeso: "₱250",
      potPeso: "₱1,250",
      sharePesos: 250,
      potPesos: 1250,
      cadence: "Weekly",
      firstKocok: 0,
      round: 0,
      isMember: true,
      isHost: true,
      code: "FAM234",
    },
    {
      id: 2,
      name: "Weekend community circle",
      status: "Active",
      memberCount: 4,
      memberTarget: 4,
      sharePeso: "₱180",
      potPeso: "₱720",
      sharePesos: 180,
      potPesos: 720,
      cadence: "Biweekly",
      firstKocok: 1791321600,
      round: 2,
      isMember: true,
      isHost: false,
      code: "CIR234",
    },
  ],
};
function previewCampaignState(list = PREVIEW_CAMPAIGNS): Campaigns {
  return {
    ok: true,
    contractId: "Local example, no deployed contract",
    viewer: PREVIEW_WALLET.address,
    now: String(PREVIEW_TIME),
    campaigns: list,
  };
}
function isPreviewCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== "object") return false;
  const c = value as Campaign;
  return (
    typeof c.id === "string" &&
    /^\d+$/.test(c.id) &&
    typeof c.title === "string" &&
    ["Funding", "PendingProof", "Refundable", "Released", "Closed"].includes(
      c.state,
    ) &&
    typeof c.total === "string" &&
    /^\d+$/.test(c.total) &&
    typeof c.escrow === "string" &&
    /^\d+$/.test(c.escrow) &&
    Boolean(c.config) &&
    typeof c.config.creator === "string" &&
    typeof c.config.beneficiary === "string" &&
    Array.isArray(c.config.approvers) &&
    c.config.approvers.every((a) => typeof a === "string") &&
    Array.isArray(c.approvals) &&
    Boolean(c.contribution) &&
    typeof c.contribution.amount === "string" &&
    /^\d+$/.test(c.contribution.amount)
  );
}
const choices = [
  {
    href: "/campaigns",
    art: "giving",
    name: "Donation campaigns",
    copy: "Proof and two approvals before payout.",
    action: "Explore causes",
  },
  {
    href: "/circles",
    art: "giving",
    name: "Salapi Circles · prototype",
    copy: "Example causes and organizer profiles. No payments.",
    action: "Explore example causes",
  },
] as const;

export default function VaultsScreen() {
  const { currency, locale } = useT();
  const cardCopy = campaignCardCopy[locale] ?? campaignCardCopy.en;
  const vaultCopy = vaultContentCopy[locale];
  const [rooms, setRooms] = useState<Rooms | null>(
    PREVIEW ? previewRooms : null,
  );
  const [campaigns, setCampaigns] = useState<Campaigns | null>(
    PREVIEW ? previewCampaignState() : null,
  );
  const [pool, setPool] = useState<Pool | null>(null);
  const [legacyCircle, setLegacyCircle] = useState<LegacyCircle | null>(null);
  const [loading, setLoading] = useState(!PREVIEW);
  const [tab, setTab] = useState<VaultTab>("arisan");
  const [tabsReady, setTabsReady] = useState(false);
  const selectTab = (next: VaultTab) => {
    setTab(next);
    try { sessionStorage.setItem(VAULT_TAB_KEY, next); } catch { /* Switching still works without browser storage. */ }
  };
  const refresh = useCallback(async () => {
    if (PREVIEW) {
      let list = PREVIEW_CAMPAIGNS;
      const mine = previewRooms.ready
        ? previewRooms.mine.map((room) => ({ ...room }))
        : [];
      try {
        const saved: unknown = JSON.parse(
          sessionStorage.getItem("salapi.preview.campaigns") || "null",
        );
        if (Array.isArray(saved) && saved.every(isPreviewCampaign))
          list = normalizePreviewCampaigns(saved);
        const draft = JSON.parse(
          sessionStorage.getItem("salapi.preview.arisan-draft") || "null",
        );
        const share = draft?.sharePesos ?? draft?.share;
        if (
          draft?.id === 9001 &&
          typeof draft.name === "string" &&
          Number.isFinite(share) &&
          share > 0 &&
          Number.isInteger(draft.members) &&
          draft.members >= 3 &&
          draft.members <= 20 &&
          ["Weekly", "Biweekly", "Monthly"].includes(draft.cadence)
        )
          mine.unshift({
            ...mine[0],
            id: 9001,
            name: draft.name,
            memberTarget: draft.members,
            memberCount: 1,
            sharePesos: share,
            potPesos: share * draft.members,
            sharePeso: String(share),
            potPeso: String(share * draft.members),
            cadence: draft.cadence,
            code: "NEW234",
          });
        if (sessionStorage.getItem("salapi.preview.arisan-joined") === "1")
          mine.forEach((room) => {
            if (room.id === 1) room.isHost = false;
          });
      } catch {
        /* Keep the original examples if browser session storage is unavailable. */
      }
      setCampaigns(previewCampaignState(list));
      const currentRooms = mine.map(room => {
        const savedRoom = readPreviewArisanRoom(room.id);
        if (savedRoom) return { ...room, ...savedRoom };
        try {
          if (room.id === 1 && sessionStorage.getItem("salapi.preview.arisan-left") === "1") {
            room.isMember = false;
            room.isHost = false;
          }
          if (sessionStorage.getItem(`salapi.preview.arisan-cancelled.${room.id}`) === "1")
            room.status = "Dissolved";
        } catch {
          /* Keep the original example when browser storage is unavailable. */
        }
        return room;
      }).filter(room => room.isMember || room.isHost);
      setRooms({ ready: true, total: currentRooms.length, mine: currentRooms, nextCursor: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Client Server Actions dispatch sequentially. Overlap these independent
      // reads inside one server request instead of queueing four round trips.
      const overview = await vaultOverview();
      setRooms(overview.rooms);
      setCampaigns(overview.campaigns);
      setPool(overview.pool);
      setLegacyCircle(overview.legacyCircle);
    } catch {
      setRooms({ ready: false, error: "We couldn't load your rooms." });
      setCampaigns({ ok: false, error: "We couldn't load your campaigns." });
      setPool({ ok: false, error: "The community pool is temporarily unavailable." });
      setLegacyCircle(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initialLoad = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(VAULT_TAB_KEY);
        if (saved === "arisan" || saved === "crowdfund") setTab(saved);
      } catch { /* Arisan is the safe default when storage is unavailable. */ }
      // SSR must not offer a clickable tab before handlers and the saved
      // preference are ready. Ledger reads do not block category switching.
      setTabsReady(true);
      void refresh();
    }, 0);
    return () => clearTimeout(initialLoad);
  }, [refresh]);
  const mine =
    campaigns?.ok && campaigns.viewer
      ? campaigns.campaigns.filter(
          (c) =>
            c.config.creator === campaigns.viewer ||
            c.config.beneficiary === campaigns.viewer ||
            c.config.approvers.includes(campaigns.viewer!) ||
            BigInt(c.contribution.amount) > 0n,
        )
      : [];
  const myRooms = rooms?.ready ? rooms.mine : [];
  const hasLegacyCircle = Boolean(
    legacyCircle?.ready && legacyCircle.potPesos > 0,
  );
  const roomsIncomplete = !PREVIEW && rooms !== null && !rooms.ready;
  const campaignsIncomplete = !PREVIEW && campaigns !== null && !campaigns.ok;

  return (
    <div className={`${styles.screen} ${styles.vaultsScreen}`} data-testid="vaults-dashboard">
      <header className={styles.vaultHeader}>
        <div>
          <span className={styles.eyebrow}>Your community money</span>
          <h1>Vaults</h1>
          <p>Your shared funds, with clear rules.</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/illustrations/${tab === "arisan" ? "arisan" : "giving"}.png`}
          alt="Friends pooling their contributions"
          className={styles.headerArt}
        />
      </header>
      <div className={styles.testnetNote}>
        <span className={styles.statusDot} /> Stellar Testnet{" "}
        <span>No real money</span>
        {PREVIEW && <strong>Example data</strong>}
      </div>
      <div className={styles.vaultTabs} role="tablist" aria-label={vaultCopy.tabs}>
        {(["arisan", "crowdfund"] as const).map((item) => <button
          key={item} id={`vault-tab-${item}`} type="button" role="tab"
          disabled={!tabsReady}
          aria-selected={tab === item} aria-controls={`vault-panel-${item}`}
          tabIndex={tab === item ? 0 : -1} onClick={() => selectTab(item)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next: VaultTab = event.key === "Home" ? "arisan" : event.key === "End" ? "crowdfund" : item === "arisan" ? "crowdfund" : "arisan";
            selectTab(next);
            event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#vault-tab-${next}`)?.focus();
          }}>
          {vaultCopy[item]}
          {(item === "arisan" ? rooms?.ready : campaigns?.ok) && <span aria-hidden="true">{item === "arisan" ? myRooms.length : mine.length}</span>}
        </button>)}
      </div>
      <div id="vault-panel-arisan" role="tabpanel" aria-labelledby="vault-tab-arisan" hidden={tab !== "arisan"} className={styles.vaultPanel}>
      <section className={styles.warmSection} aria-label={vaultCopy.roomTitle} aria-busy={loading}>
        <div className={styles.sectionHeading}>
          <h2>{vaultCopy.roomTitle}</h2>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => void refresh()}
            disabled={loading}
          >
            {vaultCopy.refresh} {Ico.refresh({ size: 13, c: T.action })}
          </button>
        </div>
        <p className={styles.sectionCopy}>
          {vaultCopy.roomSub}
        </p>
        <div className={styles.vaultActions}>
          <Link href="/arisan/new" className={styles.primaryLink}>{vaultCopy.create}</Link>
          <Link href="/arisan/join" className={styles.secondaryLink}>{vaultCopy.join}</Link>
        </div>
        {loading && myRooms.length === 0 ? (
          <div
            role="status"
            aria-label={vaultCopy.roomLoading}
            className={styles.loadingGrid}
          >
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        ) : null}
        {roomsIncomplete && (
          <div className={styles.inlineNotice} role="alert">
            {vaultCopy.roomError}{" "}
            <button type="button" onClick={() => void refresh()}>
              {vaultCopy.retry}
            </button>
          </div>
        )}
        {!loading && !roomsIncomplete && myRooms.length === 0 && (
          <div className={styles.emptyState}>
            <h3>{vaultCopy.emptyRoom}</h3>
            <p>{vaultCopy.emptyRoomSub}</p>
          </div>
        )}
        {rooms?.ready && rooms.nextCursor !== null ? <Link href="/arisan" className={styles.secondaryLink} style={{ minHeight: 44 }}>Find older rooms</Link> : null}
        <div className={styles.vaultStack}>
          {myRooms.map((room) => (
            <article key={room.id} className={`${styles.personalVault} ${styles.arisanVault}`}>
              <div className={styles.vaultStamp} aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/illustrations/arisan.png" alt="" />
              </div>
              <div className={styles.vaultContent}>
                <div className={styles.cardTop}>
                  <span className={styles.softLabel}>Arisan / Paluwagan</span>
                  <span className={styles.roleLabel}>
                    {room.isHost ? "Host" : "Member"}
                  </span>
                </div>
                <div className={styles.vaultTitleRow}>
                  <div>
                    <h3>{room.name}</h3>
                    <p>
                      {room.status === "Open"
                        ? room.memberCount === room.memberTarget
                          ? "Fully joined · waiting for the host"
                          : "Collecting members"
                        : room.status === "Active"
                          ? `Round ${room.round} · ${room.cadence.toLowerCase()}`
                          : room.status === "Done"
                            ? "All rounds complete"
                            : "Room dissolved"}
                    </p>
                  </div>
                </div>
                <div className={styles.vaultBottomRow}>
                  <dl className={styles.vaultStats}>
                    <div>
                      <dt>Contribution per round</dt>
                      <dd>
                        {formatLocal(room.sharePesos, currency)}
                        <small>Indicative Testnet value</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Target round pot</dt>
                      <dd>
                        {formatLocal(room.potPesos, currency)}
                        <small>
                          {room.memberCount}/{room.memberTarget} members
                        </small>
                      </dd>
                    </div>
                  </dl>
                  <Link href={`/arisan/${room.id}`} className={styles.cardAction}>
                    View room {Ico.chev({ size: 15, c: T.action })}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        {myRooms.length > 0 && <p className={styles.fundNote}>Room funds are separate from your available wallet balance.</p>}
      </section>
      <Link href="/paluwagan" className={styles.resourceLink}>
        <span className={styles.legacyIcon}>{Ico.refresh({ size: 22, c: T.action })}</span>
        <div>
          <h3>Original Paluwagan pool</h3>
          <p>{hasLegacyCircle && legacyCircle?.ready ? `Shared pool · round ${legacyCircle.cycleRound}` : PREVIEW ? "Original shared-pool example" : "Original shared pool · Stellar Testnet"}</p>
        </div>
        {Ico.chev({ size: 15, c: T.action })}
      </Link>
      </div>
      <div id="vault-panel-crowdfund" role="tabpanel" aria-labelledby="vault-tab-crowdfund" hidden={tab !== "crowdfund"} className={styles.vaultPanel}>
      <section className={styles.warmSection} aria-label={vaultCopy.campaignTitle} aria-busy={loading}>
        <div className={styles.sectionHeading}>
          <h2>{vaultCopy.campaignTitle}</h2>
          <button type="button" className={styles.textButton} onClick={() => void refresh()} disabled={loading}>
            {vaultCopy.refresh} {Ico.refresh({ size: 13, c: T.action })}
          </button>
        </div>
        <p className={styles.sectionCopy}>{vaultCopy.campaignSub}</p>
        <div className={styles.vaultActions}>
          <Link href="/campaigns?mode=examples" className={styles.primaryLink}>{vaultCopy.explore}</Link>
          <Link href="/campaigns?create=1" className={styles.secondaryLink}>{vaultCopy.start}</Link>
        </div>
        {loading && mine.length === 0 && <div role="status" aria-label={vaultCopy.campaignLoading} className={styles.loadingGrid}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>}
        {campaignsIncomplete && <div className={styles.inlineNotice} role="alert">
          {vaultCopy.campaignError} <button type="button" onClick={() => void refresh()}>{vaultCopy.retry}</button>
        </div>}
        {!loading && !campaignsIncomplete && mine.length === 0 && <div className={styles.emptyState}>
          <h3>{vaultCopy.emptyCampaign}</h3><p>{vaultCopy.emptyCampaignSub}</p>
        </div>}
        <div className={styles.vaultStack}>
          {mine.map((campaign) => {
            const media = vaultCampaignMedia(campaign, PREVIEW);
            const creator = campaign.config.creator;
            const shortCreator = `${creator.slice(0, 6)}…${creator.slice(-6)}`;
            return <article key={campaign.id} className={styles.campaignVault} aria-labelledby={`vault-campaign-${campaign.id}`}>
              <header className={styles.campaignHero} data-has-photo={Boolean(media)}>
                {media ? <Image src={media.coverSrc} alt="" fill sizes="(max-width: 440px) 100vw, 460px" className={styles.campaignCover} /> : null}
                <div className={styles.campaignHeroContent}>
                  <div className={styles.campaignHeroTop}>
                    <span className={styles.campaignNumber}>{cardCopy.campaign} #{campaign.id}</span>
                    <span className={styles.campaignRole}>
                    {campaign.config.creator === campaigns?.viewer
                      ? cardCopy.organizer
                      : campaign.config.beneficiary === campaigns?.viewer
                        ? cardCopy.beneficiary
                        : campaign.config.approvers.includes(
                              campaigns?.viewer ?? "",
                            )
                          ? cardCopy.approver
                          : cardCopy.donor}
                    </span>
                  </div>
                  <div>
                    <span className={styles.campaignPhotoNote}>{media ? cardCopy.photo : cardCopy.noPhoto}</span>
                    <h3 id={`vault-campaign-${campaign.id}`}>{campaign.title}</h3>
                  </div>
                </div>
              </header>
              <div className={styles.campaignBody}>
                {media ? <Link href={media.organizerHref} className={styles.campaignOrganizer} aria-label={`${cardCopy.viewProfile}: ${media.organizerName}`}>
                  <Image src={media.organizerPhotoSrc} alt={cardCopy.portrait} width={44} height={44} className={styles.campaignAvatar} />
                  <span><small>{cardCopy.exampleOrganizer}</small><strong>{media.organizerName}</strong></span>
                  {Ico.chev({size:14,c:T.action})}
                </Link> : <a href={`https://stellar.expert/explorer/testnet/account/${creator}`} target="_blank" rel="noopener noreferrer" className={styles.campaignOrganizer}>
                  <span className={styles.campaignAvatarFallback} aria-hidden="true">{Ico.vault({size:20,c:T.action})}</span>
                  <span><small>{cardCopy.organizerWallet}</small><strong>{shortCreator}</strong></span>
                  {Ico.link({size:14,c:T.action})}
                </a>}
                <div className={styles.campaignSummary}>
                  <span>
                    <strong>{formatStroops(campaign.escrow)}</strong> {cardCopy.inEscrow}
                  </span>
                  <span className={styles.softLabel}>
                    {campaign.state === "PendingProof"
                      ? cardCopy.review
                      : campaign.state}
                  </span>
                </div>
                {campaign.state === "PendingProof" && (
                  <p className={styles.proofNote}>
                    {campaign.proofHash
                      ? `${campaign.approvals.length} of 2 required approvals`
                      : "Awaiting the organizer's proof"}
                  </p>
                )}
                <Link
                  href={`/campaigns?id=${campaign.id}`}
                  className={styles.cardAction}
                >
                  {cardCopy.viewCampaign} {Ico.chev({ size: 15, c: T.action })}
                </Link>
              </div>
            </article>;
          })}
        </div>
        {mine.length > 0 && (
          <p className={styles.fundNote}>
            Campaign escrow is separate from your available wallet balance.
          </p>
        )}
        {!PREVIEW &&
          campaigns?.ok &&
          campaigns.campaigns.length > 0 &&
          BigInt(campaigns.campaigns.at(-1)!.id) > 1n && (
            <Link href="/campaigns?mode=testnet" className={styles.cardAction}>
              Browse older campaigns {Ico.chev({ size: 14, c: T.action })}
            </Link>
          )}
      </section>
      <section
        className={styles.communitySection}
        aria-label="Community Disaster Vault"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/disaster.png"
          alt="Hands supporting a community shelter"
        />
        <div>
          <span className={styles.eyebrow}>Community pool</span>
          <h2>Disaster Vault</h2>
          <p>Two approvals. Time to review. Public proof.</p>
          <Link href="/transparency">
            View pool and payout requests {Ico.chev({ size: 14, c: "#fff" })}
          </Link>
        </div>
        <span className={styles.communityStatus}>
          {PREVIEW
            ? "Example"
            : pool?.ok
              ? pool.active
                ? "Active"
                : "Paused"
              : loading
                ? "Loading"
                : "Unavailable"}
        </span>
      </section>
      <section className={styles.exploreSection}>
        <div className={styles.sectionHeading}>
          <h2>{vaultCopy.more}</h2>
          <span className={styles.smallMuted}>{vaultCopy.moreSub}</span>
        </div>
        <div className={styles.vaultDiscovery}>
          {choices.map((choice) => (
            <Link
              key={choice.href}
              href={choice.href}
              className={styles.exploreLink}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/illustrations/${choice.art}.png`} alt="" />
              <div>
                <h3>{choice.name}</h3>
                <p>{choice.action}</p>
              </div>
              {Ico.chev({ size: 15, c: T.action })}
            </Link>
          ))}
        </div>
      </section>
      </div>
      <div className={styles.comingSoon} aria-disabled="true" data-testid="vault-savings-coming-soon">
        <Image src="/illustrations/savings.png" alt="" width={32} height={34} />
        <div><strong>Smart Savings</strong></div>
        <span className={styles.softLabel}>{homeCopy(locale, "Coming soon")}</span>
      </div>
      <footer className={styles.footer}>
        <PoweredByStellar />
        <span>Public proof on Stellar Testnet.</span>
      </footer>
    </div>
  );
}
