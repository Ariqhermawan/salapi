#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    vec, IntoVal, Symbol,
};

struct Setup {
    env: Env,
    id: Address,
    cfg: Config,
    donor: Address,
    other: Address,
}
impl Setup {
    fn new() -> Self {
        let env = Env::new_with_config(soroban_sdk::testutils::EnvTestConfig {
            capture_snapshot_at_drop: false,
        });
        env.mock_all_auths();
        env.ledger().with_mut(|l| {
            l.timestamp = 1000;
            l.sequence_number = 100;
        });
        let asset = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let cfg = Config {
            creator: Address::generate(&env),
            beneficiary: Address::generate(&env),
            token: asset.clone(),
            creator_cut_bps: 500,
            funding_deadline: 1100,
            review_deadline: 1200,
            approvers: vec![
                &env,
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
            ],
        };
        let donor = Address::generate(&env);
        let other = Address::generate(&env);
        let token = token::StellarAssetClient::new(&env, &asset);
        token.mint(&donor, &100_000);
        token.mint(&other, &100_000);
        let id = env.register(DonationCampaign, (asset,));
        Self {
            env,
            id,
            cfg,
            donor,
            other,
        }
    }
    fn v(&self) -> DonationCampaignClient<'_> {
        DonationCampaignClient::new(&self.env, &self.id)
    }
    fn create(&self) -> u64 {
        self.v()
            .create(&self.cfg, &String::from_str(&self.env, "Test campaign"))
    }
    fn time(&self, timestamp: u64) {
        self.env.ledger().with_mut(|l| l.timestamp = timestamp);
    }
    fn proof(&self) -> Proof {
        Proof {
            hash: BytesN::from_array(&self.env, &[7; 32]),
            url: String::from_str(&self.env, "https://salapi.app/docs"),
        }
    }
    fn balance(&self, who: &Address) -> i128 {
        token::Client::new(&self.env, &self.cfg.token).balance(who)
    }
    fn ready(&self, id: u64) {
        self.time(1100);
        self.v().submit_proof(&id, &self.proof());
        for i in 0..2 {
            self.v()
                .approve(&id, &self.cfg.approvers.get(i).unwrap(), &self.proof().hash);
        }
    }
}

#[test]
fn immutable_creation_config_and_pagination() {
    let s = Setup::new();
    let id = s.create();
    assert_eq!(s.v().version(), 4);
    assert_eq!(s.v().clock(), 1000);
    assert_eq!(s.v().campaign(&id).config, s.cfg);
    assert_eq!(s.v().campaigns(&0, &20).len(), 1);
    assert_eq!(s.v().try_campaigns(&0, &21), Err(Ok(Error::InvalidConfig)));
    assert_eq!(s.v().try_campaign(&99), Err(Ok(Error::Missing)));
}

#[test]
fn duplicate_insufficient_excess_approvers_rejected() {
    let s = Setup::new();
    let mut cfg = s.cfg.clone();
    cfg.approvers.set(1, cfg.approvers.get(0).unwrap());
    assert_eq!(
        s.v().try_create(&cfg, &String::from_str(&s.env, "x")),
        Err(Ok(Error::InvalidApprovers))
    );
    cfg = s.cfg.clone();
    cfg.approvers.pop_back();
    assert_eq!(
        s.v().try_create(&cfg, &String::from_str(&s.env, "x")),
        Err(Ok(Error::InvalidApprovers))
    );
    cfg = s.cfg.clone();
    cfg.approvers.push_back(s.other.clone());
    assert_eq!(
        s.v().try_create(&cfg, &String::from_str(&s.env, "x")),
        Err(Ok(Error::InvalidApprovers))
    );
}

