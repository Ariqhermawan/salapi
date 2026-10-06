import type { Locale } from "./config";

const en = {
  title: "Account photo", description: "Your Google photo is used by default. A custom photo is saved to your account across devices.",
  upload: "Change photo", restore: "Restore Google photo", saving: "Saving photo…", saved: "Account photo saved.", restored: "Google photo restored.",
  hint: "JPEG, PNG or WebP, up to 512 KB. Images are resized and location metadata is removed.",
  alt: "Your account photo", retry: "Retry", unavailable: "Account photo could not be loaded. Try again.",
  unauthenticated: "Sign in to change your account photo.", account_changed: "Your account changed. Reload before changing the photo.",
  invalid_file: "Choose a valid, still JPEG, PNG or WebP image up to 512 KB.",
  storage_unavailable: "Photo storage is unavailable or not configured. Your previous photo has not been changed.",
  save_failed: "The photo change could not be confirmed. Reload to check your account before trying again.",
  google_unavailable: "This account has no Google photo to restore.",
};
type PhotoCopy = typeof en;
const copies: Record<Locale, PhotoCopy> = {
  en,
  id: {
    title: "Foto akun", description: "Foto Google digunakan secara default. Foto pilihan Anda disimpan ke akun dan tersedia di perangkat lain.",
    upload: "Ganti foto", restore: "Pulihkan foto Google", saving: "Menyimpan foto…", saved: "Foto akun tersimpan.", restored: "Foto Google dipulihkan.",
    hint: "JPEG, PNG atau WebP, maksimal 512 KB. Ukuran foto disesuaikan dan metadata lokasi dihapus.",
    alt: "Foto akun Anda", retry: "Coba lagi", unavailable: "Foto akun tidak dapat dimuat. Silakan coba lagi.",
    unauthenticated: "Masuk untuk mengganti foto akun.", account_changed: "Akun Anda berubah. Muat ulang sebelum mengganti foto.",
    invalid_file: "Pilih foto JPEG, PNG atau WebP yang valid, tidak bergerak, maksimal 512 KB.",
    storage_unavailable: "Penyimpanan foto tidak tersedia atau belum dikonfigurasi. Foto sebelumnya tidak diubah.",
    save_failed: "Perubahan foto belum dapat dikonfirmasi. Muat ulang untuk memeriksa akun sebelum mencoba lagi.",
    google_unavailable: "Akun ini tidak memiliki foto Google untuk dipulihkan.",
  },
  tl: {
    title: "Larawan ng account", description: "Larawan sa Google ang ginagamit bilang default. Ang pinili mong larawan ay naka-save sa account sa lahat ng device.",
    upload: "Palitan ang larawan", restore: "Ibalik ang larawan sa Google", saving: "Sine-save ang larawan…", saved: "Na-save ang larawan ng account.", restored: "Naibalik ang larawan sa Google.",
    hint: "JPEG, PNG o WebP, hanggang 512 KB. Inaayos ang laki at inaalis ang metadata ng lokasyon.",
    alt: "Larawan ng iyong account", retry: "Subukan muli", unavailable: "Hindi ma-load ang larawan. Subukan muli.",
    unauthenticated: "Mag-sign in para palitan ang larawan ng account.", account_changed: "Nagbago ang account. I-reload bago palitan ang larawan.",
    invalid_file: "Pumili ng wastong JPEG, PNG o WebP na hindi gumagalaw, hanggang 512 KB.",
    storage_unavailable: "Hindi available o hindi pa naka-configure ang storage. Hindi nabago ang dating larawan.",
    save_failed: "Hindi makumpirma ang pagbabago. I-reload para suriin ang account bago subukan muli.",
    google_unavailable: "Walang larawan sa Google na maibabalik para sa account na ito.",
  },
  vi: {
    title: "Ảnh tài khoản", description: "Ảnh Google được dùng mặc định. Ảnh tùy chọn được lưu vào tài khoản và dùng trên các thiết bị.",
    upload: "Đổi ảnh", restore: "Khôi phục ảnh Google", saving: "Đang lưu ảnh…", saved: "Đã lưu ảnh tài khoản.", restored: "Đã khôi phục ảnh Google.",
    hint: "JPEG, PNG hoặc WebP, tối đa 512 KB. Ảnh được đổi kích thước và xóa siêu dữ liệu vị trí.",
    alt: "Ảnh tài khoản của bạn", retry: "Thử lại", unavailable: "Không thể tải ảnh tài khoản. Vui lòng thử lại.",
    unauthenticated: "Đăng nhập để đổi ảnh tài khoản.", account_changed: "Tài khoản đã thay đổi. Tải lại trước khi đổi ảnh.",
    invalid_file: "Chọn ảnh JPEG, PNG hoặc WebP hợp lệ, không động, tối đa 512 KB.",
    storage_unavailable: "Bộ nhớ ảnh không khả dụng hoặc chưa được cấu hình. Ảnh trước chưa thay đổi.",
    save_failed: "Chưa thể xác nhận thay đổi. Tải lại để kiểm tra tài khoản trước khi thử lại.",
    google_unavailable: "Tài khoản này không có ảnh Google để khôi phục.",
  },
};
export function accountPhotoCopy(locale: Locale) { return copies[locale] ?? en; }
