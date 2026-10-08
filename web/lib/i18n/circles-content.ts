import type { Circle, CircleGalleryPhoto, CircleUpdate } from "../circles/types";
import type { Locale } from "./config";

type AuthoredText = readonly [en: string, tl: string, id: string, vi: string];
type AuthoredCause = { title: AuthoredText; purpose: AuthoredText; scene: AuthoredText; completed?: true };
export type CircleDisplayContent = Pick<Circle, "title" | "summary" | "story" | "updates" | "gallery" | "imageAlt">;

// Authored translations of the fixed fictional catalog, not a translation
// service for organizer content. English preserves the source except for the
// explicitly authored English Jakarta display title. Source identifiers and
// immutable contract titles are never rewritten.
const AUTHORED_CAUSES = {
  "tino-relief": {
    title: ["Tino survivors, Cebu - rebuild a fishing barangay", "Mga nakaligtas sa Tino sa Cebu - muling itayo ang barangay ng mga mangingisda", "Penyintas Tino di Cebu - bangun kembali kampung nelayan", "Người sống sót sau Tino ở Cebu - xây lại làng chài"],
    purpose: ["coastal families repairing boats and shared livelihood spaces", "pagkukumpuni ng mga bangka at pinagsasaluhang lugar ng kabuhayan ng mga pamilyang nasa baybayin", "keluarga pesisir memperbaiki perahu dan ruang mata pencaharian bersama", "các gia đình ven biển sửa thuyền và không gian sinh kế chung"],
    scene: ["fishing families repairing small boats beside a coastal village", "mga pamilyang mangingisda na nagkukumpuni ng maliliit na bangka sa tabi ng isang barangay sa baybayin", "keluarga nelayan memperbaiki perahu kecil di dekat desa pesisir", "các gia đình ngư dân sửa thuyền nhỏ cạnh một làng ven biển"],
  },
  "ate-mei-dialysis": {
    title: ["Ate Mei needs dialysis - 12 sessions to stabilize", "Kailangan ni Ate Mei ng dialysis - 12 sesyon para maging matatag ang kondisyon", "Ate Mei membutuhkan dialisis - 12 sesi untuk menstabilkan kondisi", "Ate Mei cần chạy thận - 12 buổi để ổn định tình trạng"],
    purpose: ["family-led support for dialysis-related care and clinic access", "suportang pinangungunahan ng pamilya para sa pangangalaga kaugnay ng dialysis at pagpunta sa klinika", "dukungan keluarga untuk perawatan terkait dialisis dan akses klinik", "hỗ trợ do gia đình tổ chức cho chăm sóc liên quan đến chạy thận và tiếp cận phòng khám"],
    scene: ["a caring family beside an adult patient in a dialysis clinic", "isang mapag-arugang pamilya sa tabi ng pasyenteng nasa hustong gulang sa klinika ng dialysis", "keluarga yang mendampingi pasien dewasa di klinik dialisis", "một gia đình chăm sóc bên cạnh bệnh nhân trưởng thành tại phòng khám chạy thận"],
  },
  "arisan-banjir-jakarta": {
    title: ["Banjir Jakarta Utara - dapur umum untuk 200 keluarga", "Baha sa North Jakarta - kusinang pangkomunidad para sa 200 pamilya", "Banjir Jakarta Utara - dapur umum untuk 200 keluarga", "Lũ lụt ở Bắc Jakarta - bếp cộng đồng cho 200 gia đình"],
    purpose: ["a North Jakarta community kitchen offering meals after flooding", "kusinang pangkomunidad sa North Jakarta na nagbibigay ng pagkain matapos ang baha", "dapur umum di Jakarta Utara yang menyediakan makanan setelah banjir", "bếp cộng đồng ở Bắc Jakarta cung cấp bữa ăn sau lũ lụt"],
    scene: ["volunteers preparing boxed meals in an Indonesian community kitchen", "mga boluntaryong naghahanda ng pagkaing nakakahon sa kusinang pangkomunidad sa Indonesia", "relawan menyiapkan nasi kotak di dapur umum Indonesia", "các tình nguyện viên chuẩn bị suất ăn đóng hộp trong bếp cộng đồng ở Indonesia"],
  },
  "barangay-library": {
    title: ["Build a barangay library for 300 kids in Bohol", "Magtayo ng aklatan sa barangay para sa 300 bata sa Bohol", "Bangun perpustakaan kampung untuk 300 anak di Bohol", "Xây thư viện khu phố cho 300 trẻ em ở Bohol"],
    purpose: ["books, shelves and welcoming reading space for a community library", "mga aklat, estante at maaliwalas na lugar ng pagbabasa para sa aklatang pangkomunidad", "buku, rak, dan ruang baca yang nyaman untuk perpustakaan komunitas", "sách, kệ và không gian đọc thân thiện cho thư viện cộng đồng"],
    scene: ["children reading storybooks inside a bright small community library", "mga batang nagbabasa ng kuwentong pambata sa loob ng maliit at maliwanag na aklatang pangkomunidad", "anak-anak membaca buku cerita di perpustakaan komunitas kecil yang terang", "trẻ em đọc truyện trong một thư viện cộng đồng nhỏ sáng sủa"],
  },
  "ofw-family-tuition": {
    title: ["Help Tita Ana keep her three kids in school this term", "Tulungan si Tita Ana na maipagpatuloy ang pag-aaral ng tatlo niyang anak ngayong termino", "Bantu Tita Ana agar ketiga anaknya tetap bersekolah semester ini", "Giúp Tita Ana giữ ba con tiếp tục đi học trong học kỳ này"],
    purpose: ["family support for school costs and learning supplies", "suporta sa pamilya para sa gastusin sa paaralan at mga kagamitan sa pag-aaral", "dukungan keluarga untuk biaya sekolah dan perlengkapan belajar", "hỗ trợ gia đình về chi phí học tập và đồ dùng học tập"],
    scene: ["a parent helping three schoolchildren prepare notebooks at home", "isang magulang na tumutulong sa tatlong mag-aaral na maghanda ng mga kuwaderno sa bahay", "orang tua membantu tiga anak sekolah menyiapkan buku tulis di rumah", "một phụ huynh giúp ba học sinh chuẩn bị vở tại nhà"],
  },
  "creator-baybayin": {
    title: ["Print 1,000 free Baybayin learning zines", "Maglimbag ng 1,000 libreng zine para matuto ng Baybayin", "Cetak 1,000 zine belajar Baybayin gratis", "In 1,000 tập san học Baybayin miễn phí"],
    purpose: ["printing and sharing handmade Baybayin learning zines", "paglilimbag at pagbabahagi ng mga gawang-kamay na zine para sa pag-aaral ng Baybayin", "mencetak dan membagikan zine belajar Baybayin buatan tangan", "in và chia sẻ các tập san học Baybayin làm thủ công"],
    scene: ["a Filipino artist arranging hand-drawn learning zines in a studio", "isang artistang Pilipino na nag-aayos ng mga zine sa pag-aaral na iginuhit sa kamay sa isang studio", "seniman Filipina menata zine belajar bergambar tangan di studio", "một nghệ sĩ Philippines sắp xếp các tập san học tập vẽ tay trong xưởng"],
  },
  "cebu-family-home": {
    title: ["A safer home for the Ramos family", "Mas ligtas na tahanan para sa pamilyang Ramos", "Rumah yang lebih aman untuk keluarga Ramos", "Ngôi nhà an toàn hơn cho gia đình Ramos"],
    purpose: ["repair materials for a safer coastal family home", "mga materyales sa pagkukumpuni para sa mas ligtas na tahanan ng pamilya sa baybayin", "bahan perbaikan agar rumah keluarga pesisir lebih aman", "vật liệu sửa chữa cho ngôi nhà gia đình ven biển an toàn hơn"],
    scene: ["a family carrying repair materials toward a modest coastal home", "isang pamilyang nagdadala ng mga materyales sa pagkukumpuni patungo sa payak na bahay sa baybayin", "keluarga membawa bahan perbaikan menuju rumah sederhana di pesisir", "một gia đình mang vật liệu sửa chữa đến ngôi nhà giản dị ven biển"],
  },
  "cebu-community-water": {
    title: ["A shared water point for a Cebu neighborhood", "Pinagsasaluhang gripo para sa isang pamayanan sa Cebu", "Titik air bersama untuk lingkungan di Cebu", "Điểm cấp nước chung cho một khu dân cư ở Cebu"],
    purpose: ["a shared neighborhood tap and clean-water containers", "pinagsasaluhang gripo sa pamayanan at mga lalagyan ng malinis na tubig", "keran bersama untuk lingkungan dan wadah air bersih", "vòi nước chung của khu dân cư và các bình chứa nước sạch"],
    scene: ["neighbors installing a shared tap beside clean-water containers", "mga magkakapitbahay na naglalagay ng pinagsasaluhang gripo sa tabi ng mga lalagyan ng malinis na tubig", "warga memasang keran bersama di dekat wadah air bersih", "những người hàng xóm lắp vòi nước chung cạnh các bình chứa nước sạch"],
  },
  "quezon-afterclass": {
    title: ["After-class learning kits in Quezon City", "Mga gamit sa pag-aaral pagkatapos ng klase sa Quezon City", "Paket belajar selepas sekolah di Quezon City", "Bộ đồ dùng học sau giờ học ở Quezon City"],
    purpose: ["books and learning kits for an after-class neighborhood group", "mga aklat at gamit sa pag-aaral para sa grupo sa pamayanan pagkatapos ng klase", "buku dan paket belajar untuk kelompok lingkungan selepas sekolah", "sách và bộ đồ dùng học tập cho nhóm học sau giờ học trong khu dân cư"],
    scene: ["children studying together with books at a neighborhood table", "mga batang sama-samang nag-aaral gamit ang mga aklat sa isang mesa sa pamayanan", "anak-anak belajar bersama dengan buku di meja lingkungan", "trẻ em cùng học với sách tại một chiếc bàn trong khu dân cư"],
  },
  "quezon-family-roof": {
    title: ["A dry roof for the Santos family", "Bubong na hindi tumutulo para sa pamilyang Santos", "Atap yang tidak bocor untuk keluarga Santos", "Mái nhà không dột cho gia đình Santos"],
    purpose: ["roof panels and practical repairs for a small family home", "mga panel ng bubong at praktikal na pagkukumpuni para sa maliit na tahanan ng pamilya", "panel atap dan perbaikan praktis untuk rumah kecil keluarga", "tấm lợp và sửa chữa thiết thực cho ngôi nhà nhỏ của gia đình"],
    scene: ["a family inspecting roof panels beside their small urban home", "isang pamilyang sumusuri sa mga panel ng bubong sa tabi ng kanilang maliit na bahay sa lungsod", "keluarga memeriksa panel atap di dekat rumah kecil mereka di kota", "một gia đình kiểm tra tấm lợp cạnh ngôi nhà nhỏ trong thành phố"],
  },
  "jakarta-river-cleanup": {
    title: ["River clean-up tools for neighborhood volunteers", "Mga kagamitan sa paglilinis ng ilog para sa mga boluntaryo sa pamayanan", "Peralatan bersih sungai untuk relawan lingkungan", "Dụng cụ dọn sông cho tình nguyện viên khu dân cư"],
    purpose: ["shared gloves, collection tools and river-care sessions", "pinagsasaluhang guwantes, kagamitan sa pangongolekta at mga gawain sa pangangalaga ng ilog", "sarung tangan bersama, alat pengumpulan sampah, dan kegiatan perawatan sungai", "găng tay dùng chung, dụng cụ thu gom và các buổi chăm sóc dòng sông"],
    scene: ["Indonesian neighbors collecting litter along a calm urban river", "mga magkakapitbahay sa Indonesia na nangongolekta ng basura sa tabi ng payapang ilog sa lungsod", "warga Indonesia memungut sampah di tepi sungai kota yang tenang", "những người hàng xóm ở Indonesia nhặt rác dọc một dòng sông yên ả trong thành phố"],
  },
  "jakarta-community-mural": {
    title: ["A neighborhood mural made by local artists", "Mural sa pamayanan na gawa ng mga lokal na artista", "Mural lingkungan karya seniman setempat", "Tranh tường khu dân cư do nghệ sĩ địa phương thực hiện"],
    purpose: ["paint and shared materials for a neighborhood wall mural", "pintura at pinagsasaluhang materyales para sa mural sa pader ng pamayanan", "cat dan bahan bersama untuk mural dinding lingkungan", "sơn và vật liệu dùng chung cho tranh tường trong khu dân cư"],
    scene: ["young Indonesian artists painting a colorful neighborhood wall mural", "mga batang artistang Indonesian na nagpinta ng makulay na mural sa pader ng pamayanan", "seniman muda Indonesia melukis mural warna-warni di dinding lingkungan", "các nghệ sĩ trẻ Indonesia vẽ tranh tường đầy màu sắc trong khu dân cư"],
  },
  "bohol-health-screening": {
    title: ["A community health-screening day in Bohol", "Araw ng pagsusuri sa kalusugan ng komunidad sa Bohol", "Hari pemeriksaan kesehatan komunitas di Bohol", "Ngày khám sàng lọc sức khỏe cộng đồng ở Bohol"],
    purpose: ["a sample neighborhood health-screening and referral day", "halimbawang araw ng pagsusuri sa kalusugan at pagre-refer sa pamayanan", "contoh hari pemeriksaan kesehatan dan rujukan untuk lingkungan", "ngày khám sàng lọc và chuyển tuyến mẫu trong khu dân cư"],
    scene: ["a nurse checking blood pressure at a rural community clinic", "isang nars na sumusukat ng presyon ng dugo sa klinikang pangkomunidad sa kanayunan", "perawat memeriksa tekanan darah di klinik komunitas pedesaan", "một điều dưỡng đo huyết áp tại phòng khám cộng đồng ở nông thôn"],
  },
  "bohol-reading-zine": {
    title: ["Reading zines made with Bohol teachers", "Mga zine sa pagbabasa na ginawa kasama ang mga guro sa Bohol", "Zine membaca bersama guru Bohol", "Tập san đọc sách cùng giáo viên Bohol"],
    purpose: ["teacher-made reading zines and simple illustration supplies", "mga zine sa pagbabasa na gawa ng guro at simpleng kagamitan sa pagguhit", "zine membaca buatan guru dan perlengkapan ilustrasi sederhana", "tập san đọc sách do giáo viên làm và đồ dùng minh họa đơn giản"],
    scene: ["teachers folding illustrated reading zines around a wooden table", "mga gurong nagtutupi ng mga zine sa pagbabasa na may larawan sa paligid ng isang mesang kahoy", "guru melipat zine membaca bergambar di sekitar meja kayu", "các giáo viên gấp tập san đọc sách có minh họa quanh bàn gỗ"],
  },
  "tarlac-storm-packs": {
    title: ["Storm-preparedness packs for Tarlac families", "Mga pakete ng paghahanda sa bagyo para sa mga pamilya sa Tarlac", "Paket kesiapsiagaan badai untuk keluarga Tarlac", "Bộ đồ ứng phó bão cho các gia đình Tarlac"],
    purpose: ["household storm-preparedness packs and essential supplies", "mga pakete ng paghahanda sa bagyo at mahahalagang gamit para sa mga sambahayan", "paket kesiapsiagaan badai rumah tangga dan kebutuhan penting", "bộ đồ chuẩn bị ứng phó bão cho hộ gia đình và nhu yếu phẩm"],
    scene: ["volunteers packing flashlights and supplies into emergency bags", "mga boluntaryong naglalagay ng mga flashlight at gamit sa mga bag na pang-emergency", "relawan memasukkan senter dan perlengkapan ke tas darurat", "các tình nguyện viên cho đèn pin và vật dụng vào túi khẩn cấp"],
  },
  "tarlac-school-kits": {
    title: ["School kits for a new term in Tarlac", "Mga gamit sa paaralan para sa bagong termino sa Tarlac", "Paket sekolah untuk semester baru di Tarlac", "Bộ đồ dùng cho học kỳ mới ở Tarlac"],
    purpose: ["backpacks, notebooks and classroom stationery for a school term", "mga backpack, kuwaderno at kagamitan sa silid-aralan para sa isang termino", "tas, buku tulis, dan alat tulis kelas untuk satu semester", "ba lô, vở và văn phòng phẩm lớp học cho một học kỳ"],
    scene: ["children receiving colorful backpacks and notebooks outside a classroom", "mga batang tumatanggap ng makukulay na backpack at kuwaderno sa labas ng silid-aralan", "anak-anak menerima tas warna-warni dan buku tulis di luar kelas", "trẻ em nhận ba lô đầy màu sắc và vở bên ngoài lớp học"],
  },
  "manila-medical-transport": {
    title: ["Clinic transport for neighbors in Manila", "Sasakyan papunta sa klinika para sa mga kapitbahay sa Manila", "Transportasi ke klinik untuk warga Manila", "Đưa đón đến phòng khám cho cư dân Manila"],
    purpose: ["accessible transport arrangements for neighborhood clinic visits", "pag-aayos ng madaling maakses na transportasyon para sa pagpunta ng mga kapitbahay sa klinika", "pengaturan transportasi yang mudah diakses untuk kunjungan klinik warga", "bố trí phương tiện dễ tiếp cận để cư dân đến phòng khám"],
    scene: ["a volunteer helping an older adult enter a community van", "isang boluntaryong tumutulong sa isang nakatatanda na sumakay sa van ng komunidad", "relawan membantu seorang lansia naik ke van komunitas", "một tình nguyện viên giúp người cao tuổi lên xe van cộng đồng"],
  },
  "manila-community-makerspace": {
    title: ["A shared makerspace for Manila neighbors", "Pinagsasaluhang lugar ng paglikha para sa mga kapitbahay sa Manila", "Ruang berkarya bersama untuk warga Manila", "Không gian sáng tạo chung cho cư dân Manila"],
    purpose: ["shared worktables and hand tools for a neighborhood makerspace", "pinagsasaluhang mesa at kagamitang de-kamay para sa lugar ng paglikha sa pamayanan", "meja kerja dan perkakas tangan bersama untuk ruang berkarya lingkungan", "bàn làm việc và dụng cụ cầm tay dùng chung cho không gian sáng tạo của khu dân cư"],
    scene: ["neighbors assembling wooden worktables in a bright shared workshop", "mga magkakapitbahay na bumubuo ng mesang kahoy sa maliwanag na pinagsasaluhang pagawaan", "warga merakit meja kerja kayu di bengkel bersama yang terang", "những người hàng xóm lắp bàn làm việc bằng gỗ trong xưởng chung sáng sủa"],
  },
  "cats-recovery": {
    title: ["Clinic recovery for injured cats", "Pagpapagaling sa klinika para sa mga pusang nasugatan", "Pemulihan klinik untuk kucing terluka", "Hồi phục tại phòng khám cho mèo bị thương"],
    purpose: ["veterinary recovery supplies and foster care for injured cats", "kagamitan sa pagpapagaling sa beterinaryo at pansamantalang pag-aaruga para sa mga pusang nasugatan", "perlengkapan pemulihan veteriner dan perawatan sementara untuk kucing terluka", "vật dụng hồi phục thú y và chăm sóc tạm thời cho mèo bị thương"],
    scene: ["a veterinarian gently examining a recovering cat in a clean clinic", "isang beterinaryong maingat na sumusuri sa pusang nagpapagaling sa malinis na klinika", "dokter hewan memeriksa kucing yang sedang pulih dengan lembut di klinik bersih", "một bác sĩ thú y nhẹ nhàng khám cho mèo đang hồi phục tại phòng khám sạch sẽ"],
  },
  "dogs-rescue-care": {
    title: ["Rescue care and foster supplies for dogs", "Pag-aaruga at gamit sa pansamantalang tahanan para sa mga asong nasagip", "Perawatan penyelamatan dan perlengkapan pengasuhan anjing", "Chăm sóc cứu hộ và vật dụng nuôi tạm cho chó"],
    purpose: ["rescue-dog care supplies and peaceful foster spaces", "kagamitan sa pag-aaruga ng mga asong nasagip at payapang pansamantalang tahanan", "perlengkapan perawatan anjing yang diselamatkan dan tempat pengasuhan yang tenang", "vật dụng chăm sóc chó được cứu và không gian nuôi tạm yên bình"],
    scene: ["a volunteer caring for rescued dogs beside a peaceful foster yard", "isang boluntaryong nag-aaruga ng mga asong nasagip sa tabi ng payapang bakuran ng pansamantalang tahanan", "relawan merawat anjing yang diselamatkan di dekat halaman pengasuhan yang tenang", "một tình nguyện viên chăm sóc chó được cứu cạnh sân nuôi tạm yên bình"],
  },
  "shared-animal-shelter": {
    title: ["Repairing a shared animal shelter", "Pagkukumpuni ng pinagsasaluhang silungan ng mga hayop", "Memperbaiki penampungan hewan bersama", "Sửa chữa nơi trú ẩn chung cho động vật"],
    purpose: ["shelter repairs and shaded kennels for rescued animals", "pagkukumpuni ng silungan at mga kulungang may lilim para sa mga hayop na nasagip", "perbaikan penampungan dan kandang teduh untuk hewan yang diselamatkan", "sửa nơi trú ẩn và chuồng có bóng mát cho động vật được cứu"],
    scene: ["shelter volunteers repairing shaded kennels beside calm rescued animals", "mga boluntaryo sa silungan na nagkukumpuni ng mga kulungang may lilim sa tabi ng maamong hayop na nasagip", "relawan penampungan memperbaiki kandang teduh di dekat hewan selamat yang tenang", "tình nguyện viên sửa chuồng có bóng mát cạnh các động vật được cứu đang yên ổn"],
  },
  "orphanage-learning-room": {
    title: ["A learning room for children in care", "Silid-aralan para sa mga batang nasa pangangalaga", "Ruang belajar untuk anak dalam pengasuhan", "Phòng học cho trẻ em được chăm sóc"],
    purpose: ["books and a welcoming learning room for children in care", "mga aklat at maaliwalas na silid ng pag-aaral para sa mga batang nasa pangangalaga", "buku dan ruang belajar yang nyaman untuk anak dalam pengasuhan", "sách và phòng học thân thiện cho trẻ em được chăm sóc"],
    scene: ["care workers arranging books inside a bright children's learning room", "mga tagapag-alagang nag-aayos ng mga aklat sa loob ng maliwanag na silid ng pag-aaral ng mga bata", "pengasuh menata buku di ruang belajar anak yang terang", "nhân viên chăm sóc sắp xếp sách trong phòng học sáng sủa của trẻ em"],
  },
  "elder-home-meals": {
    title: ["Warm meals for an example elder home", "Mainit na pagkain para sa halimbawang tahanan ng mga nakatatanda", "Makanan hangat untuk contoh panti lansia", "Bữa ăn ấm cho viện dưỡng lão mẫu"],
    purpose: ["warm shared meals and practical support for older neighbors", "mainit na pinagsasaluhang pagkain at praktikal na suporta para sa mga nakatatandang kapitbahay", "makanan hangat bersama dan dukungan praktis bagi warga lansia", "bữa ăn chung ấm áp và hỗ trợ thiết thực cho cư dân cao tuổi"],
    scene: ["a care volunteer serving warm meals to elders at a dining table", "isang boluntaryong tagapag-alaga na naghahain ng mainit na pagkain sa mga nakatatanda sa hapag-kainan", "relawan pengasuhan menyajikan makanan hangat kepada lansia di meja makan", "một tình nguyện viên chăm sóc phục vụ bữa ăn ấm cho người cao tuổi tại bàn ăn"],
  },
  "community-free-kitchen": {
    title: ["Community free-meal kitchen supplies", "Mga gamit sa kusinang pangkomunidad na may libreng pagkain", "Perlengkapan dapur makan gratis komunitas", "Vật dụng cho bếp ăn miễn phí cộng đồng"],
    purpose: ["supplies and cooking equipment for a community free-meal kitchen", "mga gamit at kagamitan sa pagluluto para sa kusinang pangkomunidad na may libreng pagkain", "bahan dan alat masak untuk dapur makan gratis komunitas", "vật dụng và thiết bị nấu ăn cho bếp ăn miễn phí cộng đồng"],
    scene: ["neighbors preparing free meals together in a clean community kitchen", "mga magkakapitbahay na sama-samang naghahanda ng libreng pagkain sa malinis na kusinang pangkomunidad", "warga bersama menyiapkan makanan gratis di dapur komunitas yang bersih", "những người hàng xóm cùng chuẩn bị bữa ăn miễn phí trong bếp cộng đồng sạch sẽ"],
  },
  "river-volunteer-kit": {
    title: ["Shared safety kits for river volunteers", "Pinagsasaluhang gamit pangkaligtasan para sa mga boluntaryo sa ilog", "Paket keselamatan bersama untuk relawan sungai", "Bộ đồ an toàn chung cho tình nguyện viên dòng sông"],
    purpose: ["shared gloves, collection tools and safety equipment for river volunteers", "pinagsasaluhang guwantes, kagamitan sa pangongolekta at pangkaligtasan para sa mga boluntaryo sa ilog", "sarung tangan bersama, alat pengumpulan sampah, dan perlengkapan keselamatan untuk relawan sungai", "găng tay, dụng cụ thu gom và thiết bị an toàn dùng chung cho tình nguyện viên dòng sông"],
    scene: ["volunteers sorting gloves and safety vests beside a green river", "mga boluntaryong nag-aayos ng guwantes at mga best na pangkaligtasan sa tabi ng luntiang ilog", "relawan memilah sarung tangan dan rompi keselamatan di dekat sungai hijau", "các tình nguyện viên phân loại găng tay và áo phản quang cạnh một dòng sông xanh"],
  },
  "flood-volunteer-logistics": {
    title: ["Flood-response volunteer logistics", "Logistika ng mga boluntaryo sa pagtugon sa baha", "Logistik relawan tanggap banjir", "Hậu cần cho tình nguyện viên ứng phó lũ"],
    purpose: ["relief-crate transport and organized volunteer logistics in a flood scenario", "pagdadala ng mga kahon ng ayuda at organisadong logistika ng mga boluntaryo sa isang sitwasyon ng baha", "angkutan peti bantuan dan logistik relawan yang teratur dalam skenario banjir", "vận chuyển thùng cứu trợ và tổ chức hậu cần tình nguyện trong kịch bản lũ lụt"],
    scene: ["volunteers loading relief crates into a van near a shelter", "mga boluntaryong nagsasakay ng mga kahon ng ayuda sa van malapit sa isang silungan", "relawan memuat peti bantuan ke van di dekat tempat pengungsian", "các tình nguyện viên xếp thùng cứu trợ lên xe van gần nơi trú ẩn"],
  },
  "forest-fire-volunteer-safety": {
    title: ["Safety supplies for forest-fire volunteers", "Mga gamit pangkaligtasan para sa mga boluntaryo sa sunog sa kagubatan", "Perlengkapan keselamatan relawan kebakaran hutan", "Vật dụng an toàn cho tình nguyện viên cháy rừng"],
    purpose: ["protective supplies and water-station logistics for trained forest-safety volunteers", "mga gamit pangproteksiyon at logistika ng istasyon ng tubig para sa mga sinanay na boluntaryo sa kaligtasan ng kagubatan", "perlengkapan pelindung dan logistik pos air untuk relawan keselamatan hutan terlatih", "vật dụng bảo hộ và hậu cần trạm nước cho tình nguyện viên an toàn rừng đã được đào tạo"],
    scene: ["trained volunteers checking protective supplies at a forest safety station", "mga sinanay na boluntaryong sumusuri sa mga gamit pangproteksiyon sa istasyon ng kaligtasan sa kagubatan", "relawan terlatih memeriksa perlengkapan pelindung di pos keselamatan hutan", "các tình nguyện viên đã được đào tạo kiểm tra vật dụng bảo hộ tại trạm an toàn rừng"],
  },
  "cebu-boat-repairs": {
    completed: true,
    title: ["Fishing boat repair supplies", "Mga gamit sa pagkukumpuni ng bangkang pangisda", "Perlengkapan perbaikan perahu nelayan", "Vật dụng sửa thuyền đánh cá"],
    purpose: ["repair supplies for small fishing boats", "mga gamit sa pagkukumpuni ng maliliit na bangkang pangisda", "perlengkapan perbaikan untuk perahu nelayan kecil", "vật dụng sửa chữa cho thuyền đánh cá nhỏ"],
    scene: ["repaired small fishing boats lined along a sunny shore", "mga nakumpuning maliliit na bangkang pangisda na nakahanay sa maaraw na baybayin", "perahu nelayan kecil yang telah diperbaiki berjajar di pantai cerah", "những thuyền đánh cá nhỏ đã sửa xếp dọc bờ biển đầy nắng"],
  },
  "cebu-home-rebuild": {
    completed: true,
    title: ["A rebuilt family kitchen", "Muling itinayong kusina ng pamilya", "Dapur keluarga yang dibangun kembali", "Bếp gia đình được xây lại"],
    purpose: ["repairs to a modest family kitchen", "pagkukumpuni ng payak na kusina ng pamilya", "perbaikan dapur sederhana keluarga", "sửa chữa căn bếp giản dị của gia đình"],
    scene: ["a family sharing breakfast inside a freshly repaired modest kitchen", "isang pamilyang nagsasalo sa almusal sa loob ng bagong kumpuning payak na kusina", "keluarga sarapan bersama di dapur sederhana yang baru diperbaiki", "một gia đình cùng ăn sáng trong căn bếp giản dị vừa được sửa"],
  },
  "cebu-water-tanks": {
    completed: true,
    title: ["Rainwater tanks for shared use", "Mga tangke ng tubig-ulan para sa pinagsasaluhang gamit", "Tangki air hujan untuk penggunaan bersama", "Bồn nước mưa dùng chung"],
    purpose: ["rainwater tanks for shared neighborhood use", "mga tangke ng tubig-ulan para sa pinagsasaluhang gamit ng pamayanan", "tangki air hujan untuk penggunaan bersama warga", "bồn nước mưa dùng chung cho khu dân cư"],
    scene: ["neighbors standing beside newly installed community rainwater tanks", "mga magkakapitbahay na nakatayo sa tabi ng mga bagong tangke ng tubig-ulan ng komunidad", "warga berdiri di dekat tangki air hujan komunitas yang baru dipasang", "những người hàng xóm đứng cạnh bồn nước mưa cộng đồng mới lắp"],
  },
  "quezon-medical-rides": {
    completed: true,
    title: ["Clinic transport for neighbors", "Sasakyan papunta sa klinika para sa mga kapitbahay", "Transportasi ke klinik untuk warga", "Đưa đón đến phòng khám cho cư dân"],
    purpose: ["transport support for routine neighborhood clinic visits", "suporta sa transportasyon para sa regular na pagpunta ng mga kapitbahay sa klinika", "dukungan transportasi untuk kunjungan klinik rutin warga", "hỗ trợ phương tiện cho cư dân đi khám định kỳ"],
    scene: ["a family returning from a clinic beside a clean transport van", "isang pamilyang pabalik mula sa klinika sa tabi ng malinis na van", "keluarga pulang dari klinik di dekat van angkutan yang bersih", "một gia đình trở về từ phòng khám cạnh xe van sạch sẽ"],
  },
  "quezon-learning-corner": {
    completed: true,
    title: ["A family learning corner", "Sulok ng pag-aaral ng pamilya", "Sudut belajar keluarga", "Góc học tập gia đình"],
    purpose: ["books and supplies for a family learning corner", "mga aklat at kagamitan para sa sulok ng pag-aaral ng pamilya", "buku dan perlengkapan untuk sudut belajar keluarga", "sách và đồ dùng cho góc học tập gia đình"],
    scene: ["children reading beside neatly arranged books and learning supplies", "mga batang nagbabasa sa tabi ng maayos na mga aklat at kagamitan sa pag-aaral", "anak-anak membaca di dekat buku dan perlengkapan belajar yang tertata rapi", "trẻ em đọc bên cạnh sách và đồ dùng học tập được xếp gọn"],
  },
  "quezon-roof-repair": {
    completed: true,
    title: ["Storm-damaged roof repair", "Pagkukumpuni ng bubong na nasira ng bagyo", "Perbaikan atap rusak akibat badai", "Sửa mái nhà bị bão làm hỏng"],
    purpose: ["a sturdy roof repair above a small home", "matibay na pagkukumpuni ng bubong ng isang maliit na bahay", "perbaikan atap yang kokoh di atas rumah kecil", "sửa mái chắc chắn cho một ngôi nhà nhỏ"],
    scene: ["workers finishing a sturdy roof above a modest house", "mga manggagawang tinatapos ang matibay na bubong ng payak na bahay", "pekerja menyelesaikan atap kokoh di atas rumah sederhana", "các thợ hoàn thiện mái chắc chắn cho ngôi nhà giản dị"],
  },
  "jakarta-flood-meals": {
    completed: true,
    title: ["Community meals after flooding", "Pagkaing pangkomunidad matapos ang baha", "Makanan komunitas setelah banjir", "Bữa ăn cộng đồng sau lũ"],
    purpose: ["boxed community meals in a flood-recovery scenario", "pagkaing nakakahon para sa komunidad sa isang sitwasyon ng pagbangon mula sa baha", "nasi kotak komunitas dalam skenario pemulihan banjir", "suất ăn đóng hộp cho cộng đồng trong kịch bản phục hồi sau lũ"],
    scene: ["volunteers handing boxed meals across an Indonesian shelter table", "mga boluntaryong nagbibigay ng pagkaing nakakahon sa mesa ng isang silungan sa Indonesia", "relawan membagikan nasi kotak di meja pengungsian Indonesia", "các tình nguyện viên trao suất ăn đóng hộp qua bàn tại nơi trú ẩn ở Indonesia"],
  },
  "jakarta-river-tools": {
    completed: true,
    title: ["Shared river-cleanup equipment", "Pinagsasaluhang kagamitan sa paglilinis ng ilog", "Peralatan bersih sungai bersama", "Thiết bị dọn sông dùng chung"],
    purpose: ["shared gloves and litter-collection tools for volunteers", "pinagsasaluhang guwantes at kagamitan sa pangongolekta ng basura para sa mga boluntaryo", "sarung tangan bersama dan alat pengumpulan sampah untuk relawan", "găng tay và dụng cụ thu gom rác dùng chung cho tình nguyện viên"],
    scene: ["neighborhood volunteers storing gloves and litter-collection tools", "mga boluntaryo sa pamayanan na nag-iimbak ng guwantes at kagamitan sa pangongolekta ng basura", "relawan lingkungan menyimpan sarung tangan dan alat pengumpulan sampah", "tình nguyện viên khu dân cư cất găng tay và dụng cụ thu gom rác"],
  },
  "jakarta-lane-mural": {
    completed: true,
    title: ["A finished neighborhood mural", "Natapos na mural sa pamayanan", "Mural lingkungan yang selesai", "Tranh tường khu dân cư đã hoàn thành"],
    purpose: ["a completed neighborhood wall-mural illustration", "larawan ng isang natapos na mural sa pader ng pamayanan", "ilustrasi mural dinding lingkungan yang telah selesai", "minh họa tranh tường khu dân cư đã hoàn thành"],
    scene: ["residents admiring a finished colorful mural along a narrow lane", "mga residenteng tumitingin sa natapos na makulay na mural sa isang makitid na eskinita", "warga mengagumi mural warna-warni yang selesai di gang sempit", "cư dân ngắm tranh tường đầy màu sắc đã hoàn thành dọc một ngõ hẹp"],
  },
  "bohol-reading-shelves": {
    completed: true,
    title: ["New shelves for young readers", "Mga bagong estante para sa batang mambabasa", "Rak baru untuk pembaca cilik", "Kệ sách mới cho độc giả nhỏ tuổi"],
    purpose: ["wooden reading shelves and storybooks for children", "mga estanteng kahoy at kuwentong pambata para sa mga bata", "rak baca kayu dan buku cerita untuk anak-anak", "kệ sách bằng gỗ và truyện cho trẻ em"],
    scene: ["a teacher arranging storybooks on new wooden library shelves", "isang gurong nag-aayos ng kuwentong pambata sa mga bagong estanteng kahoy ng aklatan", "guru menata buku cerita di rak kayu perpustakaan yang baru", "một giáo viên xếp truyện lên kệ gỗ mới của thư viện"],
  },
  "bohol-clinic-day": {
    completed: true,
    title: ["A completed community clinic day", "Natapos na araw ng klinikang pangkomunidad", "Hari klinik komunitas yang selesai", "Ngày khám cộng đồng đã hoàn thành"],
    purpose: ["a neighborhood health-screening day in a fictional rural clinic", "araw ng pagsusuri sa kalusugan ng pamayanan sa isang kathang-isip na klinika sa kanayunan", "hari pemeriksaan kesehatan lingkungan di klinik pedesaan fiktif", "ngày khám sàng lọc cho khu dân cư tại phòng khám nông thôn hư cấu"],
    scene: ["health volunteers chatting with families at a rural clinic", "mga boluntaryo sa kalusugan na nakikipag-usap sa mga pamilya sa isang klinika sa kanayunan", "relawan kesehatan berbincang dengan keluarga di klinik pedesaan", "tình nguyện viên y tế trò chuyện với các gia đình tại phòng khám nông thôn"],
  },
  "bohol-story-zines": {
    completed: true,
    title: ["Story zines for school readers", "Mga zine ng kuwento para sa mga mambabasa sa paaralan", "Zine cerita untuk pembaca sekolah", "Tập san truyện cho học sinh đọc"],
    purpose: ["handmade story zines for school readers", "mga gawang-kamay na zine ng kuwento para sa mga mambabasa sa paaralan", "zine cerita buatan tangan untuk pembaca sekolah", "tập san truyện làm thủ công cho học sinh đọc"],
    scene: ["children holding colorful handmade story zines in a classroom", "mga batang may hawak na makukulay na gawang-kamay na zine ng kuwento sa silid-aralan", "anak-anak memegang zine cerita buatan tangan berwarna-warni di kelas", "trẻ em cầm tập san truyện thủ công đầy màu sắc trong lớp học"],
  },
  "tarlac-school-transport": {
    completed: true,
    title: ["School transport support for siblings", "Suporta sa sasakyan papunta sa paaralan para sa magkakapatid", "Dukungan transportasi sekolah untuk saudara kandung", "Hỗ trợ đưa đón đến trường cho các anh chị em"],
    purpose: ["school transport arrangements for a fictional family", "pag-aayos ng sasakyan papunta sa paaralan para sa isang kathang-isip na pamilya", "pengaturan transportasi sekolah untuk keluarga fiktif", "bố trí phương tiện đến trường cho một gia đình hư cấu"],
    scene: ["three schoolchildren waving beside a neighborhood school-transport van", "tatlong mag-aaral na kumakaway sa tabi ng van na panghatid sa paaralan sa pamayanan", "tiga anak sekolah melambai di dekat van antar sekolah lingkungan", "ba học sinh vẫy tay cạnh xe van đưa đón đến trường của khu dân cư"],
  },
  "tarlac-relief-boxes": {
    completed: true,
    title: ["Household storm-relief boxes", "Mga kahon ng ayuda sa bagyo para sa mga sambahayan", "Kotak bantuan badai rumah tangga", "Thùng cứu trợ bão cho hộ gia đình"],
    purpose: ["storm-relief supply boxes in a fictional community scenario", "mga kahon ng gamit para sa ayuda sa bagyo sa isang kathang-isip na sitwasyon ng komunidad", "kotak perlengkapan bantuan badai dalam skenario komunitas fiktif", "thùng vật dụng cứu trợ bão trong kịch bản cộng đồng hư cấu"],
    scene: ["families receiving neatly packed relief boxes at a community center", "mga pamilyang tumatanggap ng maayos na nakabalot na kahon ng ayuda sa sentro ng komunidad", "keluarga menerima kotak bantuan yang dikemas rapi di pusat komunitas", "các gia đình nhận thùng cứu trợ được đóng gọn tại trung tâm cộng đồng"],
  },
  "tarlac-classroom-kits": {
    completed: true,
    title: ["Classroom stationery kits delivered", "Naihatid na mga gamit sa silid-aralan", "Paket alat tulis kelas tersalurkan", "Bộ văn phòng phẩm lớp học đã được giao"],
    purpose: ["classroom notebooks and stationery kit illustrations", "mga larawan ng kuwaderno at kagamitan sa silid-aralan", "ilustrasi buku tulis kelas dan paket alat tulis", "minh họa vở và bộ văn phòng phẩm lớp học"],
    scene: ["a teacher distributing notebooks and pencils across classroom desks", "isang gurong namamahagi ng mga kuwaderno at lapis sa mga mesa sa silid-aralan", "guru membagikan buku tulis dan pensil di meja kelas", "một giáo viên phát vở và bút chì trên bàn học trong lớp"],
  },
  "manila-baybayin-workshops": {
    completed: true,
    title: ["Community Baybayin learning workshops", "Mga workshop sa pag-aaral ng Baybayin para sa komunidad", "Lokakarya belajar Baybayin komunitas", "Buổi học Baybayin cộng đồng"],
    purpose: ["a fictional community Baybayin learning workshop", "isang kathang-isip na workshop sa pag-aaral ng Baybayin para sa komunidad", "lokakarya belajar Baybayin komunitas fiktif", "buổi học Baybayin cộng đồng hư cấu"],
    scene: ["young learners practicing hand-drawn symbols around a workshop table", "mga batang mag-aaral na nagsasanay gumuhit ng mga simbolo sa paligid ng mesa ng workshop", "pelajar muda berlatih menggambar simbol di sekitar meja lokakarya", "các học viên trẻ luyện vẽ ký hiệu bằng tay quanh bàn học"],
  },
  "manila-clinic-transport": {
    completed: true,
    title: ["A completed clinic-transport example", "Natapos na halimbawa ng paghatid sa klinika", "Contoh transportasi klinik yang selesai", "Ví dụ đưa đón đến phòng khám đã hoàn thành"],
    purpose: ["volunteer transport for a fictional neighborhood clinic visit", "paghatid ng boluntaryo sa isang kathang-isip na pagbisita sa klinika ng pamayanan", "transportasi relawan untuk kunjungan klinik lingkungan fiktif", "phương tiện tình nguyện cho chuyến khám của khu dân cư hư cấu"],
    scene: ["an older neighbor smiling beside a volunteer at a clinic entrance", "isang nakatatandang kapitbahay na nakangiti sa tabi ng boluntaryo sa pasukan ng klinika", "warga lansia tersenyum di samping relawan di pintu masuk klinik", "một cư dân cao tuổi mỉm cười cạnh tình nguyện viên ở lối vào phòng khám"],
  },
  "manila-maker-tools": {
    completed: true,
    title: ["Shared maker tools for neighbors", "Pinagsasaluhang kagamitan sa paglikha para sa mga kapitbahay", "Perkakas berkarya bersama untuk warga", "Dụng cụ sáng tạo dùng chung cho cư dân"],
    purpose: ["shared hand tools and workstations for neighborhood makers", "pinagsasaluhang kagamitang de-kamay at lugar ng paggawa para sa mga lumilikha sa pamayanan", "perkakas tangan dan tempat kerja bersama untuk pembuat di lingkungan", "dụng cụ cầm tay và bàn làm việc dùng chung cho người sáng tạo trong khu dân cư"],
    scene: ["neighbors organizing hand tools on a bright workshop wall", "mga magkakapitbahay na nag-aayos ng kagamitang de-kamay sa pader ng maliwanag na pagawaan", "warga menata perkakas tangan di dinding bengkel yang terang", "những người hàng xóm sắp dụng cụ cầm tay trên tường xưởng sáng sủa"],
  },
  "cats-clinic-recovery": {
    completed: true,
    title: ["Example cat-clinic recovery support", "Halimbawang suporta sa pagpapagaling ng pusa sa klinika", "Contoh dukungan pemulihan kucing di klinik", "Hỗ trợ hồi phục cho mèo tại phòng khám mẫu"],
    purpose: ["a fictional cat-clinic recovery and foster-support project", "isang kathang-isip na proyekto ng pagpapagaling ng pusa sa klinika at suporta sa pansamantalang pag-aaruga", "proyek fiktif pemulihan kucing di klinik dan dukungan pengasuhan sementara", "dự án hư cấu về hồi phục cho mèo tại phòng khám và hỗ trợ nuôi tạm"],
    scene: ["a recovered cat resting comfortably beside a veterinary care volunteer", "isang pusang gumaling na komportableng nagpapahinga sa tabi ng boluntaryo sa pangangalagang beterinaryo", "kucing yang pulih beristirahat nyaman di dekat relawan perawatan veteriner", "một chú mèo đã hồi phục nghỉ ngơi thoải mái cạnh tình nguyện viên chăm sóc thú y"],
  },
  "dogs-foster-homes": {
    completed: true,
    title: ["Example foster homes for rescued dogs", "Halimbawang pansamantalang tahanan para sa mga asong nasagip", "Contoh rumah pengasuhan untuk anjing yang diselamatkan", "Nhà nuôi tạm mẫu cho chó được cứu"],
    purpose: ["a fictional foster-home project for rescued dogs", "isang kathang-isip na proyekto ng pansamantalang tahanan para sa mga asong nasagip", "proyek rumah pengasuhan fiktif untuk anjing yang diselamatkan", "dự án nhà nuôi tạm hư cấu cho chó được cứu"],
    scene: ["happy rescued dogs relaxing with volunteers in a sunny foster yard", "masasayang asong nasagip na nagpapahinga kasama ang mga boluntaryo sa maaraw na bakuran ng pansamantalang tahanan", "anjing selamat yang bahagia bersantai bersama relawan di halaman pengasuhan cerah", "những chú chó được cứu vui vẻ thư giãn cùng tình nguyện viên trong sân nuôi tạm đầy nắng"],
  },
  "shelter-kennel-repairs": {
    completed: true,
    title: ["Example animal-shelter kennel repairs", "Halimbawang pagkukumpuni ng mga kulungan sa silungan ng hayop", "Contoh perbaikan kandang penampungan hewan", "Sửa chuồng mẫu tại nơi trú ẩn động vật"],
    purpose: ["clean kennel repairs in a fictional shared animal shelter", "pagkukumpuni ng malinis na mga kulungan sa kathang-isip na pinagsasaluhang silungan ng hayop", "perbaikan kandang bersih di penampungan hewan bersama yang fiktif", "sửa chuồng sạch tại nơi trú ẩn động vật chung hư cấu"],
    scene: ["volunteers standing beside clean newly repaired animal-shelter kennels", "mga boluntaryong nakatayo sa tabi ng malinis at bagong kumpuning mga kulungan sa silungan ng hayop", "relawan berdiri di dekat kandang penampungan hewan yang bersih dan baru diperbaiki", "các tình nguyện viên đứng cạnh chuồng động vật sạch vừa được sửa"],
  },
  "orphanage-book-shelves": {
    completed: true,
    title: ["Example bookshelves for children in care", "Halimbawang mga estante ng aklat para sa mga batang nasa pangangalaga", "Contoh rak buku untuk anak dalam pengasuhan", "Kệ sách mẫu cho trẻ em được chăm sóc"],
    purpose: ["bookshelves and reading materials for a fictional children's care home", "mga estante ng aklat at babasahin para sa kathang-isip na tahanan ng pangangalaga ng mga bata", "rak buku dan bahan bacaan untuk panti pengasuhan anak fiktif", "kệ sách và tài liệu đọc cho mái ấm trẻ em hư cấu"],
    scene: ["a care worker arranging storybooks on colorful learning-room shelves", "isang tagapag-alagang nag-aayos ng kuwentong pambata sa makukulay na estante ng silid ng pag-aaral", "pengasuh menata buku cerita di rak ruang belajar berwarna-warni", "một nhân viên chăm sóc xếp truyện lên kệ đầy màu sắc của phòng học"],
  },
  "elder-care-visits": {
    completed: true,
    title: ["Example elder-care visits and meal support", "Halimbawang pagbisita sa mga nakatatanda at suporta sa pagkain", "Contoh kunjungan lansia dan dukungan makanan", "Thăm hỏi người cao tuổi và hỗ trợ bữa ăn mẫu"],
    purpose: ["care visits and meal support for fictional older neighbors", "mga pagbisita ng pangangalaga at suporta sa pagkain para sa kathang-isip na nakatatandang kapitbahay", "kunjungan pengasuhan dan dukungan makanan untuk warga lansia fiktif", "thăm hỏi chăm sóc và hỗ trợ bữa ăn cho các cư dân cao tuổi hư cấu"],
    scene: ["a volunteer sharing tea with elders in a warm common room", "isang boluntaryong nakikisalo ng tsaa sa mga nakatatanda sa maaliwalas na silid-pagtitipon", "relawan minum teh bersama lansia di ruang bersama yang hangat", "một tình nguyện viên cùng uống trà với người cao tuổi trong phòng sinh hoạt ấm áp"],
  },
  "free-meal-week": {
    completed: true,
    title: ["Example community free-meal week", "Halimbawang linggo ng libreng pagkaing pangkomunidad", "Contoh pekan makan gratis komunitas", "Tuần bữa ăn miễn phí cộng đồng mẫu"],
    purpose: ["a week of meals in a fictional community kitchen", "isang linggo ng pagkain sa kathang-isip na kusinang pangkomunidad", "sepekan makanan di dapur komunitas fiktif", "một tuần bữa ăn tại bếp cộng đồng hư cấu"],
    scene: ["community-kitchen volunteers distributing neatly packed lunch boxes", "mga boluntaryo ng kusinang pangkomunidad na namamahagi ng maayos na nakabalot na tanghalian", "relawan dapur komunitas membagikan kotak makan siang yang dikemas rapi", "tình nguyện viên bếp cộng đồng phát hộp cơm trưa được đóng gọn"],
  },
  "river-cleanup-round": {
    completed: true,
    title: ["Example volunteer river-cleanup round", "Halimbawang paglilinis ng ilog ng mga boluntaryo", "Contoh putaran relawan bersih sungai", "Đợt dọn sông tình nguyện mẫu"],
    purpose: ["a completed river-cleanup round in a fictional volunteer scenario", "natapos na paglilinis ng ilog sa isang kathang-isip na sitwasyon ng mga boluntaryo", "putaran bersih sungai yang selesai dalam skenario relawan fiktif", "đợt dọn sông đã hoàn thành trong kịch bản tình nguyện hư cấu"],
    scene: ["volunteers carrying collected litter away from a green riverbank", "mga boluntaryong nagdadala ng nakolektang basura palayo sa luntiang pampang ng ilog", "relawan membawa sampah yang terkumpul menjauh dari tepi sungai hijau", "các tình nguyện viên mang rác đã thu gom ra khỏi bờ sông xanh"],
  },
  "flood-relief-delivery": {
    completed: true,
    title: ["Example volunteer flood-relief delivery", "Halimbawang paghahatid ng ayuda sa baha ng mga boluntaryo", "Contoh penyaluran bantuan banjir oleh relawan", "Bàn giao cứu trợ lũ tình nguyện mẫu"],
    purpose: ["volunteer relief-box logistics in a fictional flood scenario", "logistika ng mga boluntaryo para sa mga kahon ng ayuda sa isang kathang-isip na sitwasyon ng baha", "logistik kotak bantuan relawan dalam skenario banjir fiktif", "hậu cần thùng cứu trợ tình nguyện trong kịch bản lũ hư cấu"],
    scene: ["volunteers handing relief boxes to neighbors outside a shelter", "mga boluntaryong nagbibigay ng mga kahon ng ayuda sa mga kapitbahay sa labas ng silungan", "relawan menyerahkan kotak bantuan kepada warga di luar pengungsian", "các tình nguyện viên trao thùng cứu trợ cho cư dân bên ngoài nơi trú ẩn"],
  },
  "forest-fire-water-station": {
    completed: true,
    title: ["Example forest-safety water station", "Halimbawang istasyon ng tubig para sa kaligtasan sa kagubatan", "Contoh pos air keselamatan hutan", "Trạm nước an toàn rừng mẫu"],
    purpose: ["water-station logistics in a fictional trained-volunteer forest-safety scenario", "logistika ng istasyon ng tubig sa kathang-isip na sitwasyon ng kaligtasan sa kagubatan ng mga sinanay na boluntaryo", "logistik pos air dalam skenario fiktif keselamatan hutan oleh relawan terlatih", "hậu cần trạm nước trong kịch bản an toàn rừng hư cấu với tình nguyện viên đã được đào tạo"],
    scene: ["volunteers organizing water containers at a shaded forest-safety station", "mga boluntaryong nag-aayos ng mga lalagyan ng tubig sa may-lilim na istasyon ng kaligtasan sa kagubatan", "relawan menata wadah air di pos keselamatan hutan yang teduh", "các tình nguyện viên sắp bình nước tại trạm an toàn rừng có bóng mát"],
  },
} as const satisfies Record<string, AuthoredCause>;