#[test]
fn invalid_deadlines_cut_and_recipient_rejected() {
    let s = Setup::new();
    let title = String::from_str(&s.env, "x");
    for (fund, review) in [(1000, 1200), (999, 1200), (1100, 1100), (1200, 1100)] {
        let mut cfg = s.cfg.clone();
        cfg.funding_deadline = fund;
        cfg.review_deadline = review;
        assert_eq!(
            s.v().try_create(&cfg, &title),
            Err(Ok(Error::InvalidDeadline))
        );
    }
    let mut cfg = s.cfg.clone();
    cfg.creator_cut_bps = 1001;
    assert_eq!(
        s.v().try_create(&cfg, &title),
        Err(Ok(Error::InvalidConfig))
    );
    cfg = s.cfg.clone();
    cfg.beneficiary = s.id.clone();
    assert_eq!(
        s.v().try_create(&cfg, &title),
        Err(Ok(Error::InvalidConfig))
    );
    assert_eq!(
        s.v().try_create(&s.cfg, &String::from_str(&s.env, "")),
        Err(Ok(Error::InvalidConfig))
    );
}

#[test]
fn donation_deadline_boundary_and_invalid_amounts() {
    let s = Setup::new();
    let id = s.create();
    for n in [0, -1] {
        assert_eq!(
            s.v().try_donate(&id, &s.donor, &n),
            Err(Ok(Error::InvalidAmount))
        );
    }
    s.time(1099);
    s.v().donate(&id, &s.donor, &100);
    s.time(1100);
    assert_eq!(
        s.v().try_donate(&id, &s.donor, &100),
        Err(Ok(Error::FundingClosed))
    );
    assert_eq!(s.v().campaign(&id).escrow, 100);
}

#[test]
fn proof_too_early_repeated_invalid_and_late_rejected() {
    let s = Setup::new();
    let id = s.create();
    let late = s.create();
    assert_eq!(
        s.v().try_submit_proof(&id, &s.proof()),
        Err(Ok(Error::TooEarly))
    );
    s.time(1100);
    let mut proof = s.proof();
    proof.hash = BytesN::from_array(&s.env, &[0; 32]);
    assert_eq!(
        s.v().try_submit_proof(&id, &proof),
        Err(Ok(Error::InvalidProof))
    );
    s.v().submit_proof(&id, &s.proof());
    assert_eq!(
        s.v().try_submit_proof(&id, &s.proof()),
        Err(Ok(Error::ProofAlreadySubmitted))
    );
    s.time(1200);
    assert_eq!(
        s.v().try_submit_proof(&late, &s.proof()),
        Err(Ok(Error::ReviewClosed))
    );
}

#[test]
fn unauthorized_duplicate_wrong_hash_and_late_approval_rejected() {
    let s = Setup::new();
    let id = s.create();
    s.time(1100);
    s.v().submit_proof(&id, &s.proof());
    let a = s.cfg.approvers.get(0).unwrap();
    assert_eq!(
        s.v().try_approve(&id, &s.other, &s.proof().hash),
        Err(Ok(Error::NotApprover))
    );
    assert_eq!(
        s.v()
            .try_approve(&id, &a, &BytesN::from_array(&s.env, &[8; 32])),
        Err(Ok(Error::InvalidProof))
    );
    assert_eq!(s.v().try_release(&id), Err(Ok(Error::BelowThreshold)));
    s.v().approve(&id, &a, &s.proof().hash);
    assert_eq!(
        s.v().try_approve(&id, &a, &s.proof().hash),
        Err(Ok(Error::AlreadyApproved))
    );
    assert_eq!(s.v().try_release(&id), Err(Ok(Error::BelowThreshold)));
    s.time(1200);
    assert_eq!(
        s.v()
            .try_approve(&id, &s.cfg.approvers.get(1).unwrap(), &s.proof().hash),
        Err(Ok(Error::ReviewClosed))
    );
}

