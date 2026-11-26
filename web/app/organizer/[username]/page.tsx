import { notFound } from "next/navigation";
import { StrKey } from "@stellar/stellar-sdk";
import OrganizerProfileScreen from "@/components/screens/OrganizerProfileScreen";
import { CONTRACTS, readContract, sc } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizer profile · Salapi" };

export default async function OrganizerProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: raw } = await params;
  const handle = raw.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(handle)) notFound();
  try {
    const address = await readContract(CONTRACTS.usernameRegistry, "resolve", [sc.str(handle)]);
    return <OrganizerProfileScreen handle={handle} address={typeof address === "string" && StrKey.isValidEd25519PublicKey(address) ? address : null} />;
  } catch {
    return <OrganizerProfileScreen handle={handle} address={null} />;
  }
}
