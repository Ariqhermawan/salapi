export const metadata = { title: "Offline · Salapi" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      <h1 className="s-h1">You&apos;re offline</h1>
      <p className="s-sub mt-2">
        Reconnect to use Salapi. Your money is safe on-chain.
      </p>
    </div>
  );
}
