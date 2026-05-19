import { SalapiMascot } from "@/components/ui/mascot";

export const metadata = { title: "Offline · Salapi" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      <div className="mb-5">
        <SalapiMascot size={64} c="#5B6472" pose="think" />
      </div>
      <h1 className="s-h1">You&apos;re offline</h1>
      <p className="s-sub mt-2">
        Reconnect to use Salapi. Your money is safe on-chain.
      </p>
    </div>
  );
}