const authoredById = new Map<string, AuthoredCause>(Object.entries(AUTHORED_CAUSES));
const localeIndex: Record<Locale, 0 | 1 | 2 | 3> = { en: 0, tl: 1, id: 2, vi: 3 };
const englishTitleOverrides = new Map([
  ["arisan-banjir-jakarta", "North Jakarta floods - a community kitchen for 200 families"],
]);

function storyFor(purpose: string, locale: Locale): string {
  switch (locale) {
    case "tl": return `Ang kathang-isip na layuning ito ng Circles ay naglalarawan ng ${purpose}. Ang organizer, mga pangyayari at larawang nilikha ay inimbento para sa isang interaktibong demonstrasyon.\n\nAng ipinapakitang target, nalikom na halaga, bilang ng mga nag-ambag, mga petsa at mga update sa progreso ay mga sintetikong halimbawa. Hindi ito mga tala ng aktuwal na donasyon, na-verify na pagkakakilanlan o naihatid na tulong.\n\nHiwalay na ipinapakita ang iminungkahing alokasyon para sa operasyon ng organizer at ang bahagi para sa benepisyaryo. Walang kontrata sa pagbabayad o alokasyon ang prototype na ito at wala itong itinatakdang bayad sa platform.`;
    case "id": return `Tujuan fiktif Circles ini menggambarkan ${purpose}. Penyelenggara, situasi, dan gambar yang dihasilkan dibuat untuk demonstrasi interaktif.\n\nTarget, jumlah terkumpul, jumlah kontributor, tanggal, dan pembaruan progres yang ditampilkan merupakan contoh sintetis. Semuanya bukan catatan donasi aktual, identitas terverifikasi, atau bantuan yang telah disalurkan.\n\nUsulan alokasi operasional penyelenggara ditampilkan terpisah dari bagian penerima manfaat. Prototipe ini tidak memiliki kontrak pembayaran atau alokasi dan tidak menetapkan biaya platform.`;
    case "vi": return `Mục tiêu hư cấu này của Circles minh họa ${purpose}. Nhà tổ chức, hoàn cảnh và hình ảnh được tạo đều là hư cấu cho một bản trình diễn tương tác.\n\nMục tiêu, số tiền đã huy động, số người đóng góp, ngày tháng và cập nhật tiến độ hiển thị đều là ví dụ mô phỏng. Chúng không phải hồ sơ quyên góp thực tế, danh tính đã xác minh hay viện trợ đã bàn giao.\n\nKhoản phân bổ đề xuất cho hoạt động của nhà tổ chức được hiển thị riêng với phần của người thụ hưởng. Nguyên mẫu này không có hợp đồng thanh toán hoặc phân bổ và không xác lập phí nền tảng.`;
    default: return `This fictional Circles cause explores ${purpose}. The organizer, circumstances and generated imagery are invented for an interactive demonstration.\n\nThe displayed goal, raised amount, contributor count, dates and progress updates are synthetic examples. They are not records of actual donations, verified identity or delivered aid.\n\nA proposed organizer-operations allocation is shown separately from the beneficiary share. This prototype has no payment or allocation contract and establishes no platform fee.`;
  }
}

