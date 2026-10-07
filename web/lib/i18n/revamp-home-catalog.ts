import type { Locale } from "./config";

export const HOME_CATALOG_COPY = {
  "Campaign tools": ["Mga tool sa kampanya", "Alat campaign", "Công cụ chiến dịch"],
  "Fictional causes · no payment.": ["Kathang-isip na layunin · walang bayad.", "Tujuan fiktif · tanpa pembayaran.", "Mục tiêu hư cấu · không thanh toán."],
  "Fictional causes · Testnet XLM only.": ["Kathang-isip na layunin · Testnet XLM lang.", "Tujuan fiktif · hanya XLM Testnet.", "Mục tiêu hư cấu · chỉ XLM Testnet."],
  "All campaigns": ["Lahat ng kampanya", "Semua campaign", "Tất cả chiến dịch"],
  "Escrow and public proof on Stellar Testnet. No real money.": ["Escrow at pampublikong patunay sa Stellar Testnet. Walang totoong pera.", "Escrow dan bukti publik di Stellar Testnet. Bukan uang nyata.", "Ký quỹ và bằng chứng công khai trên Stellar Testnet. Không phải tiền thật."],
  "Checking other Testnet campaigns": ["Sinusuri ang iba pang kampanya sa Testnet", "Memeriksa campaign Testnet lainnya", "Đang kiểm tra các chiến dịch Testnet khác"],
  "Fictional causes · AI photos · QA Testnet donations when linked.": ["Kathang-isip na layunin · AI photos · QA Testnet donation kapag naka-link.", "Tujuan fiktif · foto AI · donasi QA Testnet jika terhubung.", "Mục tiêu hư cấu · ảnh AI · quyên góp QA Testnet khi liên kết."],
  "CROWDFUNDING · PROTOTYPE": ["PAGLIKOM NG PONDO · PROTOTYPE", "PENGGALANGAN DANA · PROTOTIPE", "GÂY QUỸ · NGUYÊN MẪU"],
  "Fictional causes · AI illustrations · no payment.": ["Kathang-isip na mga layunin · larawan ng AI · walang bayad.", "Tujuan fiktif · ilustrasi AI · tanpa pembayaran.", "Mục đích hư cấu · minh họa AI · không thanh toán."],
  "Fictional causes · AI photos · example ratings · no payment.": ["Kathang-isip na mga layunin · larawan ng AI · halimbawang rating · walang bayad.", "Tujuan fiktif · foto AI · rating contoh · tanpa pembayaran.", "Mục đích hư cấu · ảnh AI · đánh giá mẫu · không thanh toán."],
  "Category": ["Kategorya", "Kategori", "Danh mục"],
  "Example rating": ["Halimbawang rating", "Rating contoh", "Đánh giá mẫu"],
  "{count} example reviews": ["{count} halimbawang review", "{count} ulasan contoh", "{count} nhận xét mẫu"],
  "Example causes carousel": ["Mga halimbawang layunin", "Pilihan tujuan contoh", "Danh sách mục đích mẫu"],
  "Previous example cause": ["Naunang halimbawang layunin", "Tujuan contoh sebelumnya", "Mục đích mẫu trước"],
  "Next example cause": ["Susunod na halimbawang layunin", "Tujuan contoh berikutnya", "Mục đích mẫu tiếp theo"],
  "{current} of {count} example causes": ["{current} sa {count} halimbawang layunin", "{current} dari {count} tujuan contoh", "{current} trên {count} mục đích mẫu"],
  "Example progress": ["Halimbawang pag-unlad", "Progres contoh", "Tiến độ mẫu"],
  "{percent}% example progress. No donations collected.": ["{percent}% halimbawang pag-unlad. Walang donasyong nakolekta.", "{percent}% progres contoh. Tidak ada donasi terkumpul.", "{percent}% tiến độ mẫu. Chưa nhận quyên góp."],
  "Donate · local demo": ["Mag-donate · lokal na demo", "Donasi · simulasi lokal", "Quyên góp · mô phỏng cục bộ"],
  "View example cause: {title}": ["Tingnan ang halimbawang layunin: {title}", "Lihat tujuan contoh: {title}", "Xem mục đích mẫu: {title}"],
  "D4 Testnet campaigns": ["Mga kampanya sa D4 Testnet", "Kampanye D4 Testnet", "Chiến dịch D4 Testnet"],
  "Separate on-chain escrow and proof-review flow. Not the fictional examples above.": ["Hiwalay na escrow sa blockchain at pagsusuri ng patunay. Hindi ito ang mga kathang-isip na halimbawa sa itaas.", "Alur escrow on-chain dan tinjauan bukti terpisah. Bukan contoh fiktif di atas.", "Quy trình ký quỹ trên chuỗi và xét duyệt bằng chứng riêng. Không phải các ví dụ hư cấu ở trên."],
  "Separate escrow and proof-review flow. Local sample data here, not these example causes.": ["Hiwalay na escrow at pagsusuri ng patunay. Lokal na halimbawa rito, hindi ang mga layuning ito.", "Alur escrow dan tinjauan bukti terpisah. Data contoh lokal di sini, bukan tujuan contoh ini.", "Quy trình ký quỹ và xét duyệt bằng chứng riêng. Dữ liệu mẫu cục bộ ở đây, không phải các mục đích mẫu này."],
  "Start a campaign": ["Magsimula ng kampanya", "Mulai kampanye", "Tạo chiến dịch"],
  "Browse all example causes": ["Tingnan lahat ng halimbawang layunin", "Jelajahi semua tujuan contoh", "Xem tất cả mục đích mẫu"],
} as const satisfies Record<string, readonly [string, string, string]>;
export type HomeCatalogKey = keyof typeof HOME_CATALOG_COPY;
export function homeCatalogCopy(locale: Locale | undefined, key: HomeCatalogKey, vars?: Record<string, string | number>): string {
  const row = HOME_CATALOG_COPY[key];
  const value = locale === "tl" ? row[0] : locale === "id" ? row[1] : locale === "vi" ? row[2] : key;
  return vars ? value.replace(/\{(\w+)\}/g, (match, name: string) => name in vars ? String(vars[name]) : match) : value;
}
