import type { Locale } from "./config";

const en = {
  usernameHint: "Share your username or scan this code to receive Testnet XLM.",
  addressHint: "No username is available. Share this public Stellar address with a Stellar Testnet wallet. Salapi Send uses usernames.",
  usernameCaption: "Send Testnet XLM to my Salapi username.",
  addressCaption: "My public Stellar Testnet address. Testnet XLM only, no real money.",
  addressLabel: "Public Stellar Testnet address",
  addressScan: "Scan the Stellar address",
  shareUnavailable: "Sharing is unavailable in this browser. Select and copy the destination shown above.",
  guest: "Sign in to receive Testnet XLM in your personal wallet.",
  signIn: "Sign in",
  noWallet: "No saved wallet yet. Open Send to prepare your personal Testnet wallet.",
};
type Copy = typeof en;
const copies: Record<Locale, Copy> = {
  en,
  id: {
    usernameHint: "Bagikan username atau pindai kode untuk menerima Testnet XLM.",
    addressHint: "Username belum tersedia. Bagikan alamat publik Stellar ini ke pengguna dompet Stellar Testnet. Kirim di Salapi memakai username.",
    usernameCaption: "Kirim Testnet XLM ke username Salapi saya.",
    addressCaption: "Alamat publik Stellar Testnet saya. Hanya Testnet XLM, bukan uang sungguhan.",
    addressLabel: "Alamat publik Stellar Testnet",
    addressScan: "Pindai alamat Stellar",
    shareUnavailable: "Berbagi tidak tersedia di browser ini. Pilih dan salin tujuan yang ditampilkan di atas.",
    guest: "Login untuk menerima Testnet XLM di dompet pribadi Anda.",
    signIn: "Login",
    noWallet: "Belum ada dompet tersimpan. Buka Kirim untuk menyiapkan dompet Testnet pribadi Anda.",
  },
  tl: {
    usernameHint: "Ibahagi ang username o i-scan ang code para tumanggap ng Testnet XLM.",
    addressHint: "Wala pang available na username. Ibahagi ang pampublikong Stellar address sa gumagamit ng Stellar Testnet wallet. Username ang gamit ng Salapi Send.",
    usernameCaption: "Magpadala ng Testnet XLM sa aking Salapi username.",
    addressCaption: "Aking pampublikong Stellar Testnet address. Testnet XLM lang, walang totoong pera.",
    addressLabel: "Pampublikong Stellar Testnet address",
    addressScan: "I-scan ang Stellar address",
    shareUnavailable: "Hindi available ang sharing sa browser na ito. Piliin at kopyahin ang destinasyong nasa itaas.",
    guest: "Mag-sign in upang tumanggap ng Testnet XLM sa personal na wallet.",
    signIn: "Mag-sign in",
    noWallet: "Wala pang naka-save na wallet. Buksan ang Send upang ihanda ang personal na Testnet wallet.",
  },
  vi: {
    usernameHint: "Chia sẻ tên hoặc quét mã này để nhận Testnet XLM.",
    addressHint: "Chưa có tên người dùng. Chia sẻ địa chỉ Stellar công khai này với người dùng ví Stellar Testnet. Salapi Send sử dụng tên người dùng.",
    usernameCaption: "Gửi Testnet XLM tới tên người dùng Salapi của tôi.",
    addressCaption: "Địa chỉ Stellar Testnet công khai của tôi. Chỉ Testnet XLM, không phải tiền thật.",
    addressLabel: "Địa chỉ Stellar Testnet công khai",
    addressScan: "Quét địa chỉ Stellar",
    shareUnavailable: "Trình duyệt này không hỗ trợ chia sẻ. Chọn và sao chép đích hiển thị ở trên.",
    guest: "Đăng nhập để nhận Testnet XLM trong ví cá nhân.",
    signIn: "Đăng nhập",
    noWallet: "Chưa có ví đã lưu. Mở Send để chuẩn bị ví Testnet cá nhân.",
  },
};
export function receiveCopy(locale: Locale): Copy { return copies[locale] ?? en; }
