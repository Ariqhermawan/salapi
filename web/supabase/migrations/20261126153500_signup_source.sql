alter table public.referral_attributions
  alter column inviter_id drop not null,
  add column source text not null default 'invite_link',
  add constraint referral_source_matches_inviter check (
    (source in ('direct', 'community', 'unanswered') and inviter_id is null)
    or source = 'referral'
    or (source = 'invite_link' and inviter_id is not null)
  );

grant update (source, inviter_id) on public.referral_attributions to service_role;
