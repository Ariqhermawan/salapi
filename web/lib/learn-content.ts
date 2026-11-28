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
      "Upfront rooms: when a member joins, their full-cycle obligation (member count × share) is transferred into contract escrow. Review the total first. Start is available only after every seat is filled and everyone has funded.",
      "Installment rooms: joining transfers no contribution. Each later payment moves into contract escrow only when the member confirms it; members can pay in voluntary parts until the same full-cycle amount is funded by the deadline. No automatic debit is set up.",
      "Scheduled rooms also join without a deposit and use confirmed partial deposits, with draw dates and intervals agreed in advance. The host can Start only when every seat is filled and every member has funded the full cycle. The contract then holds the pool and pays one winner after each finalized round.",
      "These are separate room modes. Start is blocked until the full roster and funding are ready; the contract controls each draw. Testnet XLM has no monetary value. Check the room type and deadlines before joining."],
    grow: ["Available as an experimental Testnet feature. No real-money savings.",
      "The contract holds valueless Testnet XLM in one vault per wallet. Withdrawal follows its on-chain target or unlock condition; displayed fiat amounts are illustrative.",
      "Additional goal cards are local planning envelopes of one vault. They are not separate contracts or locks. The contract target still controls release.",
      "Yield, USDC conversion, bank withdrawals and independent audit are not integrated. Launch details and availability must be confirmed before using real funds.",
      "The redesigned app offers experimental Smart Savings to signed-in Testnet wallet owners. Read the public documentation for contract details and current limits."],
    soon: "Experimental Testnet", how: "Current rules", actions: ["View public transparency","Explore Arisan Rooms","See Smart Savings"],
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
      "Mode setoran penuh: saat anggota bergabung, seluruh kewajiban siklusnya (jumlah anggota × bagian) langsung ditransfer ke escrow kontrak. Tinjau totalnya dulu. Room baru bisa dimulai setelah semua kursi terisi dan semua anggota sudah menyetor.",
      "Mode cicilan: saat bergabung belum ada kontribusi yang ditransfer. Setiap pembayaran berikutnya masuk ke escrow kontrak hanya setelah dikonfirmasi anggota; setoran sukarela dapat dicicil sampai kewajiban satu siklus terpenuhi sebelum tenggat. Tidak ada debit otomatis.",
      "Mode terjadwal juga bergabung tanpa setoran dan memakai setoran sebagian yang dikonfirmasi, dengan tanggal serta jarak kocokan yang disepakati lebih dulu. Host hanya bisa memulai setelah kursi penuh dan semua anggota melunasi kewajiban siklus. Setelah itu kontrak menahan pool dan membayar satu pemenang di tiap ronde yang difinalisasi.",
      "Ketiganya adalah mode room terpisah. Mulai terkunci sampai roster dan pendanaan lengkap; kontrak mengatur setiap kocokan. XLM Testnet tidak bernilai uang. Periksa jenis room dan tenggat sebelum bergabung."],
    grow: ["Tersedia sebagai fitur Testnet eksperimental. Tidak ada tabungan dengan uang nyata.",
      "Kontrak menyimpan XLM Testnet tanpa nilai uang dalam satu vault per wallet. Penarikan mengikuti target atau kondisi unlock on-chain; nilai fiat yang ditampilkan hanya ilustrasi.",
      "Kartu tujuan tambahan adalah envelope perencanaan lokal dari satu vault. Kartu itu bukan kontrak atau kunci terpisah. Target kontrak tetap menentukan pencairan.",
      "Yield, konversi USDC, penarikan bank dan audit independen belum terintegrasi. Pastikan detail peluncuran dan ketersediaan sebelum memakai dana nyata.",
      "Aplikasi Salapi menyediakan Smart Savings eksperimental untuk pemilik wallet Testnet yang sudah masuk. Baca dokumentasi publik untuk detail kontrak dan batasannya."],
    soon: "Testnet eksperimental", how: "Aturan saat ini", actions: ["Lihat transparansi publik","Jelajahi Arisan Rooms","Lihat Smart Savings"],
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
      "Upfront na room: kapag sumali ang miyembro, inililipat agad sa contract escrow ang buong obligasyon para sa cycle (dami ng miyembro × share). Suriin muna ang kabuuan. Makakapag-Start lang kapag puno ang roster at bayad na ang lahat.",
      "Installment na room: walang contribution na inililipat sa pagsali. Mapupunta lang sa contract escrow ang bawat kasunod na hulog kapag kinumpirma ito ng miyembro; puwedeng hulugan hanggang mabuo ang buong cycle bago ang deadline. Walang automatic debit.",
      "Scheduled na room: walang deposit sa pagsali at gumagamit din ng mga hulog na kinukumpirma ng miyembro; pinagkakasunduan muna ang mga petsa at pagitan ng bunutan. Makakapag-Start lang ang host kapag puno ang roster at fully funded ang bawat cycle. Pagkatapos, hahawakan ng contract ang pool at babayaran ang isang winner sa bawat finalized na round.",
      "Magkakaibang room mode ang mga ito. Naka-lock ang Start hangga't hindi kumpleto ang roster at pondo; ang contract ang nagpapatakbo sa bawat bunutan. Walang halagang pera ang Testnet XLM. Suriin ang mode at deadline bago sumali."],
    grow: ["Available bilang experimental Testnet feature. Walang real-money savings.",
      "Valueless Testnet XLM ang nasa iisang vault bawat wallet. Target o unlock condition sa kontrata ang batayan ng withdrawal; halimbawa lang ang fiat values.",
      "Local envelopes lang ang dagdag na goals. Hindi hiwalay na kontrata o lock. Contract target pa rin ang basehan ng release.",
      "Wala pang yield, USDC conversion, bank withdrawal o independent audit. Kumpirmahin ang availability bago gumamit ng tunay na pondo.",
      "May experimental Smart Savings ang Salapi para sa naka-sign-in na may-ari ng Testnet wallet. Basahin ang public documentation para sa detalye at limitasyon."],
    soon: "Experimental Testnet", how: "Kasalukuyang patakaran", actions: ["Tingnan ang transparency","Tingnan ang Arisan Rooms","Tingnan ang Smart Savings"],
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
      "Room trả trước: khi tham gia, thành viên chuyển toàn bộ nghĩa vụ cả chu kỳ (số thành viên × phần góp) vào escrow của hợp đồng. Hãy kiểm tra tổng trước. Chỉ được Start khi đủ chỗ và mọi người đã góp đủ.",
      "Room trả góp: khi tham gia chưa chuyển khoản góp nào. Mỗi lần nạp sau đó chỉ vào escrow khi thành viên xác nhận; có thể nạp từng phần cho đến khi đủ nghĩa vụ cả chu kỳ trước hạn. Không tự động trừ tiền.",
      "Room theo lịch cũng tham gia không cần deposit và dùng các khoản nạp từng phần có xác nhận; ngày và khoảng cách giữa các lượt được thống nhất trước. Host chỉ Start khi đủ chỗ và mọi thành viên đã góp đủ cả chu kỳ. Sau đó hợp đồng giữ pool và trả một người thắng sau mỗi vòng được chốt.",
      "Đây là các loại room riêng. Start bị khóa đến khi đủ thành viên và đủ tiền; hợp đồng điều khiển từng lượt quay. XLM Testnet không có giá trị tiền tệ. Hãy kiểm tra loại room và hạn góp trước khi tham gia."],
    grow: ["Đang có dưới dạng tính năng Testnet thử nghiệm. Không dùng tiền thật.",
      "Hợp đồng giữ XLM Testnet không có giá trị trong một vault mỗi ví. Target hoặc unlock on-chain quyết định rút tiền; số tiền fiat chỉ để minh họa.",
      "Goal bổ sung là envelope cục bộ. Không phải hợp đồng hay lock độc lập. Contract target vẫn quyết định release.",
      "Yield, USDC conversion, rút ngân hàng và kiểm toán độc lập chưa tích hợp. Xác nhận availability trước khi dùng tiền thật.",
      "Salapi cung cấp Smart Savings thử nghiệm cho chủ ví Testnet đã đăng nhập. Xem tài liệu công khai để biết chi tiết và giới hạn."],
    soon: "Testnet thử nghiệm", how: "Quy tắc hiện tại", actions: ["Xem minh bạch","Khám phá Arisan Rooms","Xem Smart Savings"],
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
