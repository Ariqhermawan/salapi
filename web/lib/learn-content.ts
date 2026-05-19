// Salapi — Learn section content. Ported verbatim from V4 salapi/learn.jsx
// (LEARN + LEARN_X). Journalistic, not promotional. Figures are bracketed
// slots, never invented. Localized: en · tl · id · vi.

import type { Locale } from "./i18n/config";

export type LearnTopicId = "fund" | "circle" | "grow";
export const LEARN_TOPICS: LearnTopicId[] = ["fund", "circle", "grow"];

export type LearnCard = {
  id: LearnTopicId;
  pose: "wave" | "point" | "cheer" | "think";
  kicker: string;
  title: string;
  blurb: string;
  mins: number;
};
type Nav = { home: string; vaults: string; learn: string; activity: string; you: string };
type KV = { k: string; v: string };
type Glossary = { lang: string; word: string };
type Case = { flag: string; country: string; story: string; source: string };
type FundTopic = { eyebrow: string; title: string; lede: string; p1: string; p2: string; p3: string; promise: string; cases: Case[]; stats: KV[] };
type CircleTopic = { eyebrow: string; title: string; lede: string; p1: string; p2: string; p3: string; promise: string; glossary: Glossary[] };
type GrowTopic = { eyebrow: string; title: string; lede: string; p1: string; p2: string; p3: string; promise: string; apy: { label: string; value: string }; stack: { t: string; s: string }[] };
export type LearnLang = {
  nav: Nav;
  indexEyebrow: string;
  indexTitle: string;
  indexSub: string;
  readTime: string;
  cards: LearnCard[];
  fund: FundTopic;
  circle: CircleTopic;
  grow: GrowTopic;
};