#[test]
fn exact_split_zero_dust_and_double_release_rejected() {
    for cut in [0, 1, 500, 999, 1000] {
        let mut s = Setup::new();
        s.cfg.creator_cut_bps = cut;
        let id = s.create();
        s.v().donate(&id, &s.donor, &10001);
        s.ready(id);
        s.v().release(&id);
        let creator = 10001 * i128::from(cut) / 10000;
        assert_eq!(s.balance(&s.cfg.creator), creator);
        assert_eq!(s.balance(&s.cfg.beneficiary), 10001 - creator);
        assert_eq!(s.balance(&s.id), 0);
        assert_eq!(s.v().campaign(&id).escrow, 0);
        assert_eq!(s.v().campaign(&id).state, State::Released);
        assert_eq!(s.v().try_release(&id), Err(Ok(Error::InvalidState)));
    }
}

#[test]
fn full_recorded_pull_refund_no_cut_and_double_refund_rejected() {
    let s = Setup::new();
    let id = s.create();
    s.v().donate(&id, &s.donor, &30);
    s.v().donate(&id, &s.donor, &20);
    s.v().donate(&id, &s.other, &70);
    assert_eq!(s.v().try_refund(&id, &s.donor), Err(Ok(Error::TooEarly)));
    s.time(1200);
    s.v().refund(&id, &s.donor);
    assert_eq!(s.v().campaign(&id).state, State::Refundable);
    assert_eq!(s.balance(&s.donor), 100_000);
    assert_eq!(
        s.v().try_refund(&id, &s.donor),
        Err(Ok(Error::NothingToRefund))
    );
    assert_eq!(
        s.v().try_refund(&id, &s.cfg.creator),
        Err(Ok(Error::NothingToRefund))
    );
    s.v().refund(&id, &s.other);
    assert_eq!(s.balance(&s.other), 100_000);
    assert_eq!(s.balance(&s.cfg.creator), 0);
    assert_eq!(s.v().campaign(&id).state, State::Closed);
    assert_eq!(s.balance(&s.id), 0);
    assert_eq!(
        s.v().try_refund(&id, &s.other),
        Err(Ok(Error::InvalidState))
    );
}

#[test]
fn release_refund_races_and_timely_quorum_after_deadline() {
    let s = Setup::new();
    let approved = s.create();
    let incomplete = s.create();
    s.v().donate(&approved, &s.donor, &100);
    s.v().donate(&incomplete, &s.other, &200);
    s.ready(approved);
    s.v().submit_proof(&incomplete, &s.proof());
    s.v().approve(
        &incomplete,
        &s.cfg.approvers.get(0).unwrap(),
        &s.proof().hash,
    );
    s.time(1200);
    assert_eq!(
        s.v().try_refund(&approved, &s.donor),
        Err(Ok(Error::RefundUnavailable))
    );
    s.v().release(&approved);
    assert_eq!(
        s.v().try_refund(&approved, &s.donor),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        s.v().try_release(&incomplete),
        Err(Ok(Error::BelowThreshold))
    );
    s.v().refund(&incomplete, &s.other);
    assert_eq!(s.v().try_release(&incomplete), Err(Ok(Error::InvalidState)));
    assert_eq!(s.balance(&s.id), 0);
}

#[test]
fn campaign_balances_contributions_and_approvals_are_isolated() {
    let s = Setup::new();
    let a = s.create();
    let b = s.create();
    s.v().donate(&a, &s.donor, &100);
    s.v().donate(&b, &s.donor, &300);
    s.ready(a);
    s.v().release(&a);
    assert_eq!(s.balance(&s.id), 300);
    assert_eq!(s.v().campaign(&b).escrow, 300);
    assert_eq!(s.v().campaign(&b).approvals.len(), 0);
    assert_eq!(s.v().contribution(&b, &s.donor).amount, 300);
    s.time(1200);
    s.v().refund(&b, &s.donor);
    assert_eq!(s.balance(&s.id), 0);
}

#[test]
fn empty_campaign_closes_only_after_review_deadline() {
    let s = Setup::new();
    let id = s.create();
    assert_eq!(s.v().try_close_empty(&id), Err(Ok(Error::TooEarly)));
    s.time(1200);
    s.v().close_empty(&id);
    assert_eq!(s.v().campaign(&id).state, State::Closed);
    assert_eq!(s.v().try_close_empty(&id), Err(Ok(Error::InvalidState)));
}

