import type { Locale } from "./i18n/config";

const rows = {
  localBadge: ["Local preview", "Lokal na preview", "Preview lokal", "Bản xem trước cục bộ"],
  testnetBadge: ["Stellar Testnet", "Stellar Testnet", "Stellar Testnet", "Stellar Testnet"],
  personalHost: ["Your saved wallet is the host", "Host ang iyong naka-save na wallet", "Wallet tersimpanmu adalah host", "Ví đã lưu của bạn là chủ phòng"],
  personalMember: ["Your saved wallet is a member", "Miyembro ang iyong naka-save na wallet", "Wallet tersimpanmu adalah anggota", "Ví đã lưu của bạn là thành viên"],
  personalPublic: ["Your saved wallet is not a member", "Hindi miyembro ang iyong naka-save na wallet", "Wallet tersimpanmu bukan anggota", "Ví đã lưu của bạn chưa là thành viên"],
  demoHost: ["Guest view · shared demo host", "Guest view · shared demo host", "Tampilan tamu · host demo bersama", "Khách xem · chủ phòng demo dùng chung"],
  demoMember: ["Guest view · shared demo member", "Guest view · shared demo member", "Tampilan tamu · anggota demo bersama", "Khách xem · thành viên demo dùng chung"],
  demoPublic: ["Guest view · shared demo wallet", "Guest view · shared demo wallet", "Tampilan tamu · wallet demo bersama", "Khách xem · ví demo dùng chung"],
  unverified: ["Public view · personal wallet not verified", "Public view · hindi beripikado ang personal wallet", "Tampilan publik · wallet personal belum terverifikasi", "Xem công khai · ví cá nhân chưa được xác minh"],
  localHost: ["Local example host", "Host ng lokal na halimbawa", "Host contoh lokal", "Chủ phòng mẫu cục bộ"],
  localMember: ["Local example member", "Miyembro ng lokal na halimbawa", "Anggota contoh lokal", "Thành viên mẫu cục bộ"],
  localPublic: ["Local example viewer", "Tagatingin ng lokal na halimbawa", "Pengunjung contoh lokal", "Người xem mẫu cục bộ"],
  demoNotice: ["This is the shared Testnet demo wallet, not a verified personal membership. Sign in with your saved wallet to participate.", "Ito ang shared Testnet demo wallet, hindi beripikadong personal membership. Mag-sign in gamit ang naka-save mong wallet para sumali.", "Ini wallet demo Testnet bersama, bukan keanggotaan personal terverifikasi. Masuk dengan wallet tersimpanmu untuk berpartisipasi.", "Đây là ví demo Testnet dùng chung, chưa xác minh thành viên cá nhân. Đăng nhập bằng ví đã lưu để tham gia."],
  unverifiedNotice: ["A shared Testnet demo wallet does not establish your personal membership. Sign in with your saved wallet to participate.", "Hindi patunay ng personal membership ang shared Testnet demo wallet. Mag-sign in gamit ang naka-save mong wallet para sumali.", "Wallet demo Testnet bersama tidak membuktikan keanggotaan personalmu. Masuk dengan wallet tersimpanmu untuk berpartisipasi.", "Ví demo Testnet dùng chung chưa chứng minh thành viên cá nhân của bạn. Đăng nhập bằng ví đã lưu để tham gia."],
  localNotice: ["Example identity only. No personal membership or transaction is verified by this local preview.", "Halimbawang identity lamang. Walang personal membership o transaksyon na beripikado sa lokal na preview.", "Hanya identitas contoh. Pratinjau lokal ini tidak memverifikasi keanggotaan personal atau transaksi.", "Chỉ là danh tính mẫu. Bản xem trước cục bộ chưa xác minh thành viên cá nhân hay giao dịch."],
  demoYou: ["Shared demo wallet", "Shared demo wallet", "Wallet demo bersama", "Ví demo dùng chung"],
  localYou: ["Example wallet", "Halimbawang wallet", "Wallet contoh", "Ví mẫu"],
  nextStep: ["What happens next?", "Ano ang susunod?", "Langkah berikutnya", "Bước tiếp theo"],
  enterDraw: ["Enter this draw", "Sumali sa bunutan", "Ikut kocokan", "Tham gia lượt quay"],
  enterHelp: ["Members who have not received a payout enter before the entry deadline. This records a secret commitment, not another payment.", "Ang mga miyembrong hindi pa nababayaran ay sasali bago ang deadline. Secret commitment ito, hindi panibagong bayad.", "Anggota yang belum mendapat giliran ikut sebelum batas pendaftaran kocokan. Ini mencatat komitmen rahasia, bukan membayar lagi.", "Thành viên chưa nhận tiền tham gia trước hạn. Thao tác ghi cam kết bí mật, không phải thanh toán thêm."],
  entrySaved: ["Entry saved. Wait for the completion window.", "Naitala ang entry. Hintayin ang completion window.", "Keikutsertaan tercatat. Tunggu waktu konfirmasi kocokan.", "Đã ghi nhận tham gia. Chờ thời gian hoàn tất."],
  completeEntry: ["Complete my draw entry", "Kumpletuhin ang aking entry", "Konfirmasi ikut kocokan", "Hoàn tất lượt tham gia"],
  revealHelp: ["Complete your earlier entry before the deadline. This reveals the matching secret so the contract can include it in the draw. No new deposit is needed.", "Kumpletuhin ang naunang entry bago ang deadline. Inilalantad nito ang katugmang secret para maisama sa bunutan. Walang bagong deposito.", "Konfirmasi keikutsertaan sebelum batas waktu. Langkah ini membuka rahasia yang cocok agar kontrak memasukkannya ke kocokan. Tidak perlu setoran baru.", "Hoàn tất tham gia trước hạn. Bước này công bố bí mật khớp để hợp đồng đưa vào lượt quay. Không cần nộp thêm tiền."],
  entryComplete: ["Entry complete. Wait until the draw opens.", "Kumpleto ang entry. Hintaying magbukas ang bunutan.", "Keikutsertaan lengkap. Tunggu waktu kocokan dibuka.", "Đã hoàn tất tham gia. Chờ mở lượt quay."],
  missedEntry: ["You did not enter during the entry window. You cannot reveal in this round; follow the current draw and enter the next one if still eligible.", "Hindi ka sumali sa entry window. Hindi ka makaka-reveal sa round na ito; sundan ang bunutan at sumali sa susunod kung eligible pa.", "Kamu tidak ikut pada waktu pendaftaran. Kamu tidak bisa konfirmasi di putaran ini; ikuti hasilnya dan masuk putaran berikutnya jika masih berhak.", "Bạn chưa tham gia trong thời gian đăng ký. Không thể công bố bí mật ở vòng này; theo dõi kết quả và tham gia vòng sau nếu còn đủ điều kiện."],
  drawWinner: ["Draw winner", "Bunutin ang mananalo", "Kocok pemenang", "Quay chọn người nhận"],
  drawHelp: ["The draw window is open. Any member can finalize this round. The contract selects the recipient and sends the round pot; it is not an extra withdrawal step.", "Bukas na ang bunutan. Maaaring mag-finalize ang sinumang miyembro. Pipili ang kontrata at ipapadala ang round pot; hindi na kailangan ng hiwalay na withdrawal.", "Waktu kocokan sudah dibuka. Anggota mana pun bisa menyelesaikan putaran. Kontrak memilih penerima dan mengirim dana putaran, tanpa langkah penarikan tambahan.", "Đã mở lượt quay. Bất kỳ thành viên nào cũng có thể hoàn tất vòng. Hợp đồng chọn người nhận và gửi quỹ vòng, không cần bước rút riêng."],
  fallbackTitle: ["No completed entries: predictable fallback", "Walang kumpletong entry: predictable fallback", "Tidak ada konfirmasi peserta: fallback dapat diprediksi", "Không có lượt hoàn tất: phương án dự phòng có thể đoán trước"],
  fallbackHelp: ["The reveal window has ended with no valid reveals. This contract can still pay out using a predictable fallback, not a fresh random draw. It cannot reopen this round's entries. For future rounds, members must enter and complete their entries before the deadlines.", "Tapos na ang reveal window nang walang valid reveal. Maaaring magpayout gamit ang predictable fallback, hindi bagong random draw. Hindi na mabubuksan ang entries ng round. Sa susunod, sumali at kumpletuhin bago ang deadlines.", "Waktu konfirmasi telah berakhir tanpa reveal valid. Kontrak masih bisa mencairkan dana melalui fallback yang dapat diprediksi, bukan kocokan acak baru. Pendaftaran putaran ini tidak bisa dibuka ulang. Pada putaran berikutnya, anggota perlu ikut dan konfirmasi sebelum batas waktu.", "Đã hết hạn công bố mà không có bí mật hợp lệ. Hợp đồng vẫn có thể chi trả bằng phương án dự phòng có thể đoán trước, không phải lượt quay ngẫu nhiên mới. Không thể mở lại đăng ký vòng này. Các vòng sau phải tham gia và hoàn tất trước hạn."],
  fallbackAck: ["I understand this payout uses the predictable Testnet fallback, not a random draw.", "Nauunawaan kong predictable Testnet fallback ito, hindi random draw.", "Saya memahami pencairan ini memakai fallback Testnet yang dapat diprediksi, bukan kocokan acak.", "Tôi hiểu khoản chi trả này dùng phương án dự phòng Testnet có thể đoán trước, không phải quay ngẫu nhiên."],
  fallbackCta: ["Finalize fallback payout", "I-finalize ang fallback payout", "Selesaikan pencairan fallback", "Hoàn tất chi trả dự phòng"],
  oneRemaining: ["Only one member has not received a payout. This final round goes to that member, so there is no random choice left.", "Iisang miyembro na lang ang hindi pa nababayaran. Sa kanya ang huling round; wala nang pagpipiliang random.", "Tinggal satu anggota yang belum mendapat giliran. Putaran terakhir menjadi haknya, jadi tidak ada pilihan acak lagi.", "Chỉ còn một thành viên chưa nhận tiền. Vòng cuối thuộc về người đó, nên không còn lựa chọn ngẫu nhiên."],
  finalPayout: ["Complete final payout", "Kumpletuhin ang huling payout", "Selesaikan giliran terakhir", "Hoàn tất khoản chi trả cuối"],
  singleEntry: ["Only one member completed their entry. This round goes to that entrant; there is no random choice between multiple entries. Other unpaid members can enter a later round.", "Iisang miyembro ang nakakumpleto ng entry. Sa kanya ang round na ito; walang pagpipiliang random. Maaaring sumali sa susunod ang ibang hindi pa nababayaran.", "Hanya satu anggota menyelesaikan konfirmasi. Putaran ini menjadi hak peserta tersebut, tanpa pemilihan acak di antara beberapa peserta. Anggota yang belum menerima bisa ikut putaran berikutnya.", "Chỉ một thành viên hoàn tất tham gia. Vòng này thuộc về người đó, không có lựa chọn ngẫu nhiên giữa nhiều lượt. Người chưa nhận tiền có thể tham gia vòng sau."],
  completePayout: ["Complete round payout", "Kumpletuhin ang payout", "Selesaikan pencairan putaran", "Hoàn tất chi trả vòng"],
  alreadyPaid: ["You already received your payout. No further deposit is needed; follow the remaining rounds. You can still finalize a draw when it opens.", "Natanggap mo na ang payout. Wala nang depositong kailangan; sundan ang natitirang rounds. Maaari ka pa ring mag-finalize kapag bukas na.", "Kamu sudah menerima giliran. Tidak perlu setoran tambahan; ikuti putaran yang tersisa. Kamu tetap bisa menyelesaikan kocokan saat dibuka.", "Bạn đã nhận tiền. Không cần nộp thêm; theo dõi các vòng còn lại. Bạn vẫn có thể hoàn tất lượt quay khi mở."],
  guestDraw: ["Only verified room members can take draw actions. This view does not authorize a payment or select a winner.", "Mga beripikadong miyembro lang ang makakakilos sa bunutan. Hindi nito inaawtorisa ang bayad o pumipili ng panalo.", "Hanya anggota ruang terverifikasi yang bisa menjalankan kocokan. Tampilan ini tidak mengizinkan pembayaran atau memilih pemenang.", "Chỉ thành viên đã xác minh mới có thể thao tác quay. Màn hình này không cho phép thanh toán hoặc chọn người nhận."],
  entryDeadline: ["Enter before", "Sumali bago", "Ikut sebelum", "Tham gia trước"],
  revealDeadline: ["Complete entry before", "Kumpletuhin bago", "Konfirmasi sebelum", "Hoàn tất trước"],
  drawFrom: ["Draw opens", "Bukas ang bunutan", "Kocokan dibuka", "Mở lượt quay"],
  localTime: ["Times shown in your device's timezone. The contract controls the actual phase.", "Oras sa timezone ng device mo. Ang kontrata ang kumokontrol sa aktuwal na phase.", "Waktu mengikuti zona waktu perangkatmu. Fase sebenarnya ditentukan kontrak.", "Thời gian theo múi giờ thiết bị. Hợp đồng quyết định giai đoạn thực tế."],
  previewTiming: ["Local simulation: use the entry steps to advance. No on-chain schedule or payment runs here.", "Lokal na simulation: sundan ang entry steps para umusad. Walang on-chain schedule o bayad dito.", "Simulasi lokal: jalankan langkah keikutsertaan untuk melanjutkan. Tidak ada jadwal atau pembayaran on-chain di sini.", "Mô phỏng cục bộ: làm các bước tham gia để tiếp tục. Không chạy lịch hoặc thanh toán trên chuỗi."],
  deposited: ["Upfront deposit recorded", "Naitalang paunang deposito", "Setoran awal tercatat", "Tiền nộp trước đã ghi nhận"],
  depositAfterRefund: ["Contract deposit record after any refund", "Deposito sa kontrata matapos ang refund", "Catatan setoran kontrak setelah refund", "Bản ghi tiền nộp sau hoàn tiền"],
  refundedDepositNote: ["A refund can clear the contract's deposit record. Zero does not prove that a member originally contributed nothing; the original amount may no longer be available here.", "Maaaring mabura ng refund ang deposit record. Ang zero ay hindi patunay na walang orihinal na ambag; maaaring wala na rito ang dating halaga.", "Refund dapat menghapus catatan setoran kontrak. Angka nol bukan bukti anggota tidak pernah menyetor; nominal awal mungkin sudah tidak tersedia di sini.", "Hoàn tiền có thể xóa bản ghi tiền nộp. Số không không có nghĩa là thành viên chưa từng góp; số tiền ban đầu có thể không còn ở đây."],
  depositUnavailable: ["Deposit amount unavailable", "Hindi available ang halaga ng deposito", "Nominal setoran belum tersedia", "Chưa có số tiền nộp"],
  depositHistory: ["Deposit records are historical contributions, not each member's remaining wallet or pool balance.", "Ang deposito ay historical contribution, hindi natitirang wallet o pool balance ng miyembro.", "Catatan setoran adalah kontribusi historis, bukan saldo wallet atau sisa dana pool masing-masing anggota.", "Bản ghi là khoản đóng góp trước đây, không phải số dư ví hoặc quỹ còn lại của từng thành viên."],
  illustrative: ["Illustrative estimate", "Halimbawang pagtatantiya", "Estimasi ilustrasi", "Ước tính minh họa"],
  paidStatus: ["Received", "Natanggap", "Sudah menerima", "Đã nhận"],
  waitingStatus: ["Awaiting turn", "Naghihintay ng turn", "Menunggu giliran", "Chờ lượt"],
  enteredStatus: ["Entered", "Nakasali", "Sudah ikut", "Đã tham gia"],
  readyStatus: ["Entry complete", "Kumpleto ang entry", "Sudah konfirmasi", "Đã hoàn tất"],
  viewHistory: ["View payout history", "Tingnan ang payout history", "Lihat riwayat pencairan", "Xem lịch sử chi trả"],
  newCycle: ["Start a new arisan", "Magsimula ng bagong arisan", "Buat arisan baru", "Tạo vòng góp mới"],
  newCycleHelp: ["No more draws are needed for this cycle. Review the payouts below. For another cycle, create a new room; members must agree and fund it again. This does not automatically restart or charge anyone.", "Tapos na ang mga bunutan sa cycle. Suriin ang payouts sa ibaba. Para sa bagong cycle, gumawa ng bagong room; kailangang pumayag at magpondo muli ang mga miyembro. Walang awtomatikong restart o singil.", "Tidak ada kocokan lagi untuk siklus ini. Periksa riwayat di bawah. Untuk siklus berikutnya, buat ruang baru; anggota harus menyetujui dan mendanainya lagi. Tidak ada mulai ulang atau debit otomatis.", "Chu kỳ này không cần quay thêm. Xem lịch sử bên dưới. Để có chu kỳ mới, tạo phòng mới; thành viên phải đồng ý và nộp tiền lại. Không tự khởi động hay thu phí."],
  allRooms: ["All arisan rooms", "Lahat ng arisan rooms", "Daftar arisan", "Danh sách phòng"],
  home: ["Home", "Home", "Beranda", "Trang chủ"],
  protocolNote: ["Testnet uses commit/reveal, not a guaranteed manipulation-resistant lottery. With no valid reveals, its fallback is predictable. Do not use this prototype with real money.", "Commit/reveal ang Testnet, hindi garantisadong manipulation-resistant lottery. Kapag walang valid reveal, predictable ang fallback. Huwag gumamit ng tunay na pera.", "Testnet memakai commit/reveal, bukan undian yang dijamin tahan manipulasi. Tanpa reveal valid, fallback bisa diprediksi. Jangan gunakan prototipe ini dengan uang nyata.", "Testnet dùng cam kết/công bố, không phải xổ số bảo đảm chống thao túng. Khi không có công bố hợp lệ, phương án dự phòng có thể đoán trước. Không dùng tiền thật."],
  localRandomNote: ["Local preview uses browser randomness among eligible entries. It is not an on-chain draw and moves no funds.", "Browser randomness sa eligible entries ang lokal na preview. Hindi ito on-chain na bunutan at walang perang gumagalaw.", "Preview lokal memakai pengacakan browser di antara peserta yang berhak. Ini bukan undian on-chain dan tidak memindahkan dana.", "Bản xem trước dùng ngẫu nhiên trên trình duyệt giữa người đủ điều kiện. Không quay trên chuỗi và không chuyển tiền."],
  notConfirmed: ["This transaction was not confirmed.", "Hindi nakumpirma ang transaksyong ito.", "Transaksi ini belum terkonfirmasi.", "Giao dịch này chưa được xác nhận."],
  revealClosed: ["The refreshed room is now ready for payout. Its reveal window has closed; no reveal was resubmitted.", "Handa na sa payout ang na-refresh na room. Sarado na ang reveal window nito; walang reveal na muling ipinadala.", "Ruang yang diperbarui kini siap untuk payout. Batas reveal sudah lewat; reveal tidak dikirim ulang.", "Phòng đã làm mới hiện sẵn sàng chi trả. Thời hạn reveal đã đóng; không gửi lại reveal."],
  commitClosed: ["The refreshed room is now in reveal phase. Its commit window has closed; no commit was resubmitted.", "Nasa reveal phase na ang na-refresh na room. Sarado na ang commit window nito; walang commit na muling ipinadala.", "Ruang yang diperbarui kini dalam fase reveal. Batas commit sudah lewat; commit tidak dikirim ulang.", "Phòng đã làm mới hiện ở giai đoạn reveal. Thời hạn commit đã đóng; không gửi lại commit."],
  commitPayout: ["The refreshed room is now ready for payout. Its commit window has closed; no commit was resubmitted.", "Handa na sa payout ang na-refresh na room. Sarado na ang commit window nito; walang commit na muling ipinadala.", "Ruang yang diperbarui kini siap untuk payout. Batas commit sudah lewat; commit tidak dikirim ulang.", "Phòng đã làm mới hiện sẵn sàng chi trả. Thời hạn commit đã đóng; không gửi lại commit."],
  advanced: ["The refreshed room has moved to another round. Review the current phase; no draw action was resubmitted.", "Lumipat na sa ibang round ang na-refresh na room. Suriin ang kasalukuyang phase; walang draw action na muling ipinadala.", "Ruang yang diperbarui sudah beralih putaran. Periksa fase saat ini; aksi undian tidak dikirim ulang.", "Phòng đã làm mới đã chuyển sang vòng khác. Kiểm tra giai đoạn hiện tại; không gửi lại thao tác quay."],
  closed: ["The refreshed room is closed. No draw action was resubmitted.", "Sarado na ang na-refresh na room. Walang draw action na muling ipinadala.", "Ruang yang diperbarui sudah ditutup. Aksi undian tidak dikirim ulang.", "Phòng đã làm mới đã đóng. Không gửi lại thao tác quay."],
} as const;

