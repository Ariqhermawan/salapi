# User campaign workspace

This is a user-authored content flow, separate from `lib/circles/seed.ts` and its invented organizers and ratings. Publishing content does not create a funding contract, perform KYC, or move funds.

## Local flow

Run with `NEXT_PUBLIC_LOCAL_PREVIEW=1` on loopback only and open `/circles/workspace`. The workspace is unavailable when a Vercel deployment indicator is present or the request host is not localhost/loopback. The app must bind the development server to loopback.

1. Choose the organizer simulation. Open **Publish a campaign**, enter its story, category, location, display goal, and immutable operations allocation.
2. Consent to photo publication and upload a JPG, PNG or WebP file. The server validates and re-encodes it, strips EXIF/GPS, and hashes the stored WebP. Uploading a photo does not verify delivery.
3. Publish to the local workspace. Campaigns and media are stored server-side in an OS-local, checkout-scoped directory under `Salapi/circles-workspace`, not in browser storage or the Git repository.
4. Switch to the donor simulation. Follow the campaign and save simulated support. This does not debit a balance or submit a transaction.
5. Switch back to the organizer. Publish progress, spending, and delivery updates. Delivery evidence requires at least one photo. Complete delivery explicitly.
6. Switch to the donor. Leave one rating and comment. Review eligibility excludes the organizer, visitors, unsupported campaigns, unfinished campaigns and duplicate reviews.
7. Open the organizer profile to see completed history and the average of recorded reviews. Local records remain clearly labelled simulations, never verified donor testimonials.

The local role cookie is a test control, not authentication. This dataset is not shared with other devices or published to salapi.app. Server restarts and browser reloads preserve the local records.

An abrupt process crash during a write can leave `workspace.lock` behind. The store deliberately does not delete locks based on age, because another process could still own one. If writes remain unavailable after a crash, stop all servers for this checkout, inspect its checkout-scoped storage directory, and remove only that stale lock. Preserve `workspace.json` and all photos. Ordinary graceful restarts need no recovery.

## Nonlocal Testnet adapter

`CIRCLES_WORKSPACE_ENABLED=1` is a server-side activation flag and defaults to disabled. Before activation, apply the generated `supabase/migrations/*_circle_workspace.sql` only to the verified Salapi Preview database. Do not apply it to unrelated connector projects. Configure the existing Supabase public auth variables and server-only service role for the narrow chain-verified actions. Never expose the service role to a browser.

Navigation entries use this same server-side flag and remain hidden on nonlocal deployments while disabled. Local entries require a validated loopback host and refuse cloud deployment indicators. Deploying the code does not activate the workspace or apply its migration.

- Creation and updates use the authenticated Supabase session and ownership RLS. Published content is public; unlinked uploads remain private. Storage uses a private bucket and the app serves authorized photos through a same-origin, no-store route.
- Identity remains **unverified**. Organizer display metadata is not authorization, KYC, or NGO verification.
- A published metadata campaign cannot receive funds until its owner binds a D4 Testnet campaign. Binding verifies the current wallet, deployed contract address, creator, exact title and fee. The binding cannot be replaced.
- Funding remains in the existing D4 transaction screen, including its confirmation/pending/receipt safeguards. The workspace does not create fake successful contributions.
- Completion requires a delivery photo and a fresh matching D4 `Released` state.
- Reviews require a signed-in non-owner, completed metadata campaign, matching D4 deployment and creator, and a positive non-refunded contribution belonging to the viewer. Review insertion is server-only after these checks; direct client review writes are denied. One review per donor and campaign is enforced by a database constraint.
- The organizer fee and title cannot be changed after publication. Organizer-authored photos are not independent approval of proof or authorization of a payout.

## Required release evidence

Local browser tests and isolated PostgreSQL policy tests are not live Supabase or blockchain acceptance evidence. The reproducible PGlite test executes the exact migration with stubbed Auth and Storage helper functions. It does not exercise Supabase JWT authentication, the Storage HTTP API, or cloud configuration. Before releasing this flow, test on a nonlocal Preview with local mode disabled: two real authenticated QA accounts, public/unpublished media access, owner and non-owner controls, D4 binding and funding, pending transactions, proof approvals/release, one eligible review, duplicate/self-review rejection, and the supported campaign update view. Review moderation, retention and abuse handling before opening public user-generated campaigns.

Activation review must also cover direct Supabase API uploads: the draft migration currently permits an authenticated owner to insert their own media metadata and Storage objects directly. Those writes do not pass through the app's photo re-encoding or publication-consent validation. Resolve this bypass before enabling public uploads; passing the app-route tests alone does not validate every upload path.

No production database, deployment, contract, real payment, KYC verification, or email subscription is changed by building this feature locally.
