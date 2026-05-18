export const metadata = { title: "Transaction · Salapi" };

export default async function TxDetail({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const explorer = `https://stellar.expert/explorer/testnet/tx/${hash}`;
  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">Transaction</h1>
      <p className="s-sub mt-1">Independently verifiable on Stellar testnet.</p>
      <div className="s-card mt-5">
        <div className="s-label">Tx hash</div>
        <div className="mt-1 break-all font-mono text-xs text-[var(--color-ink)]">
          {hash}
        </div>
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-semibold text-[var(--color-action-deep)]"
        >
          Open on stellar.expert →
        </a>
      </div>
    </div>
  );
}
