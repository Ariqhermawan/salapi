import SendForm from "@/components/SendForm";

export const metadata = { title: "Send · Salapi" };

export default function SendPage() {
  return (
    <div className="px-5 py-6">
      <h1 className="text-xl font-bold tracking-tight">Send money</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-500">
        By @username — no addresses, no seed phrases. Real transfer on Stellar
        testnet.
      </p>
      <SendForm />
    </div>
  );
}
