-- Add the reviewed, single-use confirmation action used by native Testnet XLM withdrawals.
alter table public.wallet_confirmation_intents
  drop constraint if exists wallet_confirmation_intents_action_check;

alter table public.wallet_confirmation_intents
  add constraint wallet_confirmation_intents_action_check check (action in (
    'username_send',
    'wallet_withdrawal',
    'campaign_create',
    'campaign_donate',
    'campaign_submit_proof',
    'campaign_approve',
    'campaign_release',
    'campaign_refund',
    'campaign_close_empty'
  ));
