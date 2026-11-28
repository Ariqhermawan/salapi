"use client";

import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import type { Locale } from "@/lib/i18n/config";
import { ARISAN_PREVIEW_FIXTURES, arisanPreviewStartEligible, type ArisanPreviewFixture, type ArisanPreviewFixtureMode } from "@/lib/arisan-preview-fixtures";
import styles from "./ArisanPreviewFixturesScreen.module.css";

const copy = {
  en: {
    title: "Arisan room fixtures", intro: "Read-only Local Preview for QA. Every card uses fixed sample data and stays isolated from wallets, browser storage, backend actions and Testnet.", back: "Back to Arisan", modes: "Room modes", joins: "Join review", starts: "Start gate", readOnly: "READ ONLY",
    mode: { upfront: "Upfront · legacy", installments: "Installments", scheduled: "Scheduled" },
    description: { upfront: "Joining transfers the full-cycle obligation into escrow. Existing upfront rooms stay on this separate path.", installments: "Joining transfers no contribution. Members confirm optional partial payments until the full cycle is funded.", scheduled: "Joining transfers no contribution. Members confirm partial payments against draw dates agreed in advance." },
    labels: { share: "Share per round", obligation: "Full-cycle obligation", joining: "Contribution at join", roster: "Roster", funded: "Fully funded", code: "Invite code", deadline: "Funding deadline", firstDraw: "First draw", interval: "Draw interval" },
    reviewOnly: "Sample terms only. There is no Join control and no room is created.",
    eligible: "Start eligible in this fixture", blocked: "Start blocked in this fixture", noStart: "This fixture shows eligibility only. Start is never submitted.",
    reason: { roster: "Waiting for every seat to be filled.", funding: "Every seat is filled; one member still needs to fund the full cycle.", ready: "Roster and funding are complete; the host may Start." },
  },
  id: {
    title: "Fixture room Arisan", intro: "Local Preview read-only untuk QA. Semua kartu memakai data contoh tetap dan terisolasi dari wallet, penyimpanan browser, action backend, dan Testnet.", back: "Kembali ke Arisan", modes: "Mode room", joins: "Review undangan", starts: "Gate Start", readOnly: "HANYA BACA",
    mode: { upfront: "Di muka · legacy", installments: "Cicilan", scheduled: "Terjadwal" },
    description: { upfront: "Saat bergabung, seluruh kewajiban siklus masuk ke escrow. Room di muka yang sudah ada tetap memakai jalur terpisah ini.", installments: "Saat bergabung tidak ada kontribusi. Anggota mengonfirmasi setoran sebagian sampai kewajiban satu siklus lunas.", scheduled: "Saat bergabung tidak ada kontribusi. Anggota mengonfirmasi setoran sebagian mengikuti tanggal kocokan yang disepakati lebih dulu." },
    labels: { share: "Bagian per ronde", obligation: "Kewajiban satu siklus", joining: "Kontribusi saat bergabung", roster: "Anggota", funded: "Lunas penuh", code: "Kode undangan", deadline: "Batas pendanaan", firstDraw: "Kocokan pertama", interval: "Jarak kocokan" },
    reviewOnly: "Hanya contoh syarat. Tidak ada tombol Bergabung dan room tidak dibuat.",
    eligible: "Start memenuhi syarat di fixture ini", blocked: "Start terkunci di fixture ini", noStart: "Fixture ini hanya menampilkan syarat. Start tidak pernah dikirim.",
    reason: { roster: "Menunggu semua kursi terisi.", funding: "Kursi sudah penuh; satu anggota belum melunasi satu siklus.", ready: "Roster dan pendanaan lengkap; host dapat melakukan Start." },
  },
  tl: {
    title: "Arisan room fixtures", intro: "Read-only Local Preview para sa QA. Fixed na sample data ang bawat card at hiwalay sa mga wallet, browser storage, backend action at Testnet.", back: "Bumalik sa Arisan", modes: "Mga uri ng room", joins: "Join review", starts: "Start gate", readOnly: "READ ONLY",
    mode: { upfront: "Upfront · legacy", installments: "Installment", scheduled: "Scheduled" },
    description: { upfront: "Sa pagsali, inililipat sa escrow ang buong obligasyon ng cycle. Hiwalay pa rin ang dating upfront rooms.", installments: "Walang contribution sa pagsali. Kinukumpirma ng miyembro ang mga bahagyang hulog hanggang mabuo ang buong cycle.", scheduled: "Walang contribution sa pagsali. Kinukumpirma ng miyembro ang mga hulog ayon sa napagkasunduang petsa ng bunutan." },
    labels: { share: "Ambag bawat round", obligation: "Obligasyon sa buong cycle", joining: "Ambag sa pagsali", roster: "Roster", funded: "Fully funded", code: "Invite code", deadline: "Funding deadline", firstDraw: "Unang bunutan", interval: "Pagitan ng bunutan" },
    reviewOnly: "Sample terms lang. Walang Join control at walang gagawing room.",
    eligible: "Pasok sa Start ang fixture na ito", blocked: "Naka-lock ang Start sa fixture na ito", noStart: "Eligibility lang ang ipinapakita. Hindi kailanman isinusumite ang Start.",
    reason: { roster: "Naghihintay mapuno ang lahat ng seat.", funding: "Puno na ang mga seat; may isang miyembrong kailangang magbayad ng buong cycle.", ready: "Kumpleto ang roster at pondo; puwedeng mag-Start ang host." },
  },
  vi: {
    title: "Fixture phòng Arisan", intro: "Local Preview chỉ đọc dành cho QA. Mọi thẻ dùng dữ liệu mẫu cố định, tách biệt khỏi ví, bộ nhớ trình duyệt, backend và Testnet.", back: "Quay lại Arisan", modes: "Loại phòng", joins: "Xem lại lời mời", starts: "Điều kiện Start", readOnly: "CHỈ ĐỌC",
    mode: { upfront: "Trả trước · legacy", installments: "Trả góp", scheduled: "Theo lịch" },
    description: { upfront: "Khi tham gia, toàn bộ nghĩa vụ chu kỳ được chuyển vào escrow. Các phòng trả trước cũ vẫn dùng luồng riêng này.", installments: "Khi tham gia không chuyển khoản góp. Thành viên xác nhận từng khoản cho đến khi đủ cả chu kỳ.", scheduled: "Khi tham gia không chuyển khoản góp. Thành viên xác nhận từng khoản theo ngày quay đã thống nhất trước." },
    labels: { share: "Khoản góp mỗi vòng", obligation: "Nghĩa vụ cả chu kỳ", joining: "Khoản góp khi tham gia", roster: "Thành viên", funded: "Đã góp đủ", code: "Mã mời", deadline: "Hạn góp", firstDraw: "Lượt quay đầu", interval: "Khoảng cách lượt quay" },
    reviewOnly: "Chỉ là điều khoản mẫu. Không có nút Join và không tạo phòng.",
    eligible: "Fixture này đủ điều kiện Start", blocked: "Fixture này chưa thể Start", noStart: "Fixture chỉ hiển thị điều kiện. Không gửi Start.",
    reason: { roster: "Chờ đủ tất cả chỗ.", funding: "Đã đủ chỗ; một thành viên chưa góp đủ cả chu kỳ.", ready: "Đã đủ thành viên và kinh phí; host có thể Start." },
  },
} as const;

