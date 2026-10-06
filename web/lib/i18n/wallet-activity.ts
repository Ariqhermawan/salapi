import type { Locale } from "./config";

const copy = {
  checking: ["Checking confirmed incoming and outgoing XLM and verified USDC.", "Sinusuri ang nakumpirmang papasok at palabas na XLM at verified USDC.", "Memeriksa XLM dan USDC terverifikasi yang masuk dan keluar.", "Kiểm tra XLM và USDC đã xác minh được gửi và nhận."],
  signedOut: ["Confirmed XLM and verified USDC transfers appear here for your saved Testnet wallet.", "Dito makikita ang nakumpirmang XLM at verified USDC transfer ng naka-save na Testnet wallet.", "Transfer XLM dan USDC terverifikasi muncul di sini untuk wallet Testnet kamu.", "Giao dịch XLM và USDC đã xác minh của ví Testnet đã lưu hiển thị tại đây."],
  confirmed: ["XLM and Circle-issued Testnet USDC only. Testnet tokens have no monetary value.", "XLM at Circle-issued Testnet USDC lang. Walang halagang pera ang Testnet tokens.", "Hanya XLM dan USDC Testnet dari Circle. Token Testnet tidak bernilai uang.", "Chỉ XLM và USDC Testnet do Circle phát hành. Token Testnet không có giá trị tiền tệ."],
  empty: ["No confirmed XLM or verified USDC transfers yet.", "Wala pang nakumpirmang XLM o verified USDC transfer.", "Belum ada transfer XLM atau USDC terverifikasi.", "Chưa có giao dịch XLM hoặc USDC đã xác minh."],
  emptyPage: ["No XLM or verified USDC transfers on this page.", "Walang XLM o verified USDC transfer sa pahinang ito.", "Tidak ada transfer XLM atau USDC terverifikasi di halaman ini.", "Không có giao dịch XLM hoặc USDC đã xác minh trên trang này."],
  sent: ["Sent {asset}", "Nagpadala ng {asset}", "Mengirim {asset}", "Đã gửi {asset}"],
  received: ["Received {asset}", "Nakatanggap ng {asset}", "Menerima {asset}", "Đã nhận {asset}"],
  amount: ["Token amount", "Halaga ng token", "Jumlah token", "Số lượng token"],
  units: ["Exact token units (7 decimals)", "Eksaktong token units (7 decimal)", "Unit token persis (7 desimal)", "Đơn vị token chính xác (7 chữ số thập phân)"],
  issuer: ["Verified issuer", "Verified issuer", "Issuer terverifikasi", "Nhà phát hành đã xác minh"],
  contract: ["Stellar Asset Contract", "Stellar Asset Contract", "Stellar Asset Contract", "Stellar Asset Contract"],
  fee: ["Network fee", "Network fee", "Biaya jaringan", "Phí mạng"],
  feePayer: ["Fee payer", "Nagbayad ng fee", "Pembayar biaya", "Người trả phí"],
  paidByYou: ["Paid by your wallet", "Binayaran ng iyong wallet", "Dibayar wallet kamu", "Ví của bạn trả"],
  paidByOther: ["Paid by another wallet", "Binayaran ng ibang wallet", "Dibayar wallet lain", "Ví khác trả"],
  feeUnavailable: ["Network fee unavailable", "Hindi available ang network fee", "Biaya jaringan belum tersedia", "Chưa có phí mạng"],
  feeScope: ["This is the total fee for the transaction, not a fee per movement. It includes Soroban resource charges after refunds, where applicable.", "Kabuuang fee ito ng transaksyon, hindi fee bawat movement. Kasama ang Soroban resources matapos ang refund kung naaangkop.", "Ini total biaya transaksi, bukan biaya tiap perpindahan. Termasuk biaya resource Soroban setelah refund jika berlaku.", "Đây là tổng phí giao dịch, không phải phí mỗi chuyển động. Bao gồm phí tài nguyên Soroban sau hoàn phí nếu có."],
  feeMissing: ["The fee receipt could not be loaded. No zero fee or payer is assumed.", "Hindi mabasa ang fee receipt. Walang ipinapalagay na zero fee o nagbayad.", "Bukti biaya belum dapat dimuat. Tidak diasumsikan biaya nol atau siapa pembayarnya.", "Không tải được biên nhận phí. Không giả định phí bằng 0 hoặc người trả."],
  feeBump: ["Fee-bump transaction", "Fee-bump transaction", "Transaksi fee-bump", "Giao dịch fee-bump"],
  feeReceipt: ["View network fee receipt", "Tingnan ang network fee receipt", "Lihat bukti biaya jaringan", "Xem biên nhận phí mạng"],
} as const;

export function activityCopy(locale: Locale | undefined) {
  const index = locale === "tl" ? 1 : locale === "id" ? 2 : locale === "vi" ? 3 : 0;
  return (key: keyof typeof copy, variables?: Record<string, string>) => copy[key][index].replace(/\{(\w+)\}/g, (match, name: string) => variables?.[name] ?? match);
}
