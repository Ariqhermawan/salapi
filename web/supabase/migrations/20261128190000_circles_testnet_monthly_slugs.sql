-- Allow the two monthly Circles QA causes added to the catalog on 2026-11-28
-- (road-rescue-monthly, nek-ijah-monthly) in the Testnet mapping table.
-- Widens the circle_slug allow-list only. No row is inserted, changed or removed.
begin;

alter table public.circles_testnet_campaigns
  drop constraint circles_testnet_campaigns_circle_slug_check;

alter table public.circles_testnet_campaigns
  add constraint circles_testnet_campaigns_circle_slug_check check (circle_slug in (
    'tino-relief', 'ate-mei-dialysis', 'arisan-banjir-jakarta', 'barangay-library',
    'ofw-family-tuition', 'creator-baybayin', 'cebu-family-home', 'cebu-community-water',
    'quezon-afterclass', 'quezon-family-roof', 'jakarta-river-cleanup', 'jakarta-community-mural',
    'bohol-health-screening', 'bohol-reading-zine', 'tarlac-storm-packs', 'tarlac-school-kits',
    'manila-medical-transport', 'manila-community-makerspace', 'cats-recovery', 'dogs-rescue-care',
    'shared-animal-shelter', 'orphanage-learning-room', 'elder-home-meals', 'community-free-kitchen',
    'river-volunteer-kit', 'flood-volunteer-logistics', 'forest-fire-volunteer-safety',
    'road-rescue-monthly', 'nek-ijah-monthly'
  ));

commit;