const groups = ["mode", "join-review", "start-gate"] as const;

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function FixtureCard({ fixture, locale, section }: { fixture: ArisanPreviewFixture; locale: Locale; section: typeof groups[number] }) {
  const content = copy[locale] ?? copy.en;
  const mode = content.mode[fixture.mode as ArisanPreviewFixtureMode];
  const labels = content.labels;
  const startEligible = arisanPreviewStartEligible(fixture);
  const reason = fixture.memberCount < fixture.memberTarget ? content.reason.roster : fixture.fullyFundedCount < fixture.memberTarget ? content.reason.funding : content.reason.ready;
  return <article className={styles.card} data-fixture-id={fixture.id}>
    <div className={styles.cardTop}><span className={styles.mode}>{mode}</span><span className={styles.readOnly}>{content.readOnly}</span></div>
    <h3>{fixture.roomName}</h3>
    <p>{section === "join-review" ? content.reviewOnly : content.description[fixture.mode]}</p>
    {section === "start-gate" ? <p>{content.noStart}</p> : null}
    {fixture.inviteCode ? <p className={styles.invite}><span>{labels.code}</span><strong>{fixture.inviteCode}</strong></p> : null}
    <dl className={styles.details}>
      <Detail label={labels.share} value={`${fixture.shareXlm} XLM`} />
      <Detail label={labels.obligation} value={`${fixture.obligationXlm} XLM`} />
      <Detail label={labels.joining} value={`${fixture.joinContributionXlm} XLM`} />
      <Detail label={labels.roster} value={`${fixture.memberCount}/${fixture.memberTarget}`} />
      <Detail label={labels.funded} value={`${fixture.fullyFundedCount}/${fixture.memberTarget}`} />
      {fixture.schedule ? <>
        <Detail label={labels.deadline} value={fixture.schedule.fundingDeadlineUtc} />
        <Detail label={labels.firstDraw} value={fixture.schedule.firstDrawUtc} />
        <Detail label={labels.interval} value={`${fixture.schedule.intervalDays} days`} />
      </> : null}
    </dl>
    {section === "start-gate" ? <div className={startEligible ? styles.gateReady : styles.gateBlocked} role="status">
      <strong>{startEligible ? content.eligible : content.blocked}</strong><span>{reason}</span>
    </div> : null}
  </article>;
}

export default function ArisanPreviewFixturesScreen() {
  const { locale } = useT();
  const content = copy[locale] ?? copy.en;
  return <main className={styles.screen}>
    <header className={styles.header}>
      <Link href="/arisan" className={styles.back}>{content.back}</Link>
      <span className={styles.kicker}>LOCAL QA · {content.readOnly}</span>
      <h1>{content.title}</h1>
      <p>{content.intro}</p>
    </header>
    {groups.map(section => <section key={section} className={styles.section} aria-labelledby={`fixtures-${section}`}>
      <h2 id={`fixtures-${section}`}>{section === "mode" ? content.modes : section === "join-review" ? content.joins : content.starts}</h2>
      <div className={styles.grid}>{ARISAN_PREVIEW_FIXTURES.filter(fixture => fixture.section === section).map(fixture => <FixtureCard key={fixture.id} fixture={fixture} locale={locale} section={section} />)}</div>
    </section>)}
  </main>;
}
