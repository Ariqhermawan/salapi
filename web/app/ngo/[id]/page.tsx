import { notFound } from "next/navigation";
import { StrKey } from "@stellar/stellar-sdk";
import DisasterRecipientScreen from "@/components/screens/DisasterRecipientScreen";

export const metadata = { title: "NGO profile · Salapi" };

export default async function NgoProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (StrKey.isValidEd25519PublicKey(id)) return <DisasterRecipientScreen address={id} />;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(id)) notFound();
  return <DisasterRecipientScreen slug={id} />;
}
