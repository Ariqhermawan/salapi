/** Cause catalogue shown by the v4.2 prototype. These figures are display-only
 * examples used in the local preview; live campaign reads remain sourced from D4. */
export type PrototypeCause = {
  id: string;
  title: string;
  shortTitle?: string;
  category: string;
  alsoIn?: string[];
  image?: string;
  organizer: string;
  place: string;
  avatar?: string;
  verified?: boolean;
  summary?: string;
  story?: string;
  more?: string;
  photos?: string[];
  raised: number;
  target: number;
  donors: number;
  organizerFeeBps: number;
  recurring?: boolean;
  closedOn?: string;
  proofOn?: string;
  proofNote?: string;
  reviews?: { by: string; stars: number; text: string }[];
  escrowCents?: number;
  releasedCents?: number;
  stages?: { title: string; amountCents: number; dueDate: string; status: "Waiting" | "In review" | "Paid"; paidCents?: number; paidOn?: string; proofNote?: string }[];
  daysLeft?: number;
  status: "Funding" | "Paused" | "Awaiting proof" | "In review" | "Released";
};

const asset = (name: string) => `/prototype-causes/${name}`;

export const PROTOTYPE_CAUSES: PrototypeCause[] = [
  {
    id: "mei", title: "Ate Mei needs dialysis - 12 sessions to stabilize", category: "Medical",
    image: asset("campaign-mei.jpg"), photos: [asset("campaign-mei.jpg"), asset("mei-thumb-1.png"), asset("mei-thumb-2.png"), asset("mei-thumb-3.png")],
    avatar: asset("avatar-mei.png"), verified: true, organizer: "@meis_family", place: "Quezon City, PH",
    story: "Ate Mei is our older sister, and her kidneys are failing. She needs 12 dialysis sessions to get stable. We can't cover them on our own.",
    more: "What you give pays for her sessions and her rides to the clinic.",
    raised: 86_207, target: 154_000, donors: 41, daysLeft: 18, organizerFeeBps: 500, status: "Funding",
  },
  {
    id: "bantayan", title: "Bantayan Island - new roofs for a barangay school", category: "Disaster relief",
    image: asset("campaign-bantayan.jpg"), photos: [asset("campaign-bantayan.jpg"), asset("bantayan-panels.jpg"), asset("bantayan-materials.jpg"), asset("bantayan-boats.jpg")],
    avatar: asset("avatar-maria.png"), organizer: "@maria_s", place: "Cebu, PH",
    story: "A community group is re-roofing four classrooms before the school year starts.",
    more: "Funds buy roofing sheets, timber and fasteners.",
    raised: 31_850, target: 60_000, donors: 17, daysLeft: 9, organizerFeeBps: 0, status: "Funding",
  },
  {
    id: "jakarta-kitchen", title: "North Jakarta floods - a community kitchen for 200 families", category: "Disaster relief",
    alsoIn: ["Care & meals"], image: asset("cause-jakarta-kitchen.jpg"), organizer: "@karangtaruna_rw06", place: "Jakarta Utara, ID",
    verified: true, story: "The floods closed most kitchens in RW 06. Our youth group cooks two meals a day for 200 families from the community hall.",
    more: "Funds buy rice, vegetables, cooking gas and food boxes.",
    raised: 276_300, target: 300_000, donors: 128, daysLeft: 3, organizerFeeBps: 0, status: "Funding",
  },
  {
    id: "bohol-library", title: "Build a barangay library for 300 kids in Bohol", category: "Education",
    alsoIn: ["Community"], image: asset("cause-bohol-library.jpg"), verified: true, organizer: "@teachers_circle", place: "Bohol, PH",
    summary: "Books, shelves and a welcoming reading space for a community library.",
    story: "Tubigon has 300 children in elementary school and no library. The nearest one is a 40-minute ride away, in Tagbilaran, and most families make that trip only for the market.",
    more: "We are eleven teachers from three schools. For two years we have lent our own books out of a classroom cabinet. It holds 140 books, and every one of them is out on loan most weeks. A cabinet is not a place to sit and read, and it is locked when school is closed.\n\nThe barangay has given us a room beside the health center, free for ten years. It needs shelves, tables, floor mats, lights and books a child wants to pick up.\n\nWhat the money pays for: 1,200 books in Cebuano, Filipino and English, most of them picture books and early readers. Shelves and six low tables built by a carpenter in town.",
    raised: 85_000, target: 250_000, donors: 22, daysLeft: 24, organizerFeeBps: 400, status: "Funding",
  },
  {
    id: "tita-ana", title: "Help Tita Ana keep her three kids in school this term", shortTitle: "Tita Ana's school term", category: "Family",
    image: asset("cause-tita-ana.jpg"), organizer: "@ana_d", place: "Tarlac, PH",
    story: "Tita Ana lost her stall in June. Her three children need fees, uniforms and notebooks for the term that starts this month.",
    raised: 6_000, target: 50_000, donors: 4, daysLeft: 27, organizerFeeBps: 0, recurring: true, status: "Funding",
    stages: [
      { title: "School fees", amountCents: 30_000, dueDate: "2027-01-08", status: "Waiting" },
      { title: "Uniforms", amountCents: 12_000, dueDate: "2027-01-22", status: "Waiting" },
      { title: "Notebooks and bags", amountCents: 8_000, dueDate: "2027-02-05", status: "Waiting" },
    ],
  },
  {
    id: "baybayin-zines", title: "Print 1,000 free Baybayin learning zines", category: "Creator support",
    image: asset("cause-baybayin-zines.jpg"), organizer: "@kapatid_tinta", place: "Manila, PH",
    story: "I draw small zines that teach Baybayin, one character a page. Schools and libraries keep asking for copies I cannot afford to print.",
    more: "The goal pays for 1,000 copies. Anything above it prints more.",
    raised: 41_600, target: 40_000, donors: 63, daysLeft: 0, organizerFeeBps: 350, status: "Funding",
  },
  {
    id: "water-point", title: "A shared water point for a Cebu neighborhood", category: "Community",
    image: asset("cause-water-point.jpg"), organizer: "@maria_s", place: "Cebu, PH",
    avatar: asset("avatar-maria.png"), story: "Forty households carry water from a tap fifteen minutes away. One shared tap on our street ends that walk.",
    more: "Funds pay for the pipe, the tap stand and twenty covered containers.",
    raised: 53_600, target: 80_000, donors: 29, daysLeft: 12, organizerFeeBps: 300, status: "Funding",
  },
  {
    id: "river-cleanup", title: "River clean-up tools for neighborhood volunteers", category: "Community",
    alsoIn: ["Volunteer action"], image: asset("cause-river-cleanup.jpg"), organizer: "@karangtaruna_rw06", place: "Jakarta Utara, ID",
    verified: true, story: "Thirty of us clear the riverbank every second Sunday with our bare hands. Gloves, rakes and sacks make it safer and faster.",
    raised: 20_250, target: 45_000, donors: 19, daysLeft: 15, organizerFeeBps: 300, status: "Funding",
  },
  {
    id: "ramos-home", title: "A safer home for the Ramos family", category: "Family",
    image: asset("cause-ramos-home.jpg"), organizer: "@maria_s", place: "Cebu, PH",
    avatar: asset("avatar-maria.png"), story: "The last storm cracked two walls of the Ramos home. Blocks, cement and timber make it safe before the next one.",
    raised: 14_700, target: 70_000, donors: 9, daysLeft: 21, organizerFeeBps: 200, status: "Funding",
  },
  {
    id: "mural", title: "A neighborhood mural made by local artists", category: "Creator support",
    image: asset("cause-mural.jpg"), organizer: "@karangtaruna_rw06", place: "Jakarta Utara, ID",
    verified: true, story: "Six artists from our street are painting the wall by the footbridge. The wall is being repaired first, so donations are paused until it is ready.",
    raised: 12_500, target: 35_000, donors: 11, daysLeft: 20, organizerFeeBps: 500, status: "Paused",
  },
  {
    id: "foster-dogs", title: "Rescue care and foster supplies for dogs", category: "Animal care",
    organizer: "@lito_r", place: "Marikina, PH", raised: 0, target: 30_000, donors: 0, daysLeft: 30, organizerFeeBps: 0, status: "Funding",
    story: "I foster rescued dogs at home until they find a family. This pays for food, vaccines and two kennels.",
  },
  {
    id: "tino", title: "Tino survivors, Cebu - rebuild a fishing barangay", category: "Disaster relief",
    image: asset("cause-tino.jpg"), organizer: "@maria_s", place: "Cebu, PH",
    avatar: asset("avatar-maria.png"), story: "Typhoon Tino broke nineteen boats in our barangay. The money repairs hulls and nets so the families can fish again.",
    raised: 88_007, target: 90_000, donors: 52, organizerFeeBps: 0, closedOn: "6 Nov", status: "Awaiting proof",
  },
  {
    id: "reading-zines", title: "Reading zines made with Bohol teachers", shortTitle: "Reading zines, Bohol", category: "Creator support",
    alsoIn: ["Education"], image: asset("cause-reading-zines.jpg"), organizer: "@teachers_circle", place: "Bohol, PH",
    verified: true, story: "Our teachers write and draw short reading zines in Cebuano. Three issues, one a month, each printed for 300 children.",
    raised: 60_000, target: 60_000, donors: 38, organizerFeeBps: 500, recurring: true, closedOn: "9 Nov", proofOn: "26 Nov", proofNote: "Print shop receipt for 300 copies of issue 2, and photos of the hand-out in Tubigon.", escrowCents: 40_000, releasedCents: 20_000, status: "In review",
    stages: [
      { title: "Issue 1, 300 copies", amountCents: 20_000, dueDate: "2026-11-14", status: "Paid", paidCents: 20_000, paidOn: "16 Nov", proofNote: "Print shop receipt for 300 copies of issue 1, and photos from two schools." },
      { title: "Issue 2, 300 copies", amountCents: 20_000, dueDate: "2026-11-28", status: "In review", proofNote: "Print shop receipt for 300 copies of issue 2, and photos of the hand-out in Tubigon." },
      { title: "Issue 3, 300 copies", amountCents: 20_000, dueDate: "2026-12-12", status: "Waiting" },
    ],
  },
  {
    id: "santos-roof", title: "A dry roof for the Santos family", category: "Family",
    image: asset("cause-santos-roof.jpg"), photos: [asset("cause-santos-roof.jpg"), asset("bantayan-panels.jpg"), asset("bantayan-materials.jpg")], organizer: "@meis_family", place: "Quezon City, PH",
    avatar: asset("avatar-mei.png"), verified: true, story: "The Santos family has lived under a tarp since August. New roof panels keep the rain out.",
    raised: 48_000, target: 48_000, donors: 31, organizerFeeBps: 300, closedOn: "2 Nov", proofNote: "Hardware store receipt for 24 roof panels, and photos of the finished roof.",
    reviews: [
      { by: "@jamal_r", stars: 5, text: "The receipts match what was promised." },
      { by: "@ana.reyes", stars: 5, text: "Photos every week. Clear." },
    ], status: "In review",
  },
  {
    id: "health-screening", title: "A community health-screening day in Bohol", category: "Medical",
    image: asset("cause-health-screening.jpg"), organizer: "@teachers_circle", place: "Bohol, PH",
    verified: true, story: "One day, two nurses and a doctor: blood pressure, blood sugar and referrals for anyone in the barangay.",
    raised: 125_400, target: 120_000, donors: 77, organizerFeeBps: 200, closedOn: "20 Oct", proofNote: "Receipts for test strips and supplies, the clinic invoice, and the sign-in sheet: 212 people screened, 31 referred.", status: "Released",
  },
  {
    id: "learning-kits", title: "After-class learning kits in Quezon City", category: "Education",
    image: asset("cause-learning-kits.jpg"), organizer: "@meis_family", place: "Quezon City, PH",
    avatar: asset("avatar-mei.png"), verified: true, story: "Twenty children meet after class on our street. Each kit has two books, a notebook and pencils.",
    raised: 34_080, target: 48_000, donors: 26, organizerFeeBps: 500, closedOn: "12 Oct", proofNote: "Bookstore receipt for 14 kits, and a photo of the kits handed out.", status: "Released",
  },
];

export const PROTOTYPE_CATEGORY_ASSETS: Record<string, string> = {
  "Disaster relief": asset("cat-disaster-relief.png"),
  Medical: asset("cat-medical.png"),
  Education: asset("cat-education.png"),
  Family: asset("cat-family.png"),
  "Creator support": asset("cat-creator-support.png"),
  Community: asset("cat-community.png"),
  "Care & meals": asset("cat-care-meals.png"),
  "Volunteer action": asset("cat-volunteer-action.png"),
  "Animal care": asset("cat-animal-care.png"),
};