const SUMMARY_PREFIX: AuthoredText = ["Fictional example: ", "Kathang-isip na halimbawa: ", "Contoh fiktif: ", "Ví dụ hư cấu: "];
function sceneAlt(scene: string, locale: Locale): string {
  switch (locale) {
    case "tl": return `Nilikha at ilustratibong tagpo ng ${scene}; kathang-isip na demo, hindi na-verify na ebidensya`;
    case "id": return `Adegan ilustrasi yang dihasilkan tentang ${scene}; demo fiktif, bukan bukti terverifikasi`;
    case "vi": return `Cảnh minh họa được tạo về ${scene}; bản trình diễn hư cấu, không phải bằng chứng đã xác minh`;
    default: return `Generated illustrative scene of ${scene}; fictional demo, not verified evidence`;
  }
}

const COVER_CAPTION: AuthoredText = [
  "AI concept cover. Fictional cause, not documentary evidence.",
  "Pabalat na konsepto ng AI. Kathang-isip na layunin, hindi dokumentaryong ebidensya.",
  "Sampul konsep AI. Tujuan fiktif, bukan bukti dokumenter.",
  "Ảnh bìa ý tưởng AI. Mục tiêu hư cấu, không phải bằng chứng tư liệu.",
];
const RELATED_CAPTION: AuthoredText = [
  "Related AI concept scene. Not a photo of this campaign or proof of delivery.",
  "Kaugnay na tagpong konsepto ng AI. Hindi larawan ng kampanyang ito o patunay ng paghahatid.",
  "Adegan konsep AI terkait. Bukan foto kampanye ini atau bukti penyaluran.",
  "Cảnh ý tưởng AI liên quan. Không phải ảnh của chiến dịch này hay bằng chứng bàn giao.",
];
const TINO_GALLERY = new Map<string, { alt: AuthoredText; caption: AuthoredText }>([
  ["/circles/generated/tino-relief.png", {
    alt: ["AI-generated fishing families repairing boats in a fictional Cebu coastal village, not verified evidence", "Larawang nilikha ng AI ng mga pamilyang mangingisda na nagkukumpuni ng bangka sa isang kathang-isip na barangay sa baybayin ng Cebu, hindi na-verify na ebidensya", "Gambar AI keluarga nelayan memperbaiki perahu di desa pesisir Cebu fiktif, bukan bukti terverifikasi", "Ảnh do AI tạo về các gia đình ngư dân sửa thuyền tại làng ven biển Cebu hư cấu, không phải bằng chứng đã xác minh"],
    caption: COVER_CAPTION,
  }],
  ["/circles/generated/tino-relief-materials.png", {
    alt: ["AI-generated adult volunteers checking nets, timber and tools at a fictional Cebu shoreline workspace, not verified evidence", "Larawang nilikha ng AI ng mga boluntaryong nasa hustong gulang na sumusuri sa lambat, kahoy at kagamitan sa kathang-isip na lugar ng paggawa sa baybayin ng Cebu, hindi na-verify na ebidensya", "Gambar AI relawan dewasa memeriksa jaring, kayu, dan perkakas di ruang kerja pesisir Cebu fiktif, bukan bukti terverifikasi", "Ảnh do AI tạo về tình nguyện viên trưởng thành kiểm tra lưới, gỗ và dụng cụ tại khu làm việc ven biển Cebu hư cấu, không phải bằng chứng đã xác minh"],
    caption: ["AI concept: repair materials and preparation. Not an actual campaign photo or receipt.", "Konsepto ng AI: mga materyales sa pagkukumpuni at paghahanda. Hindi aktuwal na larawan ng kampanya o resibo.", "Konsep AI: bahan perbaikan dan persiapan. Bukan foto kampanye aktual atau tanda terima.", "Ý tưởng AI: vật liệu sửa chữa và chuẩn bị. Không phải ảnh chiến dịch thực tế hay biên nhận."],
  }],
  ["/circles/generated/tino-relief-shore.png", {
    alt: ["AI-generated volunteers testing a wooden boat near a fictional Cebu shore, not verified evidence", "Larawang nilikha ng AI ng mga boluntaryong sumusubok ng bangkang kahoy malapit sa kathang-isip na baybayin ng Cebu, hindi na-verify na ebidensya", "Gambar AI relawan menguji perahu kayu di dekat pesisir Cebu fiktif, bukan bukti terverifikasi", "Ảnh do AI tạo về tình nguyện viên thử thuyền gỗ gần bờ biển Cebu hư cấu, không phải bằng chứng đã xác minh"],
    caption: ["AI concept: intended coastal livelihood support. Not verified delivery evidence.", "Konsepto ng AI: nilalayong suporta sa kabuhayan sa baybayin. Hindi na-verify na ebidensya ng paghahatid.", "Konsep AI: dukungan mata pencaharian pesisir yang direncanakan. Bukan bukti penyaluran terverifikasi.", "Ý tưởng AI: hỗ trợ sinh kế ven biển dự kiến. Không phải bằng chứng bàn giao đã xác minh."],
  }],
]);

