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
    'campaign_close_empty',
    'recurring_campaign_create',
    'recurring_campaign_donate',
    'recurring_campaign_submit_proof',
    'recurring_campaign_approve',
    'recurring_campaign_release',
    'recurring_campaign_refund',
    'recurring_campaign_close_empty'
  ));