export const LEARN: Record<Locale, LearnLang> = {
  en: {
    nav: { home: "Home", vaults: "Vaults", learn: "Learn", activity: "Activity", you: "You" },
    indexEyebrow: "Learn",
    indexTitle: "How Salapi works, in plain language.",
    indexSub: "Three short reads. Written like a newspaper, not a brochure.",
    readTime: " min read",
    cards: [
      { id: "fund", pose: "point", kicker: ".fund", title: "Disaster Relief — where the money actually goes.", blurb: "Why traditional pots disappear, and how a public vault makes every peso traceable.", mins: 4 },
      { id: "circle", pose: "wave", kicker: ".circles", title: "Arisan · Paluwagan · Hụi — saving together, safely.", blurb: "Centuries of trust between neighbours, and the contract that now holds the pot.", mins: 3 },
      { id: "grow", pose: "cheer", kicker: ".grow", title: "Smart Savings — how your money grows.", blurb: "A vault on Stellar, automatic yield via audited DeFi. Illustrative on testnet.", mins: 5 },
    ],
    fund: {
      eyebrow: ".fund · Disaster Relief",
      title: "Relief money has a way of disappearing.",
      lede: "Every disaster brings two waves — the water, then the money. The first is reported in detail. The second often isn't — and across this region, the public record is full of relief and aid funds that never reached the people they were raised for.",
      p1: "This isn't a rumour. It is written in audit reports and court verdicts. Emergency money is attractive to the wrong people precisely because it moves fast, in volume, under pressure — the exact conditions in which oversight is weakest and diversion is easiest.",
      p2: "We built Salapi for the gap between a donor's intention and a family's hand. Not another appeal asking you to trust harder — but plumbing that removes the need to. A relief pot you can read like a public bank statement, where “we'll account for it later” becomes “it's accounted for, line by line, now.” That gap is why this company exists.",
      p3: "You give in your own money — no wallet, no chain, no token to learn. Contributions land in a vault held by a smart contract on Stellar; every release is signed, conditional and public, receipts attached and recipients named. Donors, NGOs, journalists, regulators and the families themselves read the same page, in seconds — check, don't trust.",
      promise: "A civic promise, not a crypto pitch: when you give for relief, you should be able to watch it land.",
      cases: [
        { flag: "🇵🇭", country: "Philippines · the “pork barrel”", story: "In 2013 the Priority Development Assistance Fund was exposed: public money — including allocations for development and calamity projects — funnelled through bogus NGOs. The Commission on Audit's special audit detailed it; Janet Lim-Napoles, named at the centre, was later convicted. After Super Typhoon Yolanda that same year, auditors again flagged rehabilitation funds left unliquidated.", source: "Source: Commission on Audit (COA); Philippine Daily Inquirer; Rappler — 2013–2014 · team: attach links" },
        { flag: "🇮🇩", country: "Indonesia · bansos COVID-19", story: "In 2020, at the height of the pandemic, Indonesia's Social Affairs Minister was arrested by the Corruption Eradication Commission (KPK) for taking kickbacks on COVID-19 social-aid (bansos) procurement — emergency relief skimmed before it reached households. He was tried and imprisoned.", source: "Source: KPK; Reuters; BBC; Tempo — 2020–2021 · team: attach links" },
        { flag: "🇻🇳", country: "Vietnam · Việt Á & rescue flights", story: "In 2021–2022, Vietnam's pandemic response produced two major graft cases: the Việt Á test-kit scandal — inflated prices and kickbacks to officials nationwide — and bribery around state-organised repatriation flights. Dozens of officials were prosecuted.", source: "Source: Reuters; BBC; VnExpress — 2021–2022 · team: attach links" },
      ],
      stats: [
        { k: "Pesos in pool today", v: "[verified figure]" },
        { k: "Families served", v: "[verified figure]" },
        { k: "Open NGO partners", v: "[verified figure]" },
      ],
    },
    circle: {
      eyebrow: ".circles · Saving together",
      title: "Saving circles — Paluwagan, Arisan, Chơi hụi.",
      lede: "A practice older than banks. Every culture in this region knows it by a different name.",
      p1: "A handful of trusted people agree to put in a small amount on a schedule. Each cycle, one of them takes the pot. The next cycle, another. It is the oldest peer-to-peer savings system in the region — Paluwagan in the Philippines, Arisan in Indonesia, Chơi hụi in Vietnam, Tanda in Mexico, Susu in West Africa.",
      p2: "There is only ever one real fear in a circle: the person holding the money for the round disappears. It is a fear earned across generations.",
      p3: "Salapi keeps the social ritual exactly as it is — friends, family, neighbours, names you trust — and changes only the holder. The pot is held by a contract on Stellar that is forbidden to release the funds except to the named recipient for that round, at the agreed time. The contract cannot block you. It cannot keep your money. It cannot pick a favourite.",
      promise: "The contract holds the pot. No one can run away with it.",
      glossary: [
        { lang: "EN", word: "Saving circle" },
        { lang: "TL", word: "Paluwagan" },
        { lang: "ID", word: "Arisan" },
        { lang: "VI", word: "Chơi hụi" },
      ],
    },
    grow: {
      eyebrow: ".grow · Smart Savings",
      title: "How your money grows in Salapi.",
      lede: "This is the one page where we name what the rest of the app hides — and tell you exactly how.",
      p1: "When you lock pesos in a Smart Savings goal, Salapi converts them to USDC — a digital dollar — and parks them in a vault on the Stellar blockchain network. While they are there, the vault automatically deposits them into audited DeFi protocols that earn yield, the way a money-market account does for banks.",
      p2: "You don't see any of that. You see your goal, the bar filling, the date you reach the target. When you withdraw, USDC is converted back to your local currency and lands in your bank account or GCash. That is the entire trick: the boring view for you, the open infrastructure for accountability.",
      p3: "Yields move with the market. The figure below is illustrative — it is how the math plays out today, on testnet, against the protocols we are integrating. Real yield, real audits, and real disclosures arrive at mainnet launch.",
      apy: { label: "Illustrative APY · testnet", value: "~ [4–6]%" },
      stack: [
        { t: "Salapi vault", s: "Pesos in, pesos out. The view you see." },
        { t: "Stellar contract", s: "Holds the funds in your name. Public on-chain." },
        { t: "Audited DeFi", s: "Generates yield. Independently auditable." },
      ],
      promise: "Honest, not hype. You always see the fee before you confirm. Mainnet figures will be labelled and disclosed.",
    },
  },
  tl: {
    nav: { home: "Tahanan", vaults: "Vault", learn: "Alamin", activity: "Aktibidad", you: "Ikaw" },
    indexEyebrow: "Alamin",
    indexTitle: "Paano gumagana ang Salapi — sa malinaw na wika.",
    indexSub: "Tatlong maikling babasahin. Parang dyaryo, hindi brochure.",
    readTime: " min basa",
    cards: [
      { id: "fund", pose: "point", kicker: ".fund", title: "Tulong sa sakuna — saan talaga napupunta ang pera.", blurb: "Bakit may nawawala sa lumang paraan, at paano natitiyak ngayong bawat piso ay masusubaybayan.", mins: 4 },
      { id: "circle", pose: "wave", kicker: ".circles", title: "Paluwagan — sama-samang nag-iipon, ligtas.", blurb: "Daan-taóng tiwala sa kapwa, at ang kontratang humahawak ngayon ng pot.", mins: 3 },
      { id: "grow", pose: "cheer", kicker: ".grow", title: "Matalinong ipon — paano lumalago ang pera mo.", blurb: "Vault sa Stellar, awtomatikong yield. Pang-ilaw lang sa testnet.", mins: 5 },
    ],
    fund: {
      eyebrow: ".fund · Tulong sa sakuna",
      title: "May ugali ang pera ng tulong na maglaho.",
      lede: "Bawat sakuna, dalawang alon — ang tubig, tapos ang pera. Ang una, detalyadong naibabalita. Ang pangalawa, madalas hindi — at sa rehiyong ito, puno ang opisyal na rekord ng pondong tulong na hindi nakarating sa mga taong pinaglaanan.",
      p1: "Hindi ito tsismis. Nakasulat ito sa audit report at hatol ng korte. Ang pera ng emergency ay nakakaakit sa maling tao dahil mabilis itong gumagalaw, malaki, sa ilalim ng presyon — ang mismong kondisyon kung saan pinakamahina ang pagbabantay at pinakamadali ang pagdaya.",
      p2: "Itinayo namin ang Salapi para sa puwang sa pagitan ng layunin ng donor at ng kamay ng pamilya. Hindi panibagong panawagang “magtiwala pa nang mas malalim” — kundi imprastrukturang nag-aalis ng pangangailangang magtiwala. Pondong tulong na kayang basahin parang pampublikong bank statement, kung saan ang “ipapaliwanag namin mamaya” ay nagiging “nakapaliwanag na, linya por linya, ngayon.” Iyon ang dahilan kung bakit umiiral ang kumpanyang ito.",
      p3: "Nagbibigay ka sa sarili mong pera — walang wallet, chain, o token na pag-aaralan. Tumatapos ang kontribusyon sa vault na hawak ng smart contract sa Stellar; bawat paglabas ay naka-sign, may kondisyon, at pampubliko, may resibo at pangalan ang tatanggap. Donor, NGO, mamamahayag, regulator, at ang mga pamilya mismo — iisang pahina, sa loob ng segundo. Tingnan, huwag basta magtiwala.",
      promise: "Pangako sa lipunan, hindi pitch sa crypto: kapag nagbigay ka para sa tulong, dapat mong makitang nakarating ito.",
      cases: [
        { flag: "🇵🇭", country: "Pilipinas · ang “pork barrel”", story: "Noong 2013, nabunyag ang Priority Development Assistance Fund: pampublikong pera — kasama ang para sa proyektong pangkaunlaran at kalamidad — na dinaan sa mga pekeng NGO. Detalyado ito sa espesyal na audit ng Commission on Audit; si Janet Lim-Napoles, na nasa sentro, ay nahatulan kalaunan. Pagkatapos ng Super Typhoon Yolanda nang taon ding iyon, muling tinukoy ng auditor ang pondong rehabilitasyon na hindi na-liquidate.", source: "Pinagmulan: Commission on Audit (COA); Philippine Daily Inquirer; Rappler — 2013–2014 · team: ilakip ang link" },
        { flag: "🇮🇩", country: "Indonesia · bansos COVID-19", story: "Noong 2020, sa kasagsagan ng pandemya, inaresto ng Corruption Eradication Commission (KPK) ang Ministro ng Social Affairs ng Indonesia dahil sa kickback sa procurement ng social-aid (bansos) para sa COVID-19 — tulong-pang-emergency na ninakawan bago makarating sa mga tahanan. Nilitis siya at nakulong.", source: "Pinagmulan: KPK; Reuters; BBC; Tempo — 2020–2021 · team: ilakip ang link" },
        { flag: "🇻🇳", country: "Vietnam · Việt Á at rescue flights", story: "Noong 2021–2022, dalawang malaking kaso ng graft ang lumabas sa pandemic response ng Vietnam: ang Việt Á test-kit scandal — pinalaking presyo at kickback sa mga opisyal sa buong bansa — at suhol sa repatriation flights na inorganisa ng estado. Dose-dosenang opisyal ang nasakdal.", source: "Pinagmulan: Reuters; BBC; VnExpress — 2021–2022 · team: ilakip ang link" },
      ],
      stats: [
        { k: "Piso sa pool ngayon", v: "[verified na bilang]" },
        { k: "Pamilyang natulungan", v: "[verified na bilang]" },
        { k: "Kasamang NGO", v: "[verified na bilang]" },
      ],
    },
    circle: {
      eyebrow: ".circles · Sama-samang nag-iipon",
      title: "Paluwagan — Arisan, Chơi hụi.",
      lede: "Mas matanda kaysa sa bangko. Bawat kultura sa rehiyon, may sariling pangalan dito.",
      p1: "Ilang taong magkakakilala ang sumasang-ayon na magbigay ng kaunti, sunod-sunod. Bawat ikot, isa sa kanila ang kumukuha ng pot. Sa sunod na ikot, iba naman. Ito ang pinakamatandang peer-to-peer na pag-iipon sa rehiyon — Paluwagan sa Pilipinas, Arisan sa Indonesia, Chơi hụi sa Vietnam.",
      p2: "Iisa lang ang tunay na takot sa paluwagan: nawala ang humahawak ng pera para sa ikot na iyon. Takot na napatunayan ng maraming henerasyon.",
      p3: "Inilalagay ng Salapi ang sosyal na ritwal kung paano siya talaga — magkakaibigan, magkapamilya, magkakapitbahay — at ang humahawak lang ng pera ang binabago. Hawak ng kontrata sa Stellar ang pot, bawal magpalabas maliban sa nominado para sa ikot na ito, sa napagkasunduang oras. Hindi ka maaaring i-block ng kontrata. Hindi nito kayang itago ang pera mo. Hindi nito kayang may paboritism.",
      promise: "Ang kontrata ang humahawak sa pot. Walang makakatakas dito.",
      glossary: [
        { lang: "EN", word: "Saving circle" },
        { lang: "TL", word: "Paluwagan" },
        { lang: "ID", word: "Arisan" },
        { lang: "VI", word: "Chơi hụi" },
      ],
    },
    grow: {
      eyebrow: ".grow · Matalinong ipon",
      title: "Paano lumalago ang pera mo sa Salapi.",
      lede: "Ito ang isang page kung saan binabanggit namin nang malinaw ang itinatago ng buong app — at kung paano talaga.",
      p1: "Kapag nag-lock ka ng piso sa Smart Savings goal, kinokonbert ng Salapi ang mga ito sa USDC — digital dollar — at inilalagay sa vault sa Stellar blockchain network. Habang nandoon, awtomatikong nide-deposit ito sa audited DeFi protocols na nagbabayad ng yield, kagaya ng money-market account ng mga bangko.",
      p2: "Hindi mo nakikita lahat ng ito. Yung goal mo lang ang nakikita mo, yung bar na napupuno, yung petsang aabot ka sa target. Pag-withdraw mo, kinokonbert pabalik sa pisong currency at dumarating sa bangko o GCash mo. Yan ang buong trick: tahimik na view para sa’yo, bukás na imprastraktura para sa pananagutan.",
      p3: "Gumagalaw ang yield kasama ng market. Pang-ilaw lang ang numero sa ibaba — kung paano ito lumalabas sa testnet ngayon, laban sa mga protokol na ini-integrate namin. Tunay na yield, tunay na audit, tunay na disclosure — sa mainnet launch.",
      apy: { label: "Pang-ilaw na APY · testnet", value: "~ [4–6]%" },
      stack: [
        { t: "Salapi vault", s: "Piso pasok, piso labas. Yan ang view mo." },
        { t: "Stellar contract", s: "Hawak ang pera sa pangalan mo. Public on-chain." },
        { t: "Audited DeFi", s: "Nagpa-yield. Maaaring auditin ng iba." },
      ],
      promise: "Tapat, walang pagmamayabang. Makikita mo ang fee bago ka mag-confirm. May label at disclosure ang lahat ng mainnet figure.",
    },
  },
  id: {
    nav: { home: "Beranda", vaults: "Vault", learn: "Pelajari", activity: "Aktivitas", you: "Kamu" },
    indexEyebrow: "Pelajari",
    indexTitle: "Cara kerja Salapi — bahasa yang jelas.",
    indexSub: "Tiga bacaan singkat. Seperti koran, bukan brosur.",
    readTime: " menit baca",
    cards: [
      { id: "fund", pose: "point", kicker: ".fund", title: "Bantuan bencana — ke mana dananya benar-benar pergi.", blurb: "Mengapa pot tradisional hilang, dan bagaimana setiap rupiah bisa dilacak.", mins: 4 },
      { id: "circle", pose: "wave", kicker: ".circles", title: "Arisan — menabung bersama, dengan aman.", blurb: "Kepercayaan turun-temurun antar tetangga, dan kontrak yang kini memegang pot.", mins: 3 },
      { id: "grow", pose: "cheer", kicker: ".grow", title: "Tabungan pintar — bagaimana uangmu bertumbuh.", blurb: "Vault di Stellar, yield otomatis. Ilustratif di testnet.", mins: 5 },
    ],
    fund: {
      eyebrow: ".fund · Bantuan bencana",
      title: "Dana bantuan punya kebiasaan menghilang.",
      lede: "Setiap bencana membawa dua gelombang — air, lalu uang. Yang pertama diberitakan rinci. Yang kedua sering tidak — dan di kawasan ini, rekam publik penuh dana bantuan yang tak pernah sampai ke orang yang dituju.",
      p1: "Ini bukan desas-desus. Tertulis di laporan audit dan putusan pengadilan. Uang darurat menarik bagi orang yang salah justru karena bergerak cepat, dalam jumlah besar, di bawah tekanan — kondisi persis ketika pengawasan paling lemah dan penyelewengan paling mudah.",
      p2: "Kami membangun Salapi untuk jarak antara niat donatur dan tangan sebuah keluarga. Bukan ajakan baru agar kamu “lebih percaya” — tapi infrastruktur yang menghapus kebutuhan untuk percaya. Pot bantuan yang bisa kamu baca seperti rekening koran publik, di mana “nanti kami pertanggungjawabkan” menjadi “sudah dipertanggungjawabkan, baris per baris, sekarang.” Jarak itulah alasan perusahaan ini ada.",
      p3: "Kamu memberi dalam uangmu sendiri — tanpa wallet, blockchain, atau token yang harus dipelajari. Kontribusi mendarat di vault yang dipegang kontrak pintar di Stellar; setiap pencairan ditandatangani, bersyarat, dan publik, kuitansi terlampir, penerima disebut namanya. Donatur, NGO, jurnalis, regulator, dan keluarga itu sendiri membaca halaman yang sama, dalam hitungan detik — periksa, bukan sekadar percaya.",
      promise: "Janji publik, bukan promosi kripto: saat kamu memberi untuk bantuan, kamu harus bisa melihatnya sampai.",
      cases: [
        { flag: "🇵🇭", country: "Filipina · “pork barrel”", story: "Pada 2013, Priority Development Assistance Fund terbongkar: uang publik — termasuk untuk proyek pembangunan dan kalamitas — dialirkan lewat NGO fiktif. Audit khusus Commission on Audit merincinya; Janet Lim-Napoles, yang disebut berada di pusatnya, kemudian divonis bersalah. Setelah Topan Super Yolanda pada tahun yang sama, auditor kembali menyoroti dana rehabilitasi yang tak dipertanggungjawabkan.", source: "Sumber: Commission on Audit (COA); Philippine Daily Inquirer; Rappler — 2013–2014 · tim: lampirkan tautan" },
        { flag: "🇮🇩", country: "Indonesia · bansos COVID-19", story: "Pada 2020, di puncak pandemi, Menteri Sosial Indonesia ditangkap Komisi Pemberantasan Korupsi (KPK) atas suap pengadaan bantuan sosial (bansos) COVID-19 — bantuan darurat disunat sebelum sampai ke rumah tangga. Ia diadili dan dipenjara.", source: "Sumber: KPK; Reuters; BBC; Tempo — 2020–2021 · tim: lampirkan tautan" },
        { flag: "🇻🇳", country: "Vietnam · Việt Á & rescue flights", story: "Pada 2021–2022, respons pandemi Vietnam memunculkan dua kasus korupsi besar: skandal alat tes Việt Á — harga digelembungkan dan suap ke pejabat di seluruh negeri — serta suap di balik penerbangan repatriasi yang diorganisasi negara. Puluhan pejabat dituntut.", source: "Sumber: Reuters; BBC; VnExpress — 2021–2022 · tim: lampirkan tautan" },
      ],
      stats: [
        { k: "Rupiah di pool hari ini", v: "[angka terverifikasi]" },
        { k: "Keluarga yang dibantu", v: "[angka terverifikasi]" },
        { k: "Mitra NGO terbuka", v: "[angka terverifikasi]" },
      ],
    },
    circle: {
      eyebrow: ".circles · Menabung bersama",
      title: "Arisan — Paluwagan, Chơi hụi.",
      lede: "Lebih tua daripada bank. Setiap budaya di kawasan ini punya namanya sendiri.",
      p1: "Beberapa orang yang saling percaya sepakat memasukkan jumlah kecil secara berkala. Setiap putaran, salah satu mengambil pot. Putaran berikutnya, yang lain. Ini sistem tabungan peer-to-peer tertua di kawasan — Arisan di Indonesia, Paluwagan di Filipina, Chơi hụi di Vietnam.",
      p2: "Hanya ada satu ketakutan nyata di arisan: orang yang memegang uang putaran itu menghilang. Ketakutan yang dipelajari turun-temurun.",
      p3: "Salapi mempertahankan ritual sosialnya persis seperti adanya — teman, keluarga, tetangga, nama yang kamu percaya — dan hanya mengganti pemegangnya. Pot dipegang oleh kontrak di Stellar yang dilarang merilis dana kecuali kepada penerima yang ditentukan untuk putaran itu, pada waktu yang disepakati. Kontrak tidak bisa memblokirmu. Tidak bisa menahan uangmu. Tidak bisa pilih kasih.",
      promise: "Kontrak yang memegang pot. Tidak ada yang bisa lari membawanya.",
      glossary: [
        { lang: "EN", word: "Saving circle" },
        { lang: "TL", word: "Paluwagan" },
        { lang: "ID", word: "Arisan" },
        { lang: "VI", word: "Chơi hụi" },
      ],
    },
    grow: {
      eyebrow: ".grow · Tabungan pintar",
      title: "Bagaimana uangmu bertumbuh di Salapi.",
      lede: "Inilah satu halaman tempat kami menyebutkan apa yang disembunyikan aplikasi lainnya — dan bagaimana persisnya.",
      p1: "Saat kamu mengunci rupiah dalam tujuan Tabungan Pintar, Salapi mengonversinya ke USDC — dolar digital — dan menempatkannya di vault pada jaringan blockchain Stellar. Selama di sana, vault secara otomatis menyetorkannya ke protokol DeFi teraudit yang menghasilkan yield, seperti rekening pasar uang bagi bank.",
      p2: "Kamu tidak melihat semua itu. Kamu melihat tujuanmu, bar yang terisi, tanggal kamu mencapai target. Saat kamu menarik, USDC dikonversi kembali ke mata uang lokal dan masuk ke rekening atau GCash. Itulah triknya: tampilan tenang untukmu, infrastruktur terbuka untuk akuntabilitas.",
      p3: "Yield bergerak mengikuti pasar. Angka di bawah ini ilustratif — cara matematika berjalan hari ini, di testnet, terhadap protokol yang sedang kami integrasikan. Yield, audit, dan disclosure nyata datang saat peluncuran mainnet.",
      apy: { label: "APY ilustratif · testnet", value: "~ [4–6]%" },
      stack: [
        { t: "Vault Salapi", s: "Rupiah masuk, rupiah keluar. Tampilan yang kamu lihat." },
        { t: "Kontrak Stellar", s: "Memegang dana atas namamu. Publik on-chain." },
        { t: "DeFi teraudit", s: "Menghasilkan yield. Bisa diaudit independen." },
      ],
      promise: "Jujur, bukan hype. Kamu selalu melihat biaya sebelum konfirmasi. Angka mainnet akan diberi label dan diumumkan.",
    },
  },
  vi: {
    nav: { home: "Trang chủ", vaults: "Két", learn: "Tìm hiểu", activity: "Hoạt động", you: "Bạn" },
    indexEyebrow: "Tìm hiểu",
    indexTitle: "Salapi hoạt động như thế nào — bằng ngôn ngữ rõ ràng.",
    indexSub: "Ba bài đọc ngắn. Như báo, không phải tờ rơi.",
    readTime: " phút đọc",
    cards: [
      { id: "fund", pose: "point", kicker: ".fund", title: "Cứu trợ thiên tai — tiền thực sự đi về đâu.", blurb: "Vì sao quỹ truyền thống bốc hơi, và cách mỗi đồng được lần theo.", mins: 4 },
      { id: "circle", pose: "wave", kicker: ".circles", title: "Chơi hụi — tiết kiệm cùng nhau, an toàn.", blurb: "Niềm tin nhiều thế hệ giữa hàng xóm, và hợp đồng giờ giữ hũ tiền.", mins: 3 },
      { id: "grow", pose: "cheer", kicker: ".grow", title: "Tiết kiệm thông minh — tiền của bạn lớn lên ra sao.", blurb: "Két trên Stellar, lãi tự động. Minh hoạ trên testnet.", mins: 5 },
    ],
    fund: {
      eyebrow: ".fund · Cứu trợ thiên tai",
      title: "Tiền cứu trợ có thói quen biến mất.",
      lede: "Mỗi thảm hoạ mang hai đợt sóng — nước, rồi tiền. Đợt đầu được tường thuật chi tiết. Đợt sau thường thì không — và ở vùng này, hồ sơ công khai đầy những khoản cứu trợ chưa từng tới tay người được quyên cho.",
      p1: "Đây không phải tin đồn. Nó nằm trong báo cáo kiểm toán và bản án của toà. Tiền khẩn cấp hấp dẫn kẻ xấu chính vì nó chạy nhanh, số lớn, dưới áp lực — đúng lúc giám sát yếu nhất và bòn rút dễ nhất.",
      p2: "Chúng tôi dựng Salapi cho khoảng trống giữa ý định của người cho và bàn tay một gia đình. Không phải một lời kêu gọi mới bảo bạn “hãy tin nhiều hơn” — mà là hạ tầng xoá bỏ nhu cầu phải tin. Một hũ cứu trợ bạn đọc được như sao kê ngân hàng công khai, nơi “sẽ giải trình sau” trở thành “đã giải trình, từng dòng, ngay bây giờ.” Khoảng trống đó là lý do công ty này tồn tại.",
      p3: "Bạn cho bằng đồng tiền của mình — không ví, không chain, không token phải học. Khoản đóng góp đáp xuống két do hợp đồng thông minh trên Stellar giữ; mỗi lần giải ngân đều được ký, có điều kiện và công khai, kèm hoá đơn và nêu tên người nhận. Nhà tài trợ, NGO, nhà báo, cơ quan quản lý và chính các gia đình cùng đọc một trang, trong vài giây — kiểm chứng, đừng chỉ tin.",
      promise: "Lời hứa công dân, không phải quảng cáo crypto: khi bạn cho để cứu trợ, bạn phải thấy được nó tới nơi.",
      cases: [
        { flag: "🇵🇭", country: "Philippines · “pork barrel”", story: "Năm 2013, Quỹ Hỗ trợ Phát triển Ưu tiên (PDAF) bị phơi bày: tiền công — gồm cả phần cho dự án phát triển và thiên tai — chảy qua các NGO ma. Cuộc kiểm toán đặc biệt của Uỷ ban Kiểm toán (COA) nêu chi tiết; bà Janet Lim-Napoles, bị nêu ở trung tâm vụ việc, sau đó bị kết án. Sau siêu bão Yolanda cùng năm, kiểm toán lại chỉ ra các khoản tái thiết không quyết toán.", source: "Nguồn: Commission on Audit (COA); Philippine Daily Inquirer; Rappler — 2013–2014 · nhóm: đính kèm link" },
        { flag: "🇮🇩", country: "Indonesia · bansos COVID-19", story: "Năm 2020, giữa cao điểm đại dịch, Bộ trưởng Xã hội Indonesia bị Uỷ ban Bài trừ Tham nhũng (KPK) bắt vì nhận lại quả trong mua sắm trợ cấp xã hội (bansos) COVID-19 — cứu trợ khẩn cấp bị cắt xén trước khi tới hộ dân. Ông bị xét xử và bỏ tù.", source: "Nguồn: KPK; Reuters; BBC; Tempo — 2020–2021 · nhóm: đính kèm link" },
        { flag: "🇻🇳", country: "Việt Nam · Việt Á & chuyến bay giải cứu", story: "Năm 2021–2022, ứng phó đại dịch của Việt Nam làm lộ hai vụ tham nhũng lớn: vụ kit xét nghiệm Việt Á — thổi giá và lại quả cho cán bộ trên cả nước — và hối lộ quanh các chuyến bay hồi hương do nhà nước tổ chức. Hàng chục quan chức bị truy tố.", source: "Nguồn: Reuters; BBC; VnExpress — 2021–2022 · nhóm: đính kèm link" },
      ],
      stats: [
        { k: "Tiền trong quỹ hôm nay", v: "[con số đã kiểm chứng]" },
        { k: "Số gia đình được giúp", v: "[con số đã kiểm chứng]" },
        { k: "NGO đối tác công khai", v: "[con số đã kiểm chứng]" },
      ],
    },
    circle: {
      eyebrow: ".circles · Tiết kiệm cùng nhau",
      title: "Chơi hụi — Paluwagan, Arisan.",
      lede: "Cổ hơn cả ngân hàng. Mỗi nền văn hoá trong vùng gọi nó bằng một cái tên riêng.",
      p1: "Một nhóm người tin cậy thoả thuận đóng một khoản nhỏ theo lịch. Mỗi vòng, một người nhận hũ. Vòng sau, người khác. Đây là hệ thống tiết kiệm peer-to-peer lâu đời nhất trong vùng — Chơi hụi ở Việt Nam, Paluwagan ở Philippines, Arisan ở Indonesia.",
      p2: "Chỉ có duy nhất một nỗi sợ thực sự trong hụi: người giữ tiền của vòng đó biến mất. Một nỗi sợ học được qua nhiều thế hệ.",
      p3: "Salapi giữ nguyên nghi thức xã hội — bạn bè, gia đình, hàng xóm, những cái tên bạn tin — chỉ đổi người giữ tiền. Hũ do hợp đồng trên Stellar giữ, bị cấm giải phóng quỹ trừ khi đúng người nhận đã định cho vòng đó, đúng giờ đã thoả thuận. Hợp đồng không thể chặn bạn. Không thể giữ tiền bạn. Không thể thiên vị.",
      promise: "Hợp đồng giữ hũ tiền. Không ai có thể ôm tiền chạy.",
      glossary: [
        { lang: "EN", word: "Saving circle" },
        { lang: "TL", word: "Paluwagan" },
        { lang: "ID", word: "Arisan" },
        { lang: "VI", word: "Chơi hụi" },
      ],
    },
    grow: {
      eyebrow: ".grow · Tiết kiệm thông minh",
      title: "Tiền của bạn lớn lên trong Salapi như thế nào.",
      lede: "Đây là trang duy nhất chúng tôi gọi đúng tên những gì phần còn lại của ứng dụng giấu đi — và nói rõ cách thức.",
      p1: "Khi bạn khoá tiền vào mục tiêu Tiết kiệm thông minh, Salapi quy đổi sang USDC — đồng đô-la kỹ thuật số — và gửi vào két trên mạng blockchain Stellar. Trong thời gian đó, két tự động gửi vào các giao thức DeFi đã được kiểm toán để sinh lãi, giống như tài khoản thị trường tiền tệ ở ngân hàng.",
      p2: "Bạn không thấy gì trong đó. Bạn chỉ thấy mục tiêu của mình, thanh tiến độ đầy lên, ngày đạt mục tiêu. Khi rút, USDC được quy đổi lại sang tiền địa phương và về tài khoản ngân hàng hay GCash. Đó là toàn bộ thủ thuật: cảnh êm cho bạn, hạ tầng mở cho trách nhiệm giải trình.",
      p3: "Lãi thay đổi theo thị trường. Con số bên dưới chỉ minh hoạ — cách phép tính chạy hôm nay, trên testnet, với các giao thức chúng tôi đang tích hợp. Lãi thật, kiểm toán thật, công bố thật — sẽ tới khi ra mainnet.",
      apy: { label: "APY minh hoạ · testnet", value: "~ [4–6]%" },
      stack: [
        { t: "Két Salapi", s: "Tiền vào, tiền ra. Cảnh bạn thấy." },
        { t: "Hợp đồng Stellar", s: "Giữ quỹ dưới tên bạn. Công khai on-chain." },
        { t: "DeFi đã kiểm toán", s: "Sinh lãi. Có thể được kiểm toán độc lập." },
      ],
      promise: "Thành thật, không thổi phồng. Bạn luôn thấy phí trước khi xác nhận. Số liệu mainnet sẽ được dán nhãn và công bố.",
    },
  },
};

