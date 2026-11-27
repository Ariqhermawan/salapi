"use client";

import { useRouter } from "next/navigation";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { AppBar, Card, IconButton, PoweredByStellar, Ico } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { LEARN } from "@/lib/learn-content";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeLearnScreen.module.css";

const COPY: Record<Locale, {
  title: string;
  language: string;
  titles: [string, string, string, string, string];
  vault: string[];
  receipts: string;
  links: [string, string, string, string, string];
}> = {
  en: {
    title: "How Salapi works", language: "Language",
    titles: ["How do donation campaigns work?", "How does the Disaster Vault work?", "How does Arisan work?", "How does Smart Savings work?", "How do public receipts work?"],
    vault: ["The Disaster Vault is a separate shared D3 pool. D4 campaign donations do not automatically send 1% to it; contributing requires a separate Testnet transaction.", "Payout requests need two of three fixed signers, wait 20 ledgers, and must pass a rolling spending cap of 20% of the current balance over 24 hours. The contract does not choose NGOs."],
    receipts: "Campaign payouts or refunds, Disaster Vault deposits and payouts, and Arisan draws can leave public Stellar records. A receipt shows what happened on-chain; it does not prove aid reached people or verify an organization.",
    links: ["Read donation guide", "Open Disaster Vault", "Read Arisan guide", "Read Smart Savings guide", "View public activity"],
  },
  id: {
    title: "Cara kerja Salapi", language: "Bahasa",
    titles: ["Bagaimana campaign donasi bekerja?", "Bagaimana Disaster Vault bekerja?", "Bagaimana Arisan bekerja?", "Bagaimana Smart Savings bekerja?", "Bagaimana bukti transaksi publik bekerja?"],
    vault: ["Disaster Vault adalah pool bersama D3 yang terpisah. Donasi campaign D4 tidak otomatis mengirim 1% ke sana; kontribusi memerlukan transaksi Testnet terpisah.", "Permintaan payout memerlukan persetujuan dua dari tiga signer tetap, menunggu 20 ledger, dan mematuhi batas pengeluaran bergulir sebesar 20% dari saldo saat ini selama 24 jam. Kontrak tidak memilih NGO."],
    receipts: "Payout atau refund campaign, setoran dan payout Disaster Vault, serta undian Arisan dapat meninggalkan catatan publik di Stellar. Resi menunjukkan aktivitas on-chain, bukan bukti bantuan sudah sampai atau organisasi telah terverifikasi.",
    links: ["Baca panduan donasi", "Buka Disaster Vault", "Baca panduan Arisan", "Baca panduan Smart Savings", "Lihat aktivitas publik"],
  },
  tl: {
    title: "Paano gumagana ang Salapi", language: "Wika",
    titles: ["Paano gumagana ang donation campaign?", "Paano gumagana ang Disaster Vault?", "Paano gumagana ang Arisan?", "Paano gumagana ang Smart Savings?", "Paano gumagana ang public receipts?"],
    vault: ["Hiwalay na shared D3 pool ang Disaster Vault. Hindi awtomatikong nagpapadala roon ng 1% ang D4 campaign donations; hiwalay na Testnet transaction ang kailangan para mag-ambag.", "Kailangan ng dalawang approval mula sa tatlong nakatakdang signer, 20-ledger wait, at rolling spending cap na 20% ng kasalukuyang balance sa loob ng 24 oras. Hindi pumipili ng NGO ang contract."],
    receipts: "Maaaring magkaroon ng public Stellar record ang campaign payout o refund, deposito at payout ng Disaster Vault, at draw ng Arisan. Ipinapakita ng resibo ang on-chain na nangyari; hindi nito pinatutunayang nakarating ang tulong o beripikado ang organisasyon.",
    links: ["Basahin ang donation guide", "Buksan ang Disaster Vault", "Basahin ang Arisan guide", "Basahin ang Smart Savings guide", "Tingnan ang public activity"],
  },
  vi: {
    title: "Cách Salapi hoạt động", language: "Ngôn ngữ",
    titles: ["Chiến dịch quyên góp hoạt động thế nào?", "Disaster Vault hoạt động thế nào?", "Arisan hoạt động thế nào?", "Smart Savings hoạt động thế nào?", "Biên lai công khai hoạt động thế nào?"],
    vault: ["Disaster Vault là một quỹ D3 chung riêng biệt. Tiền quyên góp cho chiến dịch D4 không tự động chuyển 1% vào quỹ; muốn đóng góp cần một giao dịch Testnet riêng.", "Yêu cầu chi trả cần hai trong ba signer cố định phê duyệt, chờ 20 ledger và tuân theo hạn mức chi tiêu luân phiên 20% số dư hiện tại trong 24 giờ. Hợp đồng không chọn NGO."],
    receipts: "Khoản chi trả hoặc hoàn tiền của chiến dịch, tiền nạp và chi trả của Disaster Vault, cùng lượt rút thăm Arisan có thể để lại hồ sơ công khai trên Stellar. Biên lai ghi lại hoạt động on-chain; nó không chứng minh hỗ trợ đã đến nơi hay tổ chức đã được xác minh.",
    links: ["Đọc hướng dẫn quyên góp", "Mở Disaster Vault", "Đọc hướng dẫn Arisan", "Đọc hướng dẫn Smart Savings", "Xem hoạt động công khai"],
  },
};

export default function PrototypeLearnScreen() {
  const router = useRouter();
  const back = useGoBack("/");
  const { locale, setLocale } = useT();
  const copy = COPY[locale] ?? COPY.en;
  const learn = LEARN[locale] ?? LEARN.en;
  const guides = [
    { title: copy.titles[0], body: [learn.fund.lede, learn.fund.p1, learn.fund.p2, learn.fund.promise], link: copy.links[0], href: "/learn/fund" },
    { title: copy.titles[1], body: copy.vault, link: copy.links[1], href: "/vault" },
    { title: copy.titles[2], body: [learn.circle.lede, learn.circle.p1, learn.circle.p2, learn.circle.p3], link: copy.links[2], href: "/learn/circle" },
    { title: copy.titles[3], body: [learn.grow.lede, learn.grow.p1, learn.grow.p3], link: copy.links[3], href: "/learn/grow" },
    { title: copy.titles[4], body: [copy.receipts], link: copy.links[4], href: "/activity" },
  ];

  return <div className={styles.screen}>
    <AppBar
      leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>}
      title={copy.title}
      trailing={<label className={styles.localeControl}>
        <span className={styles.visuallyHidden}>{copy.language}</span>
        <select aria-label={copy.language} value={locale} onChange={event => setLocale(event.target.value as Locale)}>
          {LOCALES.map(code => <option key={code} value={code}>{LOCALE_META[code].native}</option>)}
        </select>
      </label>}
    />
    <Card p={0} className={styles.card}>
      {guides.map((guide, index) => <details className={styles.guide} key={guide.title} open={index === 0}>
        <summary>{guide.title}<CaretDown size={20} aria-hidden="true" /></summary>
        {guide.body.map((paragraph, paragraphIndex) => <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>)}
        <button type="button" className={styles.link} onClick={() => router.push(guide.href)}>{guide.link}<CaretRight size={18} aria-hidden="true" /></button>
      </details>)}
    </Card>
    <div className={styles.legal}>
      <button type="button" onClick={() => router.push("/you/privacy")}>Privacy</button>
      <button type="button" onClick={() => router.push("/you/terms")}>Terms</button>
    </div>
    <div className={styles.powered}><PoweredByStellar /></div>
  </div>;
}
