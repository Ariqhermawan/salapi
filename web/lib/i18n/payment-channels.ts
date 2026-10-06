import type { Locale } from "./config";
const copy = {
  methods: ["Payment method", "Paraan ng pagbabayad", "Metode pembayaran", "Phương thức thanh toán"],
  payoutMethods: ["Payout method", "Paraan ng payout", "Metode pencairan", "Phương thức chi trả"],
  bankWallet: ["Bank / e-wallet", "Bangko / e-wallet", "Bank / e-wallet", "Ngân hàng / ví điện tử"],
  local: ["Local simulation · disconnected", "Lokal na simulasyon · hindi konektado", "Simulasi lokal · belum terhubung", "Mô phỏng cục bộ · chưa kết nối"],
  readonly: ["Not connected · unavailable here", "Hindi konektado · hindi available rito", "Belum terhubung · tidak tersedia di sini", "Chưa kết nối · không khả dụng tại đây"],
  qrisPayout: ["Standard merchant QRIS here is payment-only. QRIS TUNTAS or an approved payout integration is not configured.", "Pambayad lang ang standard merchant QRIS dito. Hindi naka-configure ang QRIS TUNTAS o aprubadong payout integration.", "QRIS merchant standar di sini hanya untuk pembayaran masuk. QRIS TUNTAS atau integrasi pencairan resmi belum dikonfigurasi.", "QRIS thương mại tiêu chuẩn ở đây chỉ nhận thanh toán. Chưa cấu hình QRIS TUNTAS hoặc tích hợp chi trả được duyệt."],
  unsupported: ["This provider and method combination is unavailable in this demo.", "Hindi available sa demo ang kombinasyong provider at paraan na ito.", "Kombinasi provider dan metode ini tidak tersedia dalam simulasi.", "Cặp nhà cung cấp và phương thức này không khả dụng trong mô phỏng."],
  mayarPayout: ["Mayar merchant dashboard withdrawals exist, but Salapi end-user payout API capability is not verified or configured here.", "May withdrawal sa Mayar merchant dashboard, pero hindi nakumpirma o naka-configure dito ang payout API para sa Salapi user.", "Penarikan dashboard merchant Mayar tersedia, tetapi kemampuan API pencairan untuk pengguna Salapi belum diverifikasi atau dikonfigurasi di sini.", "Mayar có rút tiền trên bảng điều khiển thương mại, nhưng chưa xác minh hoặc cấu hình API chi trả cho người dùng Salapi ở đây."],
  native: ["Native method currency: {code}. Display preference: {display}. No currency conversion or payment occurs.", "Currency ng paraan: {code}. Display preference: {display}. Walang conversion o bayad.", "Mata uang native metode: {code}. Preferensi tampilan: {display}. Tidak ada konversi mata uang atau pembayaran.", "Tiền tệ gốc của phương thức: {code}. Tùy chọn hiển thị: {display}. Không quy đổi hay thanh toán."],
  cleared: ["Method changed. The amount was cleared; no conversion or payment occurred.", "Nagbago ang paraan. Na-clear ang halaga; walang conversion o bayad.", "Metode diubah. Jumlah dikosongkan; tidak ada konversi atau pembayaran.", "Đã đổi phương thức và xóa số tiền; không quy đổi hay thanh toán."],
  nativeAmount: ["Enter a valid amount in {code} before continuing.", "Maglagay ng valid na halaga sa {code} bago magpatuloy.", "Masukkan jumlah valid dalam {code} sebelum melanjutkan.", "Nhập số tiền hợp lệ bằng {code} trước khi tiếp tục."],
  exampleGcash: ["Example GCash destination · no account details", "Halimbawang GCash destination · walang account details", "Contoh tujuan GCash · tanpa detail akun", "Đích GCash mẫu · không có thông tin tài khoản"],
  notMoney: ["No real payment methods are connected. No provider request, account details or balance change.", "Walang totoong payment method na konektado. Walang provider request, account details o pagbabago sa balanse.", "Tidak ada metode pembayaran nyata yang terhubung. Tidak ada permintaan provider, detail akun, atau perubahan saldo.", "Không có phương thức thanh toán thật được kết nối. Không yêu cầu nhà cung cấp, thu thập tài khoản hay đổi số dư."],
} satisfies Record<string, readonly [string, string, string, string]>;
export type PaymentChannelCopyKey = keyof typeof copy;
export function paymentChannelText(locale: Locale, key: PaymentChannelCopyKey, values: Record<string, string> = {}): string {
  const index = ({ en: 0, tl: 1, id: 2, vi: 3 } as const)[locale];
  return copy[key][index].replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}
