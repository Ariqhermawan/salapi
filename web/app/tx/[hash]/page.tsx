import TxDetailScreen from "@/components/screens/TxDetailScreen";

export const metadata = { title: "Transaction · Salapi" };

// Next 16: route segment params arrive as a Promise; await before use, then
// hand the hash to the client screen that owns the localized UI.
export default async function TxDetailPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  return <TxDetailScreen hash={hash} />;
}
