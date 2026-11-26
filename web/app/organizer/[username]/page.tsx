import { notFound } from "next/navigation";
import { StrKey } from "@stellar/stellar-sdk";
import OrganizerProfileScreen from "@/components/screens/OrganizerProfileScreen";
import { CONTRACTS, readContract, sc } from "@/lib/server/stellar";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeOrganizerScreen from "@/components/screens/PrototypeOrganizerScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizer profile · Salapi" };

export default async function OrganizerProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ figs?: string }> }) {
  const { username: raw } = await params;
  const { figs } = await searchParams;
  const handle = raw.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(handle)) notFound();
  if (isLocalPreview && handle === "meis_family") return <PrototypeOrganizerScreen layout={figs?.toLowerCase() ?? "a"} />;
  try {
    const address = await readContract(CONTRACTS.usernameRegistry, "resolve", [sc.str(handle)]);
    return <OrganizerProfileScreen handle={handle} address={typeof address === "string" && StrKey.isValidEd25519PublicKey(address) ? address : null} />;
  } catch {
    return <OrganizerProfileScreen handle={handle} address={null} />;
  }
}
