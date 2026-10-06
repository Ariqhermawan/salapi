"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { T, Btn, Wordmark, Chip, MakerLockup, PoweredByStellar } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import type { Locale } from "@/lib/i18n/config";

const SLIDES: Record<Locale, { tag: string; title: string; body: string }[]> = {
  en: [
    { tag: "GIVE WITH CLARITY", title: "A cause you care about.\nTerms you can see.", body: "Explore donation campaigns. Check the beneficiary, creator share and review deadline before contributing valueless Testnet XLM." },
    { tag: "SAVE TOGETHER", title: "Your circle.\nClear rules.", body: "Arisan Rooms collect the full required deposit upfront. Check every member, schedule and payout rule before joining." },
    { tag: "SEND BY NAME", title: "An @username.\nA public receipt.", body: "Review the recipient and amount, then send Testnet XLM. Currency values are illustrative. Real deposits and withdrawals are not connected." },
  ],
  id: [
    { tag: "DONASI DENGAN JELAS", title: "Tujuan yang kamu peduli.\nSyarat yang terlihat.", body: "Jelajahi campaign donasi. Periksa penerima, bagian pembuat dan batas waktu review sebelum menyetor XLM Testnet tanpa nilai uang." },
    { tag: "MENABUNG BERSAMA", title: "Lingkaranmu.\nAturan yang jelas.", body: "Arisan Rooms meminta seluruh setoran di muka. Periksa anggota, jadwal dan aturan pencairan sebelum bergabung." },
    { tag: "KIRIM LEWAT NAMA", title: "Satu @username.\nBukti publik.", body: "Periksa penerima dan nominal sebelum mengirim XLM Testnet. Nilai mata uang hanya ilustrasi. Setoran dan penarikan uang nyata belum terhubung." },
  ],
  tl: [
    { tag: "MALINAW NA PAGBIBIGAY", title: "Layuning mahalaga.\nPatakarang nakikita.", body: "Suriin ang benepisyaryo, bahagi ng gumawa at review deadline bago magbigay ng Testnet XLM na walang tunay na halaga." },
    { tag: "SAMA-SAMANG IPON", title: "Ang inyong grupo.\nMalinaw na patakaran.", body: "Buong deposito muna sa Arisan Rooms. Suriin ang mga miyembro, iskedyul at patakaran ng payout bago sumali." },
    { tag: "MAGPADALA SA PANGALAN", title: "Isang @username.\nPampublikong resibo.", body: "Suriin ang tatanggap at halaga bago magpadala ng Testnet XLM. Halimbawa lang ang currency value. Hindi pa konektado ang tunay na cash in at cash out." },
  ],
  vi: [
    { tag: "QUYÊN GÓP MINH BẠCH", title: "Mục tiêu bạn quan tâm.\nĐiều kiện rõ ràng.", body: "Xem người nhận, phần của người tạo và hạn xét duyệt trước khi đóng góp XLM Testnet không có giá trị tiền thật." },
    { tag: "TIẾT KIỆM CÙNG NHAU", title: "Nhóm của bạn.\nQuy tắc rõ ràng.", body: "Arisan Rooms yêu cầu nộp toàn bộ khoản góp trước. Kiểm tra thành viên, lịch và quy tắc chi trả trước khi tham gia." },
    { tag: "GỬI BẰNG TÊN", title: "Một @username.\nBiên nhận công khai.", body: "Kiểm tra người nhận và số tiền trước khi gửi XLM Testnet. Giá trị tiền tệ chỉ minh họa. Nạp và rút tiền thật chưa kết nối." },
  ],
};
const ART = ["giving", "arisan", "send"];
export default function OnboardingScreen() {
  const router = useRouter();
  const { t, locale } = useT();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[locale][index];
  const last = index === 2;
  return <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", display: "flex", flexDirection: "column", padding: "16px 20px 28px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Wordmark size={22} /><button type="button" onClick={() => router.push("/")} style={{ border: 0, background: "none", color: T.slate, fontWeight: 700, padding: 10 }}>{t("onboarding.skip")}</button></div>
    <div style={{ flex: 1, padding: "30px 12px 22px", textAlign: "center" }}>
      <div style={{ background: "#F2EFE7", borderRadius: 32, padding: 24, marginBottom: 26 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={"/illustrations/" + ART[index] + ".png"} alt="" width={220} height={220} style={{ width: "min(100%, 240px)", height: 220, objectFit: "contain" }} />
      </div>
      <div style={{ color: T.action, fontSize: 11, fontWeight: 800, letterSpacing: ".1em" }}>{slide.tag}</div>
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-.04em", lineHeight: 1.12, whiteSpace: "pre-line", margin: "12px 0 16px" }}>{slide.title}</h1>
      <p style={{ fontSize: 14, color: T.slate, lineHeight: 1.65, margin: 0 }}>{slide.body}</p>
      <div style={{ marginTop: 20 }}><Chip kind="warn">STELLAR TESTNET · NO REAL MONEY</Chip></div>
    </div>
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 18 }}>{ART.map((_, i) => <button key={i} type="button" aria-label={"Slide " + (i + 1)} aria-pressed={i === index} onClick={() => setIndex(i)} style={{ width: i === index ? 28 : 10, height: 10, padding: 0, border: 0, borderRadius: 99, background: i === index ? T.action : T.hairline }} />)}</div>
    <Btn kind="primary" onClick={() => last ? router.push("/signin") : setIndex(index + 1)}>{last ? t("onboarding.getStarted") : t("onboarding.next")}</Btn>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 20 }}><MakerLockup /><PoweredByStellar /></div>
  </div>;
}
