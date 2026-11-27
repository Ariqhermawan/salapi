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
  let address: string | null = null;
  try {
    const resolved = await readContract(CONTRACTS.usernameRegistry, "resolve", [sc.str(handle)]);
    if (typeof resolved === "string" && StrKey.isValidEd25519PublicKey(resolved)) address = resolved;
  } catch { /* Show the same profile shell when registry reads are unavailable. */ }
  return <OrganizerProfileScreen handle={handle} address={address} />;
}
