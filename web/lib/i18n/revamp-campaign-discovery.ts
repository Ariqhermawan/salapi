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
  "Campaign basics": ["Mga detalye ng campaign", "Dasar campaign", "Thông tin chiến dịch"],
  "Start a campaign": ["Magsimula ng campaign", "Mulai campaign", "Tạo chiến dịch"],
  "Bring your cause to the community.": ["Ibahagi sa komunidad ang iyong adhikain.", "Bagikan campaign-mu kepada komunitas.", "Chia sẻ chiến dịch của bạn với cộng đồng."],
  "Funding terms": ["Mga tuntunin sa pondo", "Ketentuan pendanaan", "Điều khoản tài trợ"],
  "Reviewers": ["Mga tagasuri", "Reviewer", "Người duyệt"],
  "Name your cause": ["Pangalan ng iyong cause", "Beri nama campaign", "Đặt tên chiến dịch"],
  "Set payout and funding dates": ["Itakda ang tatanggap at mga petsa", "Atur penerima dan tanggal pendanaan", "Chọn người nhận và ngày tài trợ"],
  "Choose three distinct reviewers": ["Pumili ng tatlong magkaibang tagasuri", "Pilih tiga reviewer yang berbeda", "Chọn ba người duyệt khác nhau"],
  "These Testnet contract terms become fixed after creation.": ["Hindi na mababago ang mga tuntunin ng Testnet contract pagkatapos gawin.", "Ketentuan kontrak Testnet ini terkunci setelah campaign dibuat.", "Các điều khoản hợp đồng Testnet này sẽ cố định sau khi tạo."],
  "After creation, add a public gallery of organizer photos from the campaign page. These photos are not delivery proof.": ["Pagkatapos gawin, magdagdag ng pampublikong gallery ng mga larawan sa page ng campaign. Hindi patunay ng paghahatid ang mga larawang ito.", "Setelah dibuat, tambahkan galeri foto organizer dari halaman campaign. Foto ini bukan bukti penyaluran.", "Sau khi tạo, hãy thêm thư viện ảnh công khai của ban tổ chức từ trang chiến dịch. Ảnh này không phải bằng chứng giải ngân."],
  "Back": ["Bumalik", "Kembali", "Quay lại"],
  "Continue": ["Magpatuloy", "Lanjut", "Tiếp tục"],
  "Review campaign terms": ["Suriin ang mga tuntunin", "Tinjau ketentuan campaign", "Xem lại điều khoản chiến dịch"],
  "1. Name your cause": ["1. Pangalan ng iyong cause", "1. Beri nama campaign", "1. Đặt tên chiến dịch"],
  "Beneficiary public wallet": ["Public wallet ng benepisyaryo", "Wallet publik penerima", "Ví công khai của người thụ hưởng"],
  "Creator share, 0 to 10%": ["Bahagi ng creator, 0 hanggang 10%", "Bagian kreator, 0–10%", "Phần của người tạo, 0–10%"],
  "2. Funding closes": ["2. Pagtatapos ng pagpopondo", "2. Batas akhir pendanaan", "2. Hạn kết thúc tài trợ"],
  "Review closes": ["Pagtatapos ng pagsusuri", "Batas akhir peninjauan", "Hạn kết thúc xét duyệt"],
  "3. Approver 1 public wallet": ["3. Public wallet ng tagasuri 1", "3. Wallet publik reviewer 1", "3. Ví công khai người duyệt 1"],
  "Approver 2 public wallet": ["Public wallet ng tagasuri 2", "Wallet publik reviewer 2", "Ví công khai người duyệt 2"],
  "Approver 3 public wallet": ["Public wallet ng tagasuri 3", "Wallet publik reviewer 3", "Ví công khai người duyệt 3"],
  "The creator share is not a Salapi platform fee.": ["Hindi ito bayad sa platform ng Salapi.", "Bagian kreator ini bukan biaya platform Salapi.", "Phần của người tạo không phải phí nền tảng Salapi."],
  "Dates use your local timezone. Proof review starts after funding closes.": ["Gagamitin ang lokal na timezone mo. Magsisimula ang pagsusuri ng proof pagkatapos ng pagpopondo.", "Tanggal mengikuti zona waktu lokalmu. Peninjauan bukti dimulai setelah pendanaan ditutup.", "Ngày giờ dùng múi giờ địa phương của bạn. Việc xét bằng chứng bắt đầu sau khi kết thúc tài trợ."],
  "Enter a campaign name.": ["Maglagay ng pangalan ng campaign.", "Masukkan nama campaign.", "Nhập tên chiến dịch."],
  "Funding must end in the future. Review must end after funding.": ["Dapat nasa hinaharap ang pagtatapos ng pondo. Dapat matapos ang pagsusuri pagkatapos nito.", "Batas pendanaan harus di masa depan. Batas peninjauan harus setelah pendanaan.", "Hạn tài trợ phải ở tương lai. Hạn xét duyệt phải sau hạn tài trợ."],
  "Enter complete Stellar public wallet addresses beginning with G.": ["Masok ang buong Stellar public wallet address na nagsisimula sa G.", "Masukkan alamat wallet publik Stellar lengkap yang diawali G.", "Nhập đầy đủ địa chỉ ví công khai Stellar bắt đầu bằng G."],
  "Choose three different approver wallets.": ["Pumili ng tatlong magkaibang wallet ng tagasuri.", "Pilih tiga wallet reviewer yang berbeda.", "Chọn ba ví người duyệt khác nhau."],
  "Creator share must be 0–10%, with at most 2 decimal places": ["Dapat 0–10% ang bahagi ng creator, hanggang 2 decimal lang.", "Bagian kreator harus 0–10%, maksimal 2 angka desimal.", "Phần của người tạo phải từ 0–10%, tối đa 2 chữ số thập phân."],
  "Creator share cannot exceed 10%": ["Bahagi ng creator ay hindi maaaring lumampas sa 10%.", "Bagian kreator tidak boleh lebih dari 10%.", "Phần của người tạo không được vượt quá 10%."],
} as const satisfies Record<string, readonly [string, string, string]>;

export function campaignDiscoveryCopy(locale: Locale) {
  return (key: keyof typeof CAMPAIGN_DISCOVERY_COPY): string => {
    const index = locale === "tl" ? 0 : locale === "id" ? 1 : locale === "vi" ? 2 : -1;
    return index === -1 ? key : CAMPAIGN_DISCOVERY_COPY[key][index];
  };
}
