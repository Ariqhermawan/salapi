export type DisasterNgoCategoryId = "relief" | "food" | "medical" | "shelter";

export type DisasterNgoCategory = {
  id: DisasterNgoCategoryId;
  name: string;
  art: string;
};

export type DisasterNgo = {
  id: string;
  name: string;
  place: string;
  category: DisasterNgoCategoryId;
  focus: string;
  about: string;
};

export const DISASTER_NGO_CATEGORIES: DisasterNgoCategory[] = [
  { id: "relief", name: "Relief", art: "/prototype-causes/cat-disaster-relief.png" },
  { id: "food", name: "Food", art: "/prototype-causes/cat-care-meals.png" },
  { id: "medical", name: "Medical", art: "/prototype-causes/cat-medical.png" },
  { id: "shelter", name: "Shelter", art: "/prototype-causes/cat-family.png" },
];

/** These catalog entries mirror the prototype and are illustrative Testnet profiles, not real NGOs. */
export const DISASTER_NGOS: DisasterNgo[] = [
  {
    id: "tulong-cebu",
    name: "Tulong Cebu Relief",
    place: "Cebu City, PH",
    category: "relief",
    focus: "Typhoon and flood relief",
    about: "Example profile for a community response group bringing food packs, tarps, and clean water after storms.",
  },
  {
    id: "bangon-marikina",
    name: "Bangon Marikina",
    place: "Marikina, PH",
    category: "relief",
    focus: "Flood response",
    about: "Example profile for a river-side volunteer group supporting evacuation and community kitchens during floods.",
  },
  {
    id: "dapur-siaga",
    name: "Dapur Siaga Jakarta",
    place: "Jakarta Utara, ID",
    category: "food",
    focus: "Emergency kitchens",
    about: "Example profile for neighborhood cooks preparing shared meals after a flood or fire.",
  },
  {
    id: "lingap-leyte",
    name: "Lingap Leyte Medics",
    place: "Tacloban, PH",
    category: "medical",
    focus: "Mobile clinics",
    about: "Example profile for volunteer health workers supporting evacuation centers after a storm.",
  },
  {
    id: "rumah-pulih",
    name: "Rumah Pulih Lombok",
    place: "Mataram, ID",
    category: "shelter",
    focus: "Temporary shelters",
    about: "Example profile for a community rebuilding temporary shelter after earthquakes or floods.",
  },
];

export function disasterNgoCategoryFromLink(value: string | null | undefined): DisasterNgoCategoryId | null {
  return DISASTER_NGO_CATEGORIES.some((category) => category.id === value?.toLowerCase())
    ? value!.toLowerCase() as DisasterNgoCategoryId
    : null;
}

export function disasterNgosIn(category: DisasterNgoCategoryId | null): DisasterNgo[] {
  return category ? DISASTER_NGOS.filter((ngo) => ngo.category === category) : DISASTER_NGOS;
}

export function findDisasterNgo(id: string | undefined): DisasterNgo | undefined {
  return DISASTER_NGOS.find((ngo) => ngo.id === id);
}