function galleryDisplay(photo: CircleGalleryPhoto, circleId: string, locale: Locale): CircleGalleryPhoto {
  const index = localeIndex[locale];
  const special = circleId === "tino-relief" ? TINO_GALLERY.get(photo.src) : undefined;
  if (special) {
    return photo.alt === special.alt[0] && photo.caption === special.caption[0]
      ? { ...photo, alt: special.alt[index], caption: special.caption[index] } : photo;
  }
  const sceneId = /^\/circles\/generated\/([a-z0-9-]+)\.png$/.exec(photo.src)?.[1];
  const scene = sceneId ? authoredById.get(sceneId) : undefined;
  const caption = photo.caption === COVER_CAPTION[0] ? COVER_CAPTION : photo.caption === RELATED_CAPTION[0] ? RELATED_CAPTION : undefined;
  if (!scene || !caption || photo.alt !== sceneAlt(scene.scene[0], "en")) return photo;
  return { ...photo, alt: sceneAlt(scene.scene[index], locale), caption: caption[index] };
}

const UPDATE_TITLES: Record<CircleUpdate["kind"], AuthoredText> = {
  milestone: ["Example planning milestone", "Halimbawang yugto ng pagpaplano", "Contoh tonggak perencanaan", "Mốc lập kế hoạch mẫu"],
  spend: ["Example spending breakdown", "Halimbawang detalye ng paggastos", "Contoh rincian pengeluaran", "Bảng chi tiêu mẫu"],
  delivery: ["Example delivery progress", "Halimbawang progreso ng paghahatid", "Contoh progres penyaluran", "Tiến độ bàn giao mẫu"],
};
const COMPLETED_UPDATE_TITLE: AuthoredText = ["Example completion and delivery", "Halimbawang pagtatapos at paghahatid", "Contoh penyelesaian dan penyaluran", "Hoàn thành và bàn giao mẫu"];
const UPDATE_PROOF: Record<CircleUpdate["kind"], AuthoredText> = {
  milestone: ["Synthetic planning note, not verified proof", "Sintetikong tala sa pagpaplano, hindi na-verify na patunay", "Catatan perencanaan sintetis, bukan bukti terverifikasi", "Ghi chú lập kế hoạch mô phỏng, không phải bằng chứng đã xác minh"],
  spend: ["Related AI illustration and synthetic expense, not a payment receipt", "Kaugnay na ilustrasyon ng AI at sintetikong gastos, hindi resibo ng bayad", "Ilustrasi AI terkait dan pengeluaran sintetis, bukan tanda terima pembayaran", "Minh họa AI liên quan và chi phí mô phỏng, không phải biên nhận thanh toán"],
  delivery: ["Related generated illustration, not verified delivery evidence", "Kaugnay na ilustrasyong nilikha, hindi na-verify na ebidensya ng paghahatid", "Ilustrasi yang dihasilkan terkait, bukan bukti penyaluran terverifikasi", "Minh họa được tạo liên quan, không phải bằng chứng bàn giao đã xác minh"],
};

