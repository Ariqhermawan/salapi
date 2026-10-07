import type { Locale } from "./i18n/config";

const rows = {
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
