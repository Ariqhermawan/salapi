import type { Locale } from "./config";

// Copy only. No conversion, signing, receipt or authorization behavior here.
const messages = {
  "1 · Amount": { id: "1 · Nominal", tl: "1 · Halaga", vi: "1 · Số lượng" },
  "2 · Review": { id: "2 · Tinjau", tl: "2 · Suriin", vi: "2 · Kiểm tra" },
  "3 · Receipt": { id: "3 · Bukti transaksi", tl: "3 · Resibo", vi: "3 · Biên nhận" },
  "Privacy and comment (optional)": { id: "Privasi dan komentar (opsional)", tl: "Privacy at komento (opsyonal)", vi: "Quyền riêng tư và bình luận (tùy chọn)" },
  "Campaign details": { id: "Detail campaign", tl: "Mga detalye ng campaign", vi: "Chi tiết chiến dịch" },
  "After reload, a recovered donor record defaults to anonymous with no comment or profile permission. Existing saved records are not changed. Recovery never resends funds.": {
    id: "Setelah reload, catatan donor yang dipulihkan otomatis anonim tanpa komentar atau izin profil. Catatan yang sudah tersimpan tidak diubah. Pemulihan tidak mengirim ulang dana.",
    tl: "Pagkatapos mag-reload, anonymous ang recovered donor record, walang komento o pahintulot sa profile. Hindi binabago ang naka-save na record. Hindi muling ipinapadala ang pondo.",
    vi: "Sau khi tải lại, bản ghi khôi phục mặc định ẩn danh, không có bình luận hoặc quyền công khai hồ sơ. Bản ghi đã lưu không đổi. Khôi phục không gửi lại tiền." },
  "Testnet reports a failed transaction. No donor badge was created. Check submission status before another attempt.": { id: "Testnet melaporkan transaksi gagal. Lencana donor tidak dibuat. Periksa status sebelum mencoba lagi.", tl: "Nabigo ang transaksyon ayon sa Testnet. Walang donor badge. Suriin muna ang status bago muling subukan.", vi: "Testnet báo giao dịch thất bại. Không tạo huy hiệu nhà tài trợ. Kiểm tra trạng thái trước khi thử lại." },
  "This receipt or account could not be verified. Inspect Activity and check your account. Do not send again.": { id: "Bukti atau akun belum bisa diverifikasi. Periksa Activity dan akun Anda. Jangan kirim lagi.", tl: "Hindi ma-verify ang resibo o account. Suriin ang Activity at account. Huwag magpadala muli.", vi: "Không thể xác minh biên lai hoặc tài khoản. Kiểm tra Activity và tài khoản. Không gửi lại." },
  "Back": { id: "Kembali", tl: "Bumalik", vi: "Quay lại" },
  "Test a donation": { id: "Uji donasi", tl: "Subukan ang donasyon", vi: "Thử quyên góp" },
  "Fictional cause, real Testnet transaction": { id: "Tujuan fiktif, transaksi Testnet nyata", tl: "Kathang-isip na layunin, aktuwal na Testnet transaction", vi: "Mục tiêu hư cấu, giao dịch Testnet thực sự" },
  "QA wallets receive test tokens, not the pictured organizer or NGO. Testnet XLM has no monetary value. This D4 contract does not send USDC.": {
    id: "Wallet QA menerima token uji, bukan organizer atau NGO di gambar. XLM Testnet tidak bernilai uang. Kontrak D4 ini tidak mengirim USDC.",
    tl: "QA wallets ang tumatanggap ng test tokens, hindi ang organizer o NGO sa larawan. Walang halagang pera ang Testnet XLM. Hindi nagpapadala ng USDC ang D4 contract na ito.",
    vi: "Ví QA nhận token thử nghiệm, không phải người tổ chức hay NGO trong ảnh. Testnet XLM không có giá trị tiền tệ. Hợp đồng D4 này không gửi USDC." },
  "Sign in with Google": { id: "Login dengan Google", tl: "Mag-sign in gamit ang Google", vi: "Đăng nhập bằng Google" },
  "Your account must be verified before donating.": { id: "Akun harus terverifikasi sebelum donasi.", tl: "Dapat ma-verify ang account bago mag-donate.", vi: "Tài khoản phải được xác minh trước khi quyên góp." },
  "Check account": { id: "Periksa akun", tl: "Suriin ang account", vi: "Kiểm tra tài khoản" },
  "Testnet donation confirmed": { id: "Donasi Testnet terkonfirmasi", tl: "Kumpirmado ang Testnet donation", vi: "Đã xác nhận quyên góp Testnet" },
  "Confirmed Testnet donor. Not a fiat donation or proof of delivery.": { id: "Donor Testnet terkonfirmasi. Bukan donasi fiat atau bukti penyaluran.", tl: "Kumpirmadong Testnet donor. Hindi fiat donation o patunay ng delivery.", vi: "Nhà tài trợ Testnet đã được xác nhận. Không phải quyên góp tiền pháp định hay bằng chứng bàn giao." },
  "A hash was returned. Confirmation is not established yet.": { id: "Hash tersedia. Konfirmasi transaksi belum dapat dipastikan.", tl: "May ibinalik na hash. Hindi pa tiyak ang kumpirmasyon.", vi: "Đã trả về hash. Chưa xác định được xác nhận giao dịch." },
  "View Testnet receipt": { id: "Lihat bukti Testnet", tl: "Tingnan ang Testnet receipt", vi: "Xem biên nhận Testnet" },
  "Your donor record is saved.": { id: "Catatan donor Anda tersimpan.", tl: "Naka-save ang donor record mo.", vi: "Đã lưu bản ghi nhà tài trợ của bạn." },
  "Verify and retry donor record only": { id: "Verifikasi dan ulangi catatan donor saja", tl: "I-verify at ulitin lamang ang donor record", vi: "Xác minh và chỉ thử lại bản ghi nhà tài trợ" },
  "Back to campaign": { id: "Kembali ke campaign", tl: "Bumalik sa campaign", vi: "Quay lại chiến dịch" },
  "Review Testnet donation": { id: "Tinjau donasi Testnet", tl: "Suriin ang Testnet donation", vi: "Xem lại quyên góp Testnet" },
  "Review before sending": { id: "Tinjau sebelum mengirim", tl: "Suriin bago ipadala", vi: "Xem lại trước khi gửi" },
  "Native Testnet XLM moves into this campaign's escrow. Your wallet also pays the Stellar network fee in XLM; the actual fee is on the receipt.": {
    id: "XLM Testnet masuk ke escrow campaign ini. Wallet Anda juga membayar biaya jaringan Stellar dalam XLM; biaya aktual ada di bukti transaksi.",
    tl: "Papasok ang native Testnet XLM sa escrow ng campaign na ito. Magbabayad din ang wallet mo ng Stellar network fee sa XLM; nasa receipt ang aktuwal na fee.",
    vi: "Testnet XLM gốc chuyển vào escrow của chiến dịch này. Ví của bạn cũng trả phí mạng Stellar bằng XLM; phí thực tế có trên biên nhận." },
  "Campaign": { id: "Campaign", tl: "Campaign", vi: "Chiến dịch" },
  "QA beneficiary": { id: "Penerima QA", tl: "QA beneficiary", vi: "Người nhận QA" },
  "Creator share": { id: "Bagian pembuat", tl: "Bahagi ng creator", vi: "Phần của người tạo" },
  "Public display": { id: "Tampilan publik", tl: "Pampublikong pagpapakita", vi: "Hiển thị công khai" },
  "Anonymous": { id: "Anonim", tl: "Hindi nagpapakilala", vi: "Ẩn danh" },
  "Wallet, @username and permitted photo": { id: "Wallet, @username dan foto yang diizinkan", tl: "Wallet, @username at pinahintulutang larawan", vi: "Ví, @username và ảnh được cho phép" },
  "Wallet only": { id: "Wallet saja", tl: "Wallet lamang", vi: "Chỉ ví" },
  "Your wallet, available @username and permitted profile photo will be public. Choose anonymous below to hide them from this feed.": {
    id: "Wallet, @username yang tersedia dan foto profil yang diizinkan akan tampil publik. Pilih anonim di bawah untuk menyembunyikannya dari catatan donor ini.",
    tl: "Magiging pampubliko ang wallet, available na @username at pinahintulutang profile photo mo. Piliin ang anonymous sa ibaba para itago ang mga ito sa feed na ito.",
    vi: "Ví, @username có sẵn và ảnh hồ sơ được cho phép sẽ hiển thị công khai. Chọn ẩn danh bên dưới để ẩn chúng khỏi danh sách này." },
  "Your donor entry will be anonymous. Stellar transactions remain public.": {
    id: "Catatan donor Anda akan anonim. Transaksi Stellar tetap publik.",
    tl: "Anonymous ang donor entry mo. Pampubliko pa rin ang Stellar transactions.",
    vi: "Bản ghi nhà tài trợ của bạn sẽ ẩn danh. Giao dịch Stellar vẫn công khai." },
  "Only your wallet and receipt link will appear in this feed. Your name and photo will not be published.": {
    id: "Hanya wallet dan tautan bukti transaksi yang tampil di catatan donor ini. Nama dan foto Anda tidak dipublikasikan.",
    tl: "Wallet at receipt link mo lamang ang makikita sa feed na ito. Hindi ipapakita ang pangalan at larawan mo.",
    vi: "Chỉ ví và liên kết biên nhận của bạn xuất hiện trong danh sách này. Tên và ảnh của bạn không được công khai." },
  "Two configured reviewers must approve the exact proof before release. No timely approval means the contract's refund rules apply. No real-world delivery is guaranteed.": {
    id: "Dua reviewer terkonfigurasi harus menyetujui bukti yang sama sebelum release. Jika tidak disetujui tepat waktu, aturan refund kontrak berlaku. Tidak menjamin penyaluran dunia nyata.",
    tl: "Dalawang naka-configure na reviewer ang dapat sumang-ayon sa eksaktong proof bago release. Kung walang napapanahong approval, susundin ang refund rules ng contract. Walang garantiyang aktuwal na delivery.",
    vi: "Hai người xét duyệt đã cấu hình phải phê duyệt đúng bằng chứng trước khi giải ngân. Nếu không có phê duyệt đúng hạn, áp dụng quy tắc hoàn tiền của hợp đồng. Không đảm bảo bàn giao ngoài đời thực." },
  "Waiting for Testnet…": { id: "Menunggu Testnet…", tl: "Naghihintay sa Testnet…", vi: "Đang chờ Testnet…" },
  "Confirm Testnet donation": { id: "Konfirmasi donasi Testnet", tl: "Kumpirmahin ang Testnet donation", vi: "Xác nhận quyên góp Testnet" },
  "Change amount": { id: "Ubah jumlah", tl: "Baguhin ang halaga", vi: "Đổi số lượng" },
  "Amount in native Testnet XLM": { id: "Jumlah dalam XLM Testnet", tl: "Halaga sa native Testnet XLM", vi: "Số lượng Testnet XLM gốc" },
  "Positive amounts, up to 7 decimal places. No dollar-to-XLM simulation.": { id: "Jumlah positif, maksimal 7 desimal. Tanpa simulasi konversi dolar ke XLM.", tl: "Positibong halaga, hanggang 7 decimal places. Walang simulasyon ng dollar-to-XLM.", vi: "Số lượng dương, tối đa 7 chữ số thập phân. Không mô phỏng chuyển đổi đô la sang XLM." },
  "Beneficiary share": { id: "Bagian penerima", tl: "Bahagi ng beneficiary", vi: "Phần của người nhận" },
  "Display anonymously in the donor feed": { id: "Tampilkan anonim di catatan donor", tl: "Ipakita nang hindi nagpapakilala sa donor feed", vi: "Hiển thị ẩn danh trong danh sách nhà tài trợ" },
  "Anonymous hides your wallet, name, photo and receipt link here. Transactions remain public on Stellar and timing or amounts can still identify you.": {
    id: "Anonim menyembunyikan wallet, nama, foto dan tautan bukti di sini. Transaksi Stellar tetap publik; waktu atau jumlah dapat mengidentifikasi Anda.",
    tl: "Itinatago ng anonymous ang wallet, pangalan, larawan at receipt link mo rito. Pampubliko pa rin ang Stellar transactions; maaari kang makilala sa oras o halaga.",
    vi: "Ẩn danh che ví, tên, ảnh và liên kết biên nhận tại đây. Giao dịch trên Stellar vẫn công khai; thời điểm hoặc số lượng vẫn có thể nhận diện bạn." },
  "Also publish my available @username and permitted profile photo for this donation": {
    id: "Izinkan @username dan foto profil yang diizinkan tampil publik untuk donasi ini",
    tl: "Ipakita rin ang available na @username at pinahintulutang profile photo para sa donasyong ito",
    vi: "Cũng công khai @username có sẵn và ảnh hồ sơ được cho phép cho lần quyên góp này" },
  "Optional public comment": { id: "Komentar publik opsional", tl: "Opsyonal na pampublikong komento", vi: "Bình luận công khai tùy chọn" },
  "Maximum 500 UTF-8 bytes. Do not include private information; anonymous comments are still public.": {
    id: "Maksimal 500 byte UTF-8. Jangan sertakan informasi pribadi; komentar anonim tetap publik.",
    tl: "Hanggang 500 UTF-8 bytes. Huwag ilagay ang pribadong impormasyon; pampubliko pa rin ang anonymous comments.",
    vi: "Tối đa 500 byte UTF-8. Không thêm thông tin riêng tư; bình luận ẩn danh vẫn công khai." },
  "Check campaign availability": { id: "Periksa ketersediaan campaign", tl: "Suriin ang availability ng campaign", vi: "Kiểm tra tình trạng chiến dịch" },
  "The donor record is not saved yet. Check the receipt, then retry metadata only. Do not send again.": {
    id: "Catatan donor belum tersimpan. Periksa bukti, lalu ulangi metadata saja. Jangan kirim lagi.",
    tl: "Hindi pa naka-save ang donor record. Suriin ang receipt, saka ulitin lamang ang metadata. Huwag magpadala muli.",
    vi: "Chưa lưu bản ghi nhà tài trợ. Kiểm tra biên nhận, rồi chỉ thử lại metadata. Không gửi lại." },
  "Donor metadata could not be confirmed. No extra donation was sent.": {
    id: "Metadata donor belum dapat dipastikan. Tidak ada donasi tambahan yang dikirim.",
    tl: "Hindi makumpirma ang donor metadata. Walang karagdagang donasyong ipinadala.",
    vi: "Không thể xác nhận metadata nhà tài trợ. Không gửi thêm quyên góp." },
  "Submission status is unknown. Inspect Activity without sending again.": {
    id: "Status pengiriman belum pasti. Periksa Activity tanpa mengirim ulang.",
    tl: "Hindi tiyak ang submission status. Suriin ang Activity nang hindi nagpapadala muli.",
    vi: "Chưa rõ trạng thái gửi. Kiểm tra Activity mà không gửi lại." },
} as const;

export type CircleTestnetDonateMessage = keyof typeof messages;
export function circleTestnetDonateCopy(locale: Locale) {
  return (message: CircleTestnetDonateMessage): string => locale === "en" ? message : messages[message][locale];
}
