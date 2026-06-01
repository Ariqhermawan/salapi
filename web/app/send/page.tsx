import SendScreen from "@/components/screens/SendScreen";

export const metadata = { title: "Send · Salapi" };

// Next 16: searchParams arrive as a Promise. Read ?to= so a scanned Receive QR
// (salapi.app/send?to=<username>) opens Send pre-filled with the recipient.
export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string | string[] }>;
}) {
  const sp = await searchParams;
  const to = Array.isArray(sp.to) ? sp.to[0] : sp.to;
  return <SendScreen initialTo={typeof to === "string" ? to : undefined} />;
}
