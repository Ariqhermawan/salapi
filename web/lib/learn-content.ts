import type { Locale } from "./i18n/config";
export type LearnTopicId = "fund" | "circle" | "grow";
export const LEARN_TOPICS: LearnTopicId[] = ["fund", "circle", "grow"];
export type LearnCard = { id: LearnTopicId; pose: "wave" | "point" | "cheer" | "think"; kicker: string; title: string; blurb: string; mins: number };
type Case = { flag: string; country: string; story: string; source: string; url?: string };
type BaseTopic = { eyebrow: string; title: string; lede: string; p1: string; p2: string; p3: string; promise: string };
export type LearnLang = {
  nav: { home: string; vaults: string; learn: string; activity: string; you: string };
  indexEyebrow: string; indexTitle: string; indexSub: string; readTime: string; cards: LearnCard[];
  fund: BaseTopic & { cases: Case[]; stats: { k: string; v: string }[] };
  circle: BaseTopic & { cases: Case[]; glossary: { lang: string; word: string }[] };
  grow: BaseTopic & { apy: { label: string; value: string }; stack: { t: string; s: string }[] };
};
type Step = { icon: string; t: string; s: string };
type XTopic = { steps: Step[]; cta: { label: string; sub: string; icon: string } };
export type LearnXLang = { howHeading: string; fund: XTopic; circle: XTopic; grow: XTopic };
type Copy = { intro: [string,string,string,string]; titles: [string,string,string]; fund: [string,string,string,string,string]; circle: [string,string,string,string,string]; grow: [string,string,string,string,string]; soon: string; how: string; actions: [string,string,string] };
const COPY: Record<Locale, Copy> = {
  en: {
    intro: ["Learn","Clear rules. Confident steps.","Three short guides to the current Testnet experience."," min read"],
    titles: ["Give with clarity.","Save together, with clear rules.","A goal of your own."],
    fund: ["Choose a cause and read its terms before giving.",
      "Each donation campaign has separate escrow. Its beneficiary, three approvers, creator share of 0–10% and deadlines are fixed when created. The current network uses valueless Stellar Testnet XLM.",
      "Proof is submitted after funding closes. Two of three wallets must approve the same document before the review deadline. Payout follows the fixed recipients and share. A hash and approvals do not prove real-world delivery.",
      "The shared Disaster Vault uses different rules: two of three fixed wallets approve, followed by a 20-ledger wait and a rolling 24-hour cap rechecked at execution. Pause and unpause require quorum. Keys are currently managed Testnet wallets.",
      "Without two timely campaign approvals, each donor can claim their contribution back after the review deadline. Refunds are not automatic and exclude network fees. The shared Disaster Vault has no donor refund."],
    circle: ["A familiar saving tradition, with the rules visible.",
      "Arisan Rooms require the full deposit upfront: member count multiplied by the share. Review this total before creating or joining. It differs from paying a small amount each round.",
      "Members commit, reveal and finalize the draw after its deadline. The caller does not directly select the winner. This mechanism has limits and should not be called manipulation-proof.",
      "Open rooms have leave, cancel and refund options under contract rules. Expired rooms need recovery before further participation. Active emergency recovery has separate timing and eligibility conditions.",
      "Legacy Paluwagan has a fixed roster and contributions each round. Its pot waits for everyone to pay and it has no implemented cancel or refund flow. Check which mode you are opening."],
    grow: ["Coming soon for everyday use. An experimental Testnet contract exists today.",
      "The experimental contract holds valueless Testnet XLM in one vault per wallet. Release follows its contract target or unlock condition. Currency figures are illustrative values.",
      "Additional goal cards are local planning envelopes of one vault. They are not separate contracts or locks. The contract target still controls release.",
      "Yield, USDC conversion, bank withdrawals and independent audit are not integrated. Launch details and availability must be confirmed before using real funds.",
      "Read the current public documentation to inspect the experimental contract. The redesigned app marks everyday Smart Savings as coming soon."],
    soon: "Coming soon", how: "Current rules", actions: ["View public transparency","Explore Arisan Rooms","See Smart Savings"],
  },
  id: {
    intro: ["Pelajari","Aturan jelas. Langkah lebih yakin.","Tiga panduan singkat untuk Testnet saat ini."," menit baca"],
    titles: ["Donasi dengan jelas.","Menabung bersama, aturan jelas.","Tujuan tabunganmu sendiri."],
    fund: ["Pilih tujuan dan baca syarat sebelum menyumbang.",
      "Tiap campaign memiliki escrow terpisah. Penerima, tiga approver, bagian pembuat 0–10% dan tenggat dikunci saat dibuat. Jaringan saat ini memakai XLM Stellar Testnet tanpa nilai uang.",
      "Bukti diajukan setelah funding tutup. Dua dari tiga wallet harus menyetujui dokumen yang sama sebelum tenggat review. Pencairan mengikuti penerima dan bagian yang dikunci. Hash dan persetujuan tidak membuktikan bantuan nyata sudah sampai.",
      "Disaster Vault bersama memiliki aturan berbeda: dua dari tiga wallet tetap menyetujui, dilanjutkan waktu tunggu 20 ledger dan batas pengeluaran 24 jam yang diperiksa ulang saat eksekusi. Pause dan unpause memerlukan quorum. Key Testnet dikelola layanan.",
      "Tanpa dua persetujuan tepat waktu, donor dapat mengklaim kontribusinya setelah tenggat review. Refund tidak otomatis dan tidak mencakup biaya jaringan. Disaster Vault tidak memiliki refund donor."],
    circle: ["Tradisi menabung bersama dengan aturan yang terlihat.",
      "Arisan Rooms meminta setoran penuh di muka: jumlah anggota dikalikan bagian per anggota. Periksa total sebelum bergabung. Ini berbeda dari membayar sedikit tiap putaran.",
      "Anggota mengikuti commit, reveal dan finalize undian setelah tenggat. Pemanggil tidak memilih pemenang langsung. Mekanisme memiliki batas dan tidak boleh disebut bebas manipulasi.",
      "Room Open memiliki opsi keluar, batal dan refund sesuai kontrak. Room kedaluwarsa perlu dipulihkan. Pemulihan darurat room aktif memiliki syarat waktu dan peserta tersendiri.",
      "Paluwagan lama memakai anggota tetap dan setoran per putaran. Pot menunggu semua membayar dan belum memiliki alur batal atau refund. Periksa mode yang kamu buka."],
    grow: ["Segera hadir untuk sehari-hari. Kontrak Testnet percobaan sudah ada.",
      "Kontrak percobaan menyimpan XLM Testnet tanpa nilai uang dalam satu vault per wallet. Pencairan mengikuti target atau kondisi unlock. Nilai mata uang hanya ilustrasi.",
      "Kartu tujuan tambahan adalah envelope perencanaan lokal dari satu vault. Kartu itu bukan kontrak atau kunci terpisah. Target kontrak tetap menentukan pencairan.",
      "Yield, konversi USDC, penarikan bank dan audit independen belum terintegrasi. Pastikan detail peluncuran dan ketersediaan sebelum memakai dana nyata.",
      "Baca dokumentasi publik untuk memeriksa kontrak percobaan. Smart Savings sehari-hari diberi label segera hadir."],
    soon: "Segera hadir", how: "Aturan saat ini", actions: ["Lihat transparansi publik","Jelajahi Arisan Rooms","Lihat Smart Savings"],
  },
  tl: {
    intro: ["Alamin","Malinaw na patakaran. Tiyak na hakbang.","Tatlong gabay sa kasalukuyang Testnet."," min basa"],
    titles: ["Magbigay nang malinaw.","Sama-samang ipon, malinaw na patakaran.","Layunin para sa iyong ipon."],
    fund: ["Basahin ang kondisyon bago magbigay.",
      "May hiwalay na escrow bawat campaign. Fixed ang benepisyaryo, tatlong approver, 0–10% creator share at deadline. Walang tunay na halaga ang Testnet XLM.",
      "Proof pagkatapos ng funding. Dalawa sa tatlong wallet ang mag-aapruba sa parehong dokumento bago ang deadline. Hindi katibayan ng aktuwal na delivery ang hash at approval.",
      "Iba ang shared Disaster Vault: dalawang approval, 20-ledger wait at rolling 24-hour cap na sinusuri sa execution. Quorum din ang pause at unpause. Managed Testnet keys ang ginagamit.",
      "Kung walang dalawang timely approval, puwedeng i-claim ang kontribusyon pagkatapos ng review deadline. Hindi automatic at hindi kasama ang network fee. Walang donor refund ang Disaster Vault."],
    circle: ["Pamilyar na tradisyon na may nakikitang patakaran.",
      "Buong deposito muna sa Arisan Rooms: bilang ng miyembro na minultiply sa share. Suriin ang total bago sumali. Iba ito sa hulog kada ikot.",
      "May commit, reveal at finalize pagkatapos ng deadline. Hindi direktang pinipili ng caller ang winner. May limitasyon ang draw.",
      "May leave, cancel at refund sa Open room ayon sa kondisyon. Kailangan ng recovery ang expired room. May hiwalay na eligibility at oras ang emergency recovery.",
      "Fixed roster at hulog kada ikot ang legacy Paluwagan. Hinihintay ang bayad ng lahat at walang cancel o refund flow. Suriin ang mode."],
    grow: ["Paparating para sa araw-araw. May Testnet contract ngayon.",
      "Valueless XLM sa isang vault bawat wallet. Target o unlock condition ang basehan ng release. Halimbawa lang ang currency values.",
      "Local envelopes lang ang dagdag na goals. Hindi hiwalay na kontrata o lock. Contract target pa rin ang basehan ng release.",
      "Wala pang yield, USDC conversion, bank withdrawal o independent audit. Kumpirmahin ang availability bago gumamit ng tunay na pondo.",
      "Basahin ang public documentation. Coming soon ang everyday Smart Savings."],
    soon: "Paparating", how: "Kasalukuyang patakaran", actions: ["Tingnan ang transparency","Tingnan ang Arisan Rooms","Tingnan ang Smart Savings"],
  },
  vi: {
    intro: ["Tìm hiểu","Quy tắc rõ ràng. Bước đi tự tin.","Ba hướng dẫn về Testnet hiện tại."," phút đọc"],
    titles: ["Quyên góp minh bạch.","Tiết kiệm chung với quy tắc rõ ràng.","Mục tiêu tiết kiệm của bạn."],
    fund: ["Đọc điều kiện trước khi đóng góp.",
      "Mỗi campaign có escrow riêng. Người nhận, ba approver, phần người tạo 0–10% và thời hạn được khóa khi tạo. XLM Testnet không có giá trị tiền thật.",
      "Proof gửi sau khi funding đóng. Hai trong ba ví phải duyệt cùng tài liệu trước thời hạn. Hash và phê duyệt không chứng minh giao hỗ trợ thực tế.",
      "Disaster Vault chung có hai phê duyệt, chờ 20 ledger và hạn mức 24 giờ kiểm tra lại khi thực thi. Pause và unpause cần quorum. Khóa Testnet do dịch vụ quản lý.",
      "Không có hai phê duyệt đúng hạn thì donor tự yêu cầu hoàn khoản góp sau review deadline. Không tự động và không hoàn network fee. Disaster Vault không có donor refund."],
    circle: ["Truyền thống tiết kiệm với quy tắc minh bạch.",
      "Arisan Rooms yêu cầu tiền góp đầy đủ trước: số thành viên nhân phần góp. Kiểm tra tổng trước khi tham gia. Khác với góp từng vòng.",
      "Thành viên commit, reveal và finalize sau thời hạn. Caller không chọn trực tiếp người thắng. Cơ chế có giới hạn.",
      "Open room có leave, cancel và refund theo điều kiện. Room hết hạn cần phục hồi. Emergency recovery có điều kiện và thời gian riêng.",
      "Paluwagan cũ có roster cố định và góp mỗi vòng. Chờ mọi người trả và chưa có cancel hay refund. Kiểm tra mode bạn mở."],
    grow: ["Sắp ra mắt cho hằng ngày. Có Testnet contract riêng.",
      "XLM không có giá trị trong một vault mỗi ví. Target hoặc unlock quyết định release. Currency values chỉ minh họa.",
      "Goal bổ sung là envelope cục bộ. Không phải hợp đồng hay lock độc lập. Contract target vẫn quyết định release.",
      "Yield, USDC conversion, rút ngân hàng và kiểm toán độc lập chưa tích hợp. Xác nhận availability trước khi dùng tiền thật.",
      "Đọc tài liệu công khai về contract thử nghiệm. Everyday Smart Savings sắp ra mắt."],
    soon: "Sắp ra mắt", how: "Quy tắc hiện tại", actions: ["Xem minh bạch","Khám phá Arisan Rooms","Xem Smart Savings"],
  },
};
function base(title: string, eyebrow: string, p: string[]): BaseTopic { return { title, eyebrow, lede: p[0], p1: p[1], p2: p[2], p3: p[3], promise: p[4] }; }
function build(c: Copy): LearnLang {
  return { nav: { home: "Home", vaults: "Vaults", learn: c.intro[0], activity: "Activity", you: "You" }, indexEyebrow: c.intro[0], indexTitle: c.intro[1], indexSub: c.intro[2], readTime: c.intro[3],
    cards: LEARN_TOPICS.map((id,i) => ({ id, pose: i === 0 ? "point" : i === 1 ? "wave" : "think", kicker: ["DONATIONS","ARISAN / PALUWAGAN","SMART SAVINGS"][i], title: c.titles[i], blurb: [c.fund[0],c.circle[0],c.grow[0]][i], mins: 2 })),
    fund: { ...base(c.titles[0],"TESTNET · DONATIONS",c.fund), cases: [], stats: [{ k: "Campaign quorum",v:"2 / 3" }, { k: "Disaster wait",v:"20 ledgers" }, { k:"Network",v:"Testnet" }] },
    circle: { ...base(c.titles[1],"TESTNET · ARISAN / PALUWAGAN",c.circle), cases: [], glossary: [{ lang:"EN",word:"Saving circle" },{ lang:"TL",word:"Paluwagan" },{ lang:"ID",word:"Arisan" },{ lang:"VI",word:"Chơi hụi" }] },
    grow: { ...base(c.titles[2],"SMART SAVINGS · " + c.soon.toUpperCase(),c.grow), apy:{label:"Availability",value:c.soon}, stack:[{t:"One Testnet vault",s:c.grow[1]},{t:"Local goal envelopes",s:c.grow[2]},{t:"Current limits",s:c.grow[3]}] },
  };
}
function extra(c: Copy): LearnXLang {
  const steps = (p:string[],icons:string[]) => [1,2,3].map((i) => ({icon:icons[i-1],t:String(i).padStart(2,"0"),s:p[i]}));
  return { howHeading:c.how, fund:{steps:steps(c.fund,["hand","jar","ledger"]),cta:{label:c.actions[0],sub:"Stellar Testnet",icon:"jar"}},circle:{steps:steps(c.circle,["handshake","calendar","padlock"]),cta:{label:c.actions[1],sub:"Stellar Testnet",icon:"handshake"}},grow:{steps:steps(c.grow,["vault","sprout","flag"]),cta:{label:c.actions[2],sub:c.soon,icon:"sprout"}} };
}
export const LEARN: Record<Locale,LearnLang> = { en:build(COPY.en),tl:build(COPY.tl),id:build(COPY.id),vi:build(COPY.vi) };
export const LEARN_X: Record<Locale,LearnXLang> = { en:extra(COPY.en),tl:extra(COPY.tl),id:extra(COPY.id),vi:extra(COPY.vi) };
