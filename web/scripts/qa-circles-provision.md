# D4 Circles QA provisioning

The script defaults to an offline dry run. It can explicitly create 27 D4
Testnet campaigns. It never deploys a contract, funds accounts, donates,
releases, refunds, or writes to Supabase.

The pinned deployment is `CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU`.
The native Testnet XLM SAC is
`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.
RPC is fixed to `https://soroban-testnet.stellar.org` and must report
`Networks.TESTNET`. Version 4 and the exact SAC must match before creating.
All SDK RPC HTTP requests use a per-instance 10-second timeout, an absolute
10-second cancellation deadline including body reception, and zero redirects.
`sendTransaction` has one transport attempt. A transport timeout
leaves the signed journal hash unresolved for reconciliation, never resubmission.

## Public manifest and retained keys

Generate and retain five new QA wallets separately: one creator, one
beneficiary, three reviewers. The five public addresses must be distinct.
Different addresses do not establish independent human custody or NGO identity.
All five accounts must exist on Testnet before provisioning begins.

The public manifest contains exactly these eight fields:

```json
{
  "network": "testnet",
  "contractId": "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU",
  "tokenId": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  "creatorWallet": "<new QA creator public address>",
  "beneficiaryWallet": "<new QA beneficiary public address>",
  "approverWallets": ["<QA reviewer 1>", "<QA reviewer 2>", "<QA reviewer 3>"],
  "fundingDeadline": "<canonical epoch seconds>",
  "reviewDeadline": "<canonical epoch seconds>"
}
```

`defaultQaProvisionInput(wallets, anchorEpochSeconds)` fixes funding at
`anchor + 30 days` and review at `funding + 7 days`. Save these exact deadlines
once. Do not regenerate the manifest when resuming. Each campaign's immutable
creator cut is exactly `SEED_CIRCLES.allowance.percentage * 100` basis points;
fixture totals, targets, donor counts and imagery are never on-chain balances
or payment evidence. Titles are exactly `QA Circles: <canonical-slug>`.

The outside-repository private file must contain
`creator: { publicKey: <QA creator>, secret: <retained private key> }`.
It may also retain the beneficiary and reviewers. Keep this file in a separate
private folder with a user-only Windows ACL. The engine reads only the creator
secret and never outputs it. The private file must also be outside the public
evidence directory. Never pass a secret as a command-line argument.

## Review, preflight and execute

Run from `web` with Node 24 and the repository dependencies installed.

```powershell
node --experimental-strip-types scripts/qa-circles-provision.mts --manifest C:/path/to/public-manifest.json
node --experimental-strip-types scripts/qa-circles-provision.mts --manifest C:/path/to/public-manifest.json --preflight
node --experimental-strip-types scripts/qa-circles-provision.mts --manifest C:/path/to/public-manifest.json --execute --output-dir C:/path/to/public-evidence --creator-secret-file C:/path/to/private-wallets.json
```

Only one operator may execute a plan at a time. Preflight reads every bounded
D4 campaign page and checks existing QA titles before any creation. Matching
campaigns can be reused only when every immutable term validates. Duplicate
titles or conflicting terms stop the whole provision before new writes.

Every create is simulated first. The signed hash and exact signed envelope are
flushed to an atomic journal before `sendTransaction`. Campaign IDs come from
successful committed return metadata and the exact `created` event. The
signature, hash, operation, configuration and current campaign read must match.
The script checks each hash up to 20 times with 1.5 seconds between checks.
Each HTTP request has its own 10-second absolute deadline, so slow responses
can extend the total confirmation wait beyond the approximately 30 seconds
of polling delays.

`qa-circles-journal.json` is resumable evidence. Re-run the same execute command
with the same manifest and evidence folder. A prepared or submitted hash is
reconciled before any further create. `NOT_FOUND`, a failed transaction or an
unresolved send stops execution and never sends that envelope or another
create for that circle automatically. Preserve the journal and inspect that
hash. A crash after journaling but before submission also requires explicit
operator reconciliation; do not delete the journal to bypass an unknown hash.

After all 27 current campaigns validate, the engine stages
`qa-circles-verified-mapping.json` and `qa-circles-verified-mapping.sql`. Review
the intended Supabase project and schema separately before executing the SQL
with an authorized privileged connection. The application service role has
SELECT only. The SQL is one transaction; exact identical rows are skipped,
while conflicting immutable mappings fail instead of replacing history.

## Local verification

```powershell
node --experimental-strip-types --test scripts/qa-circles-provision.test.mts
npx eslint scripts/qa-circles-provision.mts scripts/qa-circles-provision.test.mts
npx tsc --noEmit --incremental false
```

The unit tests use unprovisioned deterministic keys and in-memory transaction
outcomes. Passing them is local tooling evidence. Real RPC simulation and
receipts are required before claiming the 27 campaigns exist on Testnet.
