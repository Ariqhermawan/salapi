import SendForm from "@/components/SendForm";

export const metadata = { title: "Send · Salapi" };

export default function SendPage() {
  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">Send money</h1>
      <p className="s-sub mt-1 mb-5">
        By @username — no addresses, no seed phrases. Real transfer on Stellar
        testnet.
      </p>
      <SendForm />
    </div>
  );
}
