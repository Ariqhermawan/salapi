import type { Locale } from "./config";

export const CAMPAIGN_DISCOVERY_COPY = {
  "Donation campaigns": ["Mga kampanya ng donasyon", "Campaign donasi", "Chiến dịch quyên góp"],
  "Donation discovery": ["Pagtuklas ng donasyon", "Jelajahi donasi", "Khám phá quyên góp"],
  "Browse examples": ["Tuklasin ang mga halimbawa", "Jelajahi contoh", "Khám phá ví dụ"],
  "Testnet campaigns": ["Mga kampanya sa Testnet", "Campaign Testnet", "Chiến dịch Testnet"],
  "Examples": ["Mga halimbawa", "Contoh", "Ví dụ"],
  "Home": ["Home", "Beranda", "Trang chủ"],
  "Categories, organizer profiles and updates. Fictional examples, no payments.": ["Mga kategorya, profile ng organizer at update. Mga kathang-isip na halimbawa, walang bayad.", "Kategori, profil organizer, dan pembaruan. Contoh fiktif, tanpa pembayaran.", "Danh mục, hồ sơ nhà tổ chức và cập nhật. Ví dụ hư cấu, không thanh toán."],
  "Separate D4 escrow in valueless Testnet XLM. Circles example totals are not contract balances.": ["Hiwalay na D4 escrow gamit ang Testnet XLM na walang halaga. Hindi balanse ng kontrata ang kabuuan ng mga halimbawa ng Circles.", "Escrow D4 terpisah dengan XLM Testnet tanpa nilai uang. Total contoh Circles bukan saldo kontrak.", "Ký quỹ D4 riêng bằng XLM Testnet không có giá trị tiền tệ. Tổng ví dụ Circles không phải số dư hợp đồng."],
  "Illustrative campaign photo": ["Larawang halimbawa ng kampanya", "Foto campaign ilustratif", "Ảnh chiến dịch minh họa"],
  "Fictional organizer example": ["Halimbawang kathang-isip na organizer", "Contoh penyelenggara fiktif", "Nhà tổ chức hư cấu mẫu"],
  "Illustrative profile photo, not a verified identity": ["Larawang profile na halimbawa, hindi beripikadong pagkakakilanlan", "Foto profil ilustratif, bukan identitas terverifikasi", "Ảnh hồ sơ minh họa, không phải danh tính đã xác minh"],
  "View example organizer profile": ["Tingnan ang halimbawang profile ng organizer", "Lihat contoh profil penyelenggara", "Xem hồ sơ nhà tổ chức mẫu"],
} as const satisfies Record<string, readonly [string, string, string]>;

export function campaignDiscoveryCopy(locale: Locale) {
  return (key: keyof typeof CAMPAIGN_DISCOVERY_COPY): string => {
    const index = locale === "tl" ? 0 : locale === "id" ? 1 : locale === "vi" ? 2 : -1;
    return index === -1 ? key : CAMPAIGN_DISCOVERY_COPY[key][index];
  };
}