function updateBody(kind: CircleUpdate["kind"], spec: AuthoredCause, locale: Locale): string {
  const purpose = spec.purpose[localeIndex[locale]];
  if (locale === "tl") {
    if (kind === "milestone") return `Kathang-isip na demo update: inilalahad ng halimbawang organizer ang panukala para sa ${purpose}. Inimbento ang mga pangalan, progreso at konsultasyon; walang aktuwal na proyekto o bayad na naitatag.`;
    if (kind === "spend") return `Kathang-isip na demo update: ipinapakita ng halimbawang linya sa badyet kung paano maaaring itala ang mga materyales at praktikal na suporta para sa ${purpose}. Sintetiko ang ipinapakitang gastos; walang perang inilipat at walang resibong na-verify.`;
    return `Kathang-isip na demo update: inilalarawan ng nilikhang tagpo ang nilalayong pakinabang ng ${purpose}. ${spec.completed ? "Ang katayuang tapos na ay para lamang sa kasaysayan ng demo." : "Bukas pa ang halimbawang layuning ito sa demo."} Walang tunay na paghahatid, benepisyaryo o donasyong na-verify.`;
  }
  if (locale === "id") {
    if (kind === "milestone") return `Pembaruan demo fiktif: penyelenggara contoh menguraikan usulan untuk ${purpose}. Nama, progres, dan konsultasi dibuat-buat; tidak ada proyek atau pembayaran aktual yang ditetapkan.`;
    if (kind === "spend") return `Pembaruan demo fiktif: pos anggaran ilustratif menunjukkan bagaimana bahan dan dukungan praktis untuk ${purpose} dapat dicatat. Pengeluaran yang ditampilkan bersifat sintetis; tidak ada dana yang berpindah dan tidak ada tanda terima yang diverifikasi.`;
    return `Pembaruan demo fiktif: adegan yang dihasilkan menggambarkan manfaat yang direncanakan dari ${purpose}. ${spec.completed ? "Status selesai ini hanya berlaku pada riwayat demo." : "Tujuan contoh ini masih terbuka dalam demo."} Tidak ada penyaluran nyata, penerima manfaat, atau donasi yang telah diverifikasi.`;
  }
  if (locale === "vi") {
    if (kind === "milestone") return `Cập nhật trình diễn hư cấu: nhà tổ chức mẫu phác thảo đề xuất cho ${purpose}. Tên, tiến độ và hoạt động tham vấn đều hư cấu; không xác lập dự án hay thanh toán thực tế nào.`;
    if (kind === "spend") return `Cập nhật trình diễn hư cấu: dòng ngân sách minh họa cho thấy cách ghi nhận vật liệu và hỗ trợ thiết thực cho ${purpose}. Chi phí hiển thị là mô phỏng; không có tiền được chuyển và không có biên nhận nào được xác minh.`;
    return `Cập nhật trình diễn hư cấu: cảnh được tạo minh họa lợi ích dự kiến của ${purpose}. ${spec.completed ? "Trạng thái hoàn thành này chỉ thuộc lịch sử trình diễn." : "Mục tiêu mẫu này vẫn đang mở trong bản trình diễn."} Chưa xác minh việc bàn giao thực tế, người thụ hưởng hay quyên góp nào.`;
  }
  if (kind === "milestone") return `Fictional demo update: the sample organizer outlines a proposal for ${purpose}. Names, progress and consultation are invented; no actual project or payment is established.`;
  if (kind === "spend") return `Fictional demo update: an illustrative budget line shows how materials and practical support for ${purpose} could be recorded. The displayed expense is synthetic; no funds moved and no receipt was verified.`;
  return `Fictional demo update: the generated scene illustrates the intended benefit of ${purpose}. ${spec.completed ? "This completed status belongs only to the demo history." : "This sample cause remains open in the demo."} No real delivery, beneficiary or donation has been verified.`;
}

