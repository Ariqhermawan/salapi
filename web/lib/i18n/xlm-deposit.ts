import type { Locale } from "./config";

const en = {
  methods: "Choose how to add funds", provider: "Payment provider", faucet: "Testnet faucet", deposit: "Deposit XLM", paymentMethods: "GCash / QRIS",
  eyebrow: "FROM AN EXTERNAL WALLET", title: "Your wallet. Your address.", intro: "Receive native Testnet XLM directly into your Salapi wallet.",
  warning: "Testnet only. Do not send Mainnet XLM, USDC, or other assets. Testnet XLM has no monetary value.",
  previewTitle: "Preview, not a deposit address", previewBody: "This is an example wallet, not your personal wallet. Do not send any assets here. Your address and deposit QR are available in authenticated Testnet mode.",
  sampleAddress: "Example address", address: "Your public wallet address", scan: "Scan with a compatible Testnet wallet", qrHint: "The QR includes the Testnet network. Check the network again in the sending wallet.",
  copy: "Copy address", copied: "Address copied", copyError: "Could not copy. Select and copy the full address above manually.",
  unavailable: "Your wallet address is unavailable", unavailableBody: "Sign in with the account that owns the wallet, then retry. No shared demo wallet is used for deposits.",
  loadError: "Could not load your wallet address. Retry before sending anything.", loading: "Loading your wallet address...", retry: "Refresh address", signin: "Sign in", history: "View transaction history", explorer: "Check on Stellar Explorer",
  network: "Network", asset: "Asset", memo: "Memo", memoValue: "No memo configured", memoHint: "This is a personal wallet address. No memo or payment reference is supplied by Salapi.",
  stepsTitle: "Before you send", step1: "Choose Stellar Testnet in the sending wallet.", step2: "Copy the full address or scan the QR. Compare the address before confirming.", step3: "After the transaction is confirmed on-chain, check Activity. Opening this page does not credit your balance.",
  inactive: "If the account has not been activated on Testnet, use the separate Testnet faucet first. This page does not activate or fund accounts.",
};
type DepositCopy = typeof en;
export const XLM_DEPOSIT_COPY: Record<Locale, DepositCopy> = {
  en,
  id: {
    methods: "Pilih cara isi saldo", provider: "Provider pembayaran", faucet: "Faucet Testnet", deposit: "Deposit XLM", paymentMethods: "GCash / QRIS",
    eyebrow: "DARI WALLET EKSTERNAL", title: "Wallet Anda. Alamat Anda.", intro: "Terima XLM native Testnet langsung ke wallet Salapi Anda.",
    warning: "Khusus Testnet. Jangan kirim XLM Mainnet, USDC, atau aset lain. XLM Testnet tidak bernilai uang.",
    previewTitle: "Preview, bukan alamat deposit", previewBody: "Ini wallet contoh, bukan wallet pribadi Anda. Jangan kirim aset ke sini. Alamat dan QR deposit Anda tersedia di mode Testnet dengan akun yang sudah masuk.",
    sampleAddress: "Alamat contoh", address: "Alamat publik wallet Anda", scan: "Pindai dengan wallet Testnet yang kompatibel", qrHint: "QR menyertakan jaringan Testnet. Periksa lagi jaringannya di wallet pengirim.",
    copy: "Salin alamat", copied: "Alamat disalin", copyError: "Tidak bisa menyalin. Pilih dan salin alamat lengkap di atas secara manual.",
    unavailable: "Alamat wallet Anda belum tersedia", unavailableBody: "Masuk dengan akun pemilik wallet, lalu coba lagi. Deposit tidak menggunakan wallet demo bersama.",
    loadError: "Alamat wallet tidak berhasil dimuat. Coba lagi sebelum mengirim aset.", loading: "Memuat alamat wallet Anda...", retry: "Muat ulang alamat", signin: "Masuk", history: "Lihat riwayat transaksi", explorer: "Periksa di Stellar Explorer",
    network: "Jaringan", asset: "Aset", memo: "Memo", memoValue: "Tidak ada memo yang diatur", memoHint: "Ini alamat wallet pribadi. Salapi tidak memberikan memo atau referensi pembayaran.",
    stepsTitle: "Sebelum mengirim", step1: "Pilih Stellar Testnet di wallet pengirim.", step2: "Salin alamat lengkap atau pindai QR. Cocokkan alamat sebelum konfirmasi.", step3: "Setelah transaksi terkonfirmasi di blockchain, periksa Aktivitas. Membuka halaman ini tidak menambah saldo.",
    inactive: "Jika akun belum aktif di Testnet, gunakan faucet Testnet terpisah terlebih dahulu. Halaman ini tidak mengaktifkan atau mendanai akun.",
  },
  tl: {
    methods: "Piliin kung paano magdagdag", provider: "Payment provider", faucet: "Testnet faucet", deposit: "Mag-deposit ng XLM", paymentMethods: "GCash / QRIS",
    eyebrow: "MULA SA EXTERNAL WALLET", title: "Wallet mo. Address mo.", intro: "Tumanggap ng native Testnet XLM direkta sa iyong Salapi wallet.",
    warning: "Testnet lamang. Huwag magpadala ng Mainnet XLM, USDC, o ibang asset. Walang halaga bilang pera ang Testnet XLM.",
    previewTitle: "Preview, hindi deposit address", previewBody: "Halimbawang wallet ito, hindi ang personal mong wallet. Huwag magpadala ng asset dito. Makikita ang iyong address at deposit QR sa authenticated Testnet mode.",
    sampleAddress: "Halimbawang address", address: "Public address ng iyong wallet", scan: "I-scan gamit ang compatible na Testnet wallet", qrHint: "Kasama sa QR ang Testnet network. Suriin muli ang network sa nagpapadalang wallet.",
    copy: "Kopyahin ang address", copied: "Nakopya ang address", copyError: "Hindi makopya. Piliin at kopyahin nang manu-mano ang buong address sa itaas.",
    unavailable: "Hindi available ang iyong wallet address", unavailableBody: "Mag-sign in sa account na may-ari ng wallet at subukan muli. Hindi ginagamit ang shared demo wallet para sa deposit.",
    loadError: "Hindi ma-load ang wallet address. Subukan muli bago magpadala.", loading: "Nilo-load ang iyong wallet address...", retry: "I-refresh ang address", signin: "Mag-sign in", history: "Tingnan ang transaction history", explorer: "Suriin sa Stellar Explorer",
    network: "Network", asset: "Asset", memo: "Memo", memoValue: "Walang naka-configure na memo", memoHint: "Personal wallet address ito. Walang memo o payment reference na ibinibigay ang Salapi.",
    stepsTitle: "Bago magpadala", step1: "Piliin ang Stellar Testnet sa nagpapadalang wallet.", step2: "Kopyahin ang buong address o i-scan ang QR. Ihambing ang address bago kumpirmahin.", step3: "Kapag confirmed na on-chain, tingnan ang Activity. Hindi nagdadagdag ng balance ang pagbukas sa pahinang ito.",
    inactive: "Kung hindi pa activated sa Testnet ang account, gamitin muna ang hiwalay na Testnet faucet. Hindi nag-a-activate o nagpopondo ang pahinang ito.",
  },
  vi: {
    methods: "Chọn cách nạp", provider: "Nhà cung cấp thanh toán", faucet: "Faucet Testnet", deposit: "Nạp XLM", paymentMethods: "GCash / QRIS",
    eyebrow: "TỪ VÍ BÊN NGOÀI", title: "Ví của bạn. Địa chỉ của bạn.", intro: "Nhận XLM gốc trên Testnet trực tiếp vào ví Salapi của bạn.",
    warning: "Chỉ dùng Testnet. Không gửi XLM Mainnet, USDC hoặc tài sản khác. XLM Testnet không có giá trị tiền tệ.",
    previewTitle: "Bản xem trước, không phải địa chỉ nạp", previewBody: "Đây là ví ví dụ, không phải ví cá nhân của bạn. Không gửi tài sản đến đây. Địa chỉ và mã QR nạp của bạn có trong chế độ Testnet sau khi đăng nhập.",
    sampleAddress: "Địa chỉ ví dụ", address: "Địa chỉ công khai của ví bạn", scan: "Quét bằng ví Testnet tương thích", qrHint: "Mã QR có thông tin mạng Testnet. Kiểm tra lại mạng trong ví gửi.",
    copy: "Sao chép địa chỉ", copied: "Đã sao chép địa chỉ", copyError: "Không thể sao chép. Chọn và sao chép thủ công toàn bộ địa chỉ bên trên.",
    unavailable: "Địa chỉ ví của bạn chưa khả dụng", unavailableBody: "Đăng nhập bằng tài khoản sở hữu ví rồi thử lại. Không dùng ví demo chung để nạp.",
    loadError: "Không tải được địa chỉ ví. Thử lại trước khi gửi tài sản.", loading: "Đang tải địa chỉ ví của bạn...", retry: "Tải lại địa chỉ", signin: "Đăng nhập", history: "Xem lịch sử giao dịch", explorer: "Kiểm tra trên Stellar Explorer",
    network: "Mạng", asset: "Tài sản", memo: "Memo", memoValue: "Chưa cấu hình memo", memoHint: "Đây là địa chỉ ví cá nhân. Salapi không cung cấp memo hoặc mã tham chiếu thanh toán.",
    stepsTitle: "Trước khi gửi", step1: "Chọn Stellar Testnet trong ví gửi.", step2: "Sao chép toàn bộ địa chỉ hoặc quét mã QR. Đối chiếu địa chỉ trước khi xác nhận.", step3: "Khi giao dịch được xác nhận trên blockchain, xem Hoạt động. Mở trang này không làm tăng số dư.",
    inactive: "Nếu tài khoản chưa được kích hoạt trên Testnet, hãy dùng faucet Testnet riêng trước. Trang này không kích hoạt hoặc cấp vốn cho tài khoản.",
  },
};
export function xlmDepositCopy(locale: Locale): DepositCopy { return XLM_DEPOSIT_COPY[locale] ?? en; }
