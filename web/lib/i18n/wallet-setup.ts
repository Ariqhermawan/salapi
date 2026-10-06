import type { Locale } from "./config";

const COPY = {
  title: ["Finish wallet setup", "Tapusin ang setup ng wallet", "Selesaikan penyiapan wallet", "Hoàn tất thiết lập ví"],
  intro: ["Your account needs a confirmed Stellar Testnet wallet before you can transact.", "Kailangan ng account mo ng kumpirmadong Stellar Testnet wallet bago mag-transaksyon.", "Akun kamu memerlukan wallet Stellar Testnet yang terkonfirmasi sebelum bertransaksi.", "Tài khoản cần ví Stellar Testnet đã xác nhận trước khi giao dịch."],
  retry: ["Retry wallet setup", "Subukan muli ang setup", "Coba lagi penyiapan wallet", "Thử lại thiết lập ví"],
  waiting: ["Preparing your Testnet wallet", "Inihahanda ang Testnet wallet mo", "Menyiapkan wallet Testnet kamu", "Đang chuẩn bị ví Testnet"],
  checking: ["Checking your saved wallet and Testnet account. No transfer or donation is being submitted.", "Sinusuri ang naka-save na wallet at Testnet account. Walang ipinapadalang transfer o donasyon.", "Memeriksa wallet tersimpan dan akun Testnet. Tidak ada transfer atau donasi yang dikirim.", "Đang kiểm tra ví đã lưu và tài khoản Testnet. Không gửi giao dịch chuyển tiền hay quyên góp."],
  unavailable: ["Wallet setup is not confirmed yet. Check your connection and retry, or sign in again. Your saved wallet will not be replaced.", "Hindi pa kumpirmado ang setup. Suriin ang koneksyon at subukan muli o mag-sign in. Hindi papalitan ang naka-save na wallet.", "Penyiapan wallet belum terkonfirmasi. Periksa koneksi dan coba lagi, atau login kembali. Wallet tersimpan tidak akan diganti.", "Thiết lập ví chưa được xác nhận. Kiểm tra kết nối và thử lại hoặc đăng nhập lại. Ví đã lưu không bị thay thế."],
  ready: ["Your Testnet wallet is ready", "Handa na ang Testnet wallet mo", "Wallet Testnet kamu siap", "Ví Testnet đã sẵn sàng"],
  continue: ["Continue", "Magpatuloy", "Lanjutkan", "Tiếp tục"],
  signin: ["Sign in again", "Mag-sign in muli", "Login kembali", "Đăng nhập lại"],
  preview: ["Local preview cannot create or fund wallets.", "Hindi puwedeng gumawa o pondohan ng wallet sa local preview.", "Preview lokal tidak dapat membuat atau mendanai wallet.", "Bản xem trước cục bộ không thể tạo hoặc cấp vốn cho ví."],
  testnet: ["Testnet tokens only. No real money.", "Testnet token lang. Walang tunay na pera.", "Hanya token Testnet. Bukan uang nyata.", "Chỉ token Testnet. Không phải tiền thật."],
} as const;

export function walletSetupCopy(locale: Locale | undefined, key: keyof typeof COPY): string {
  return COPY[key][locale === "tl" ? 1 : locale === "id" ? 2 : locale === "vi" ? 3 : 0];
}