function updateDisplay(update: CircleUpdate, circleId: string, spec: AuthoredCause, locale: Locale): CircleUpdate {
  const title = update.kind === "delivery" && spec.completed ? COMPLETED_UPDATE_TITLE : UPDATE_TITLES[update.kind];
  const proof = UPDATE_PROOF[update.kind];
  if (!title || !proof || update.id !== `${circleId}-${update.kind}` || update.title !== title[0]
    || update.body !== updateBody(update.kind, spec, "en") || update.proofLabel !== proof[0]) return update;
  return { ...update, title: title[localeIndex[locale]], body: updateBody(update.kind, spec, locale), proofLabel: proof[localeIndex[locale]] };
}

function originalContent(circle: Circle): CircleDisplayContent {
  return { title: circle.title, summary: circle.summary, story: circle.story, updates: circle.updates, gallery: circle.gallery, imageAlt: circle.imageAlt };
}

/** Display copy only. Never replace the title stored in a D4 contract or draft.
 * A known ID alone is insufficient: both authored title and story must match,
 * and circles created in the current session must always retain their text.
 */
export function circleDisplayContent(circle: Circle, locale: Locale): CircleDisplayContent {
  const original = originalContent(circle);
  if (circle.ephemeral) return original;
  const spec = authoredById.get(circle.id);
  if (!spec || circle.title !== spec.title[0] || circle.story !== storyFor(spec.purpose[0], "en")) return original;
  if (locale === "en") return { ...original, title: englishTitleOverrides.get(circle.id) ?? circle.title };
  const index = localeIndex[locale];
  return {
    title: spec.title[index],
    summary: circle.summary === `${SUMMARY_PREFIX[0]}${spec.purpose[0]}.` ? `${SUMMARY_PREFIX[index]}${spec.purpose[index]}.` : circle.summary,
    story: storyFor(spec.purpose[index], locale),
    imageAlt: circle.imageAlt === sceneAlt(spec.scene[0], "en") ? sceneAlt(spec.scene[index], locale) : circle.imageAlt,
    updates: circle.updates?.map(update => updateDisplay(update, circle.id, spec, locale)),
    gallery: circle.gallery?.map(photo => galleryDisplay(photo, circle.id, locale)),
  };
}

/** For callers that have already validated a trusted canonical catalog ID.
 * This helper must not infer associations from a contract or user title.
 */
export function circleDisplayTitle(circleId: string, locale: Locale): string | undefined {
  const spec = authoredById.get(circleId);
  return spec ? (locale === "en" ? englishTitleOverrides.get(circleId) ?? spec.title[0] : spec.title[localeIndex[locale]]) : undefined;
}
