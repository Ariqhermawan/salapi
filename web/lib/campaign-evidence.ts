// Public receipts from the retained-key SDK acceptance run, not browser E2E.
// Full signed XDR, raw RPC responses and final state are archived in docs.
export const campaignEvidence = {
  contractId: "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU",
  report: "https://github.com/Ariqhermawan/salapi/blob/main/docs/instawards/week-4-d4.md",
  transactions: [
    { label: "Deploy D4 contract", hash: "af53ce4437af222f5c9f41bd79b65e67a7ae5f85497576148b2606f4e2ca715f" },
    { label: "Campaign #1 · donate 100.0000001 XLM", hash: "b1f1caa7b7d6e369d147f5faf8817930ae84acc0487e244d17f633a03c9ebb2a" },
    { label: "Campaign #1 · release 5 + 95.0000001 XLM", hash: "c5c9ae1a3e180b7e1f7f3a71a79cbc787c95054522359444bef0cd4665df6f2e" },
    { label: "Campaign #2 · full 30 XLM donor refund", hash: "26e12d1705d8fce36ac95a7c256979719de70a30f26f1ac075c57869bd6f1a7b" },
    { label: "Campaign #2 · full 20 XLM donor refund", hash: "1a1b77d7cc1486f1123d5bdd16151db068a015e87079e0b064368ce75fe2f70e" },
  ],
  browserTransactions: [
    { label: "Live UI #5 · create", hash: "f3f5cdbaf9c016f62df94e8b42446cfcdda464085c5fad7861964e6d5fc73dfd" },
    { label: "Live UI #5 · donate 1 XLM", hash: "c60ae1d33f73f6e9dcc8e98a109a3a73c3e2750717c680593053696bc3472f60" },
    { label: "Live UI #5 · submit proof", hash: "2c5632e487d10ff96d7001eca7e5a030c9b8a7d3b164a72266b918c644e1defb" },
    { label: "Live UI #5 · approve B", hash: "72b71d719d28caf6b76ed0674c54ef69831b1bee1de3bab025c45fa272d5447a" },
    { label: "Live UI #5 · approve A", hash: "6e221463cb600598829b3fbccb1f0044dc7e91547000a6a12a4e3c8fed6a4ba7" },
    { label: "Live UI #5 · release 0.05 + 0.95 XLM", hash: "443a9e58e88d2758c7f74a017505c53a759c80e84692a4503037ed0011497a87" },
  ],
};
