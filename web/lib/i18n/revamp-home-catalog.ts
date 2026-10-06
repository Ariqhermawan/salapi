import type { Locale } from "./config";

export const HOME_CATALOG_COPY = {
  "CROWDFUNDING · PROTOTYPE": ["PAGLIKOM NG PONDO · PROTOTYPE", "PENGGALANGAN DANA · PROTOTIPE", "GÂY QUỸ · NGUYÊN MẪU"],
  "Fictional causes · AI illustrations · no payment.": ["Kathang-isip na mga layunin · larawan ng AI · walang bayad.", "Tujuan fiktif · ilustrasi AI · tanpa pembayaran.", "Mục đích hư cấu · minh họa AI · không thanh toán."],
  "Category": ["Kategorya", "Kategori", "Danh mục"],
  "Example progress": ["Halimbawang pag-unlad", "Progres contoh", "Tiến độ mẫu"],
  "{percent}% example progress. No donations collected.": ["{percent}% halimbawang pag-unlad. Walang donasyong nakolekta.", "{percent}% progres contoh. Tidak ada donasi terkumpul.", "{percent}% tiến độ mẫu. Chưa nhận quyên góp."],
  "Donate · local demo": ["Mag-donate · lokal na demo", "Donasi · simulasi lokal", "Quyên góp · mô phỏng cục bộ"],
  "View example cause: {title}": ["Tingnan ang halimbawang layunin: {title}", "Lihat tujuan contoh: {title}", "Xem mục đích mẫu: {title}"],
  "D4 Testnet campaigns": ["Mga kampanya sa D4 Testnet", "Kampanye D4 Testnet", "Chiến dịch D4 Testnet"],
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