export function arisanRoomCopy(locale: Locale) {
  const index = ({ en: 0, tl: 1, id: 2, vi: 3 } as const)[locale];
  return Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[index]])) as Record<keyof typeof rows, string>;
}

type Identity = "personal" | "demo" | "unverified";
export function arisanViewerIdentity(room: { viewerIdentity?: string }): Identity {
  return room.viewerIdentity === "personal" || room.viewerIdentity === "demo" ? room.viewerIdentity : "unverified";
}
export function arisanViewerRole(room: { isHost: boolean; isMember: boolean; viewerIdentity?: Identity }, local: boolean, locale: Locale): string {
  const copy = arisanRoomCopy(locale);
  const role = room.isHost ? "Host" : room.isMember ? "Member" : "Public";
  if (local) return copy[`local${role}`];
  if (room.viewerIdentity === "personal") return copy[`personal${role}`];
  if (room.viewerIdentity === "demo") return copy[`demo${role}`];
  return copy.unverified;
}

type DrawRoom = { id: number; round: number; status: string; drawPhase: string | null };
/** Guidance describes a fresh contract-read phase, never the inferred cause
 * of an arbitrary error or a deadline on the browser's own clock. */
export function arisanDrawRecovery(action: string | undefined, before: DrawRoom | null, refreshed: DrawRoom | null, locale: Locale): string | null {
  const commit = action === "commit" || action === "friendsCommit";
  const reveal = action === "reveal" || action === "friendsReveal";
  if ((!commit && !reveal) || !before || !refreshed || before.id !== refreshed.id) return null;
  const copy = arisanRoomCopy(locale);
  if (refreshed.status === "Done" || refreshed.status === "Dissolved") return copy.closed;
  if (refreshed.status !== "Active") return null;
  if (refreshed.round !== before.round) return copy.advanced;
  if (reveal && refreshed.drawPhase === "Finalizable") return copy.revealClosed;
  if (commit && refreshed.drawPhase === "Reveal") return copy.commitClosed;
  if (commit && refreshed.drawPhase === "Finalizable") return copy.commitPayout;
  return null;
}