// Per-topic "How it works" steps + calm CTA labels.
type Step = { icon: string; t: string; s: string };
type XTopic = { steps: Step[]; cta: { label: string; sub: string; icon: string } };
export type LearnXLang = { howHeading: string; fund: XTopic; circle: XTopic; grow: XTopic };

export const LEARN_X: Record<Locale, LearnXLang> = {
  en: {
    howHeading: "How it works",
    fund: {
      steps: [
        { icon: "hand", t: "Donate in pesos or rupiah", s: "No wallet, no chain, no token. You give local money." },
        { icon: "jar", t: "Held in a public vault", s: "Every coin lives on a Stellar smart contract anyone can read." },
        { icon: "ledger", t: "Released with receipts", s: "Funds release only on agreed conditions — units verified, line visible." },
      ],
      cta: { label: "Donate to the relief pool", sub: "Open the public vault", icon: "jar" },
    },
    circle: {
      steps: [
        { icon: "handshake", t: "Form a circle of trust", s: "Friends, family, neighbours — names you already know." },
        { icon: "calendar", t: "Pay your share each round", s: "Everyone puts in a small amount on schedule." },
        { icon: "padlock", t: "The pot rotates, safely", s: "A different member receives each round. The contract holds it — not a person." },
      ],
      cta: { label: "Start or join a circle", sub: "See open circles you can join", icon: "handshake" },
    },
    grow: {
      steps: [
        { icon: "vault", t: "Lock pesos in a goal", s: "You set the target and date. We convert to USDC behind the scenes." },
        { icon: "sprout", t: "Yield via audited DeFi", s: "The Stellar contract deposits into independently-audited protocols." },
        { icon: "coin", t: "Withdraw to your bank", s: "Pesos land back in your account or e-wallet on maturity." },
      ],
      cta: { label: "Open a Smart Savings goal", sub: "Set your target. See the date.", icon: "sprout" },
    },
  },
  tl: {
    howHeading: "Paano ito gumagana",
    fund: {
      steps: [
        { icon: "hand", t: "Magbigay sa piso", s: "Walang wallet, walang chain, walang token. Piso lang." },
        { icon: "jar", t: "Hawak sa publikong vault", s: "Bawat piso, nasa Stellar contract na nababasa ng kahit sino." },
        { icon: "ledger", t: "May resibo bago lumabas", s: "Lumalabas lang ayon sa kasunduan — verified, kitang-kita ang linya." },
      ],
      cta: { label: "Mag-donate sa relief pool", sub: "Buksan ang publikong vault", icon: "jar" },
    },
    circle: {
      steps: [
        { icon: "handshake", t: "Bumuo ng paluwagan", s: "Kaibigan, pamilya, kapitbahay — mga pangalang kilala mo." },
        { icon: "calendar", t: "Bayaran ang share kada ikot", s: "Bawat miyembro, kaunting halaga ayon sa iskedyul." },
        { icon: "padlock", t: "Umiikot ang pot, ligtas", s: "Iba ang tumatanggap kada ikot. Hawak ng kontrata, hindi tao." },
      ],
      cta: { label: "Magsimula o sumali sa paluwagan", sub: "Tingnan ang mga bukás na paluwagan", icon: "handshake" },
    },
    grow: {
      steps: [
        { icon: "vault", t: "I-lock ang piso sa goal", s: "Itakda ang target at petsa. Kinokonbert namin sa USDC." },
        { icon: "sprout", t: "Yield mula sa audited DeFi", s: "Nag-de-deposit ang Stellar contract sa mga audited protocol." },
        { icon: "coin", t: "Mag-withdraw sa bangko", s: "Pisong balik sa account o e-wallet kapag tapos." },
      ],
      cta: { label: "Magbukas ng Smart Savings goal", sub: "Itakda ang target. Tingnan ang petsa.", icon: "sprout" },
    },
  },
  id: {
    howHeading: "Cara kerjanya",
    fund: {
      steps: [
        { icon: "hand", t: "Sumbangkan rupiah", s: "Tanpa wallet, tanpa blockchain, tanpa token. Uang lokal saja." },
        { icon: "jar", t: "Disimpan di vault publik", s: "Setiap rupiah berada di kontrak Stellar yang bisa dibaca siapa pun." },
        { icon: "ledger", t: "Keluar dengan kuitansi", s: "Hanya cair sesuai syarat — unit terverifikasi, baris terlihat." },
      ],
      cta: { label: "Donasi ke pool bantuan", sub: "Buka vault publik", icon: "jar" },
    },
    circle: {
      steps: [
        { icon: "handshake", t: "Bentuk arisan", s: "Teman, keluarga, tetangga — nama yang sudah kamu kenal." },
        { icon: "calendar", t: "Setor putaran", s: "Semua menyetor sedikit sesuai jadwal." },
        { icon: "padlock", t: "Pot berputar, aman", s: "Penerima berbeda tiap putaran. Kontrak yang memegangnya, bukan orang." },
      ],
      cta: { label: "Mulai atau gabung arisan", sub: "Lihat arisan yang terbuka", icon: "handshake" },
    },
    grow: {
      steps: [
        { icon: "vault", t: "Kunci rupiah dalam tujuan", s: "Tetapkan target dan tanggal. Kami konversi ke USDC di belakang." },
        { icon: "sprout", t: "Yield dari DeFi teraudit", s: "Kontrak Stellar menyetor ke protokol yang diaudit independen." },
        { icon: "coin", t: "Tarik ke rekening", s: "Rupiah kembali ke rekening atau e-wallet saat jatuh tempo." },
      ],
      cta: { label: "Buka tujuan Tabungan Pintar", sub: "Tetapkan target. Lihat tanggalnya.", icon: "sprout" },
    },
  },
  vi: {
    howHeading: "Cách thức hoạt động",
    fund: {
      steps: [
        { icon: "hand", t: "Quyên góp bằng tiền địa phương", s: "Không ví, không chain, không token. Chỉ tiền địa phương." },
        { icon: "jar", t: "Giữ trong két công khai", s: "Mỗi đồng nằm trong hợp đồng Stellar ai cũng đọc được." },
        { icon: "ledger", t: "Chi ra kèm hoá đơn", s: "Chỉ chi khi đủ điều kiện — đơn vị kiểm chứng, dòng tin hiện rõ." },
      ],
      cta: { label: "Đóng góp vào quỹ cứu trợ", sub: "Mở két công khai", icon: "jar" },
    },
    circle: {
      steps: [
        { icon: "handshake", t: "Lập một hội hụi", s: "Bạn bè, gia đình, hàng xóm — những cái tên bạn tin." },
        { icon: "calendar", t: "Đóng phần mỗi vòng", s: "Mỗi người góp một khoản nhỏ theo lịch." },
        { icon: "padlock", t: "Hũ luân phiên, an toàn", s: "Mỗi vòng một người nhận. Hợp đồng giữ hũ, không phải con người." },
      ],
      cta: { label: "Mở hoặc tham gia một hội", sub: "Xem các hội đang mở", icon: "handshake" },
    },
    grow: {
      steps: [
        { icon: "vault", t: "Khoá tiền vào mục tiêu", s: "Đặt mục tiêu và ngày. Chúng tôi quy đổi sang USDC ở phía sau." },
        { icon: "sprout", t: "Lãi qua DeFi đã kiểm toán", s: "Hợp đồng Stellar gửi vào các giao thức được kiểm toán độc lập." },
        { icon: "coin", t: "Rút về ngân hàng", s: "Tiền địa phương về tài khoản hoặc ví điện tử khi đến hạn." },
      ],
      cta: { label: "Mở mục tiêu Tiết kiệm thông minh", sub: "Đặt mục tiêu. Xem ngày đạt.", icon: "sprout" },
    },
  },
};