#[test]
fn transfer_failure_rolls_back_accounting() {
    let s = Setup::new();
    let id = s.create();
    assert!(s.v().try_donate(&id, &s.donor, &100_001).is_err());
    assert_eq!(s.v().campaign(&id).escrow, 0);
    assert_eq!(s.v().contribution(&id, &s.donor).amount, 0);
}

#[test]
fn creator_donor_refund_and_approver_require_real_authorization() {
    let s = Setup::new();
    assert!(s
        .v()
        .mock_auths(&[])
        .try_create(&s.cfg, &String::from_str(&s.env, "x"))
        .is_err());
    s.env.mock_all_auths();
    let id = s.create();
    let other_id = s.create();
    assert!(s
        .v()
        .mock_auths(&[])
        .try_donate(&id, &s.donor, &100)
        .is_err());
    s.env.mock_all_auths();
    s.v().donate(&id, &s.donor, &100);
    s.time(1100);
    assert!(s
        .v()
        .mock_auths(&[])
        .try_submit_proof(&id, &s.proof())
        .is_err());
    s.env.mock_all_auths();
    s.v().submit_proof(&id, &s.proof());
    s.v().submit_proof(&other_id, &s.proof());
    let who = s.cfg.approvers.get(0).unwrap();
    let hash = s.proof().hash;
    let auth = [MockAuth {
        address: &who,
        invoke: &MockAuthInvoke {
            contract: &s.id,
            fn_name: "approve",
            args: (id, &who, &hash).into_val(&s.env),
            sub_invokes: &[],
        },
    }];
    assert!(s.v().mock_auths(&[]).try_approve(&id, &who, &hash).is_err());
    assert!(s
        .v()
        .mock_auths(&auth)
        .try_approve(&other_id, &who, &hash)
        .is_err());
    s.v().mock_auths(&auth).approve(&id, &who, &hash);
    s.time(1200);
    assert!(s.v().mock_auths(&[]).try_refund(&id, &s.donor).is_err());
    s.env.mock_all_auths();
    s.v().refund(&id, &s.donor);
}

#[test]
fn approver_replacement_deadline_extension_and_upgrade_unavailable() {
    let s = Setup::new();
    let id = s.create();
    for name in ["set_approvers", "set_deadline", "upgrade"] {
        assert!(s
            .env
            .try_invoke_contract::<(), Error>(&s.id, &Symbol::new(&s.env, name), vec![&s.env])
            .is_err());
    }
    assert_eq!(s.v().campaign(&id).config, s.cfg);
}

#[test]
fn unsolicited_transfers_do_not_inflate_campaign_payouts() {
    let s = Setup::new();
    let id = s.create();
    s.v().donate(&id, &s.donor, &100);
    token::Client::new(&s.env, &s.cfg.token).transfer(&s.other, &s.id, &777);
    s.ready(id);
    s.v().release(&id);
    assert_eq!(
        s.balance(&s.cfg.creator) + s.balance(&s.cfg.beneficiary),
        100
    );
    assert_eq!(s.v().campaign(&id).escrow, 0);
    assert_eq!(s.balance(&s.id), 777); // Unattributed direct transfers are not donations.
}

#[test]
fn maximum_i128_split_does_not_overflow() {
    let s = Setup::new();
    let id = s.create();
    let token = token::StellarAssetClient::new(&s.env, &s.cfg.token);
    token.mint(&s.donor, &(i128::MAX - 100_000));
    s.v().donate(&id, &s.donor, &i128::MAX);
    s.ready(id);
    s.v().release(&id);
    assert_eq!(s.balance(&s.cfg.creator), i128::MAX / 20);
    assert_eq!(
        s.balance(&s.cfg.creator) + s.balance(&s.cfg.beneficiary),
        i128::MAX
    );
    assert_eq!(s.balance(&s.id), 0);
}
