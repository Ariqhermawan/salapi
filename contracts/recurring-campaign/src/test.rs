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
        env.ledger().with_mut(|ledger| {
            ledger.timestamp = 1000;
            ledger.sequence_number = 100;
        });
        let asset = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
        let cfg = Config {
            creator: Address::generate(&env),
            beneficiary: Address::generate(&env),
            token: asset.clone(),
            creator_cut_bps: 500,
            funding_deadline: 1100,
            review_deadline: 1400,
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
        token.mint(&donor, &10_000);
        token.mint(&other, &10_000);
        let id = env.register(RecurringCampaign, (asset,));
        Self { env, id, cfg, donor, other }
    }

    fn client(&self) -> RecurringCampaignClient<'_> {
        RecurringCampaignClient::new(&self.env, &self.id)
    }

    fn terms(&self) -> Vec<StageTerms> {
        vec![
            &self.env,
            StageTerms { amount: 100, due_date: 1100 },
            StageTerms { amount: 200, due_date: 1200 },
            StageTerms { amount: 300, due_date: 1300 },
        ]
    }

    fn create(&self) -> u64 {
        self.client().create(&self.cfg, &String::from_str(&self.env, "Recurring test"), &self.terms())
    }

    fn time(&self, timestamp: u64) {
        self.env.ledger().with_mut(|ledger| ledger.timestamp = timestamp);
    }

    fn proof(&self, value: u8) -> Proof {
        Proof {
            hash: BytesN::from_array(&self.env, &[value; 32]),
            url: String::from_str(&self.env, "https://salapi.app/proof/example"),
        }
    }

    fn balance(&self, who: &Address) -> i128 {
        token::Client::new(&self.env, &self.cfg.token).balance(who)
    }

    fn release_stage(&self, id: u64, due: u64, proof_byte: u8) {
        self.time(due);
        let proof = self.proof(proof_byte);
        self.client().submit_proof(&id, &proof);
        for index in 0..2 {
            self.client().approve(&id, &self.cfg.approvers.get(index).unwrap(), &proof.hash);
        }
        self.client().release(&id);
    }
}

#[test]
fn version_creation_terms_and_pagination_are_immutable() {
    let setup = Setup::new();
    let id = setup.create();
    let campaign = setup.client().campaign(&id);
    assert_eq!(setup.client().version(), 5);
    assert_eq!(setup.client().clock(), 1000);
    assert_eq!(campaign.config, setup.cfg);
    assert_eq!(campaign.stages.len(), 3);
    assert_eq!(campaign.stages.get(0).unwrap().amount, 100);
    assert_eq!(campaign.stages.get(1).unwrap().due_date, 1200);
    assert_eq!(setup.client().campaigns(&0, &20).len(), 1);
    assert_eq!(setup.client().try_campaigns(&0, &21), Err(Ok(Error::InvalidConfig)));
    assert_eq!(setup.client().try_campaign(&99), Err(Ok(Error::Missing)));
}

#[test]
fn duplicate_reviewers_and_invalid_campaign_or_stage_terms_are_rejected() {
    let setup = Setup::new();
    let title = String::from_str(&setup.env, "Recurring test");
    let mut config = setup.cfg.clone();
    config.approvers.set(1, config.approvers.get(0).unwrap());
    assert_eq!(setup.client().try_create(&config, &title, &setup.terms()), Err(Ok(Error::InvalidApprovers)));

    config = setup.cfg.clone();
    config.funding_deadline = 1000;
    assert_eq!(setup.client().try_create(&config, &title, &setup.terms()), Err(Ok(Error::InvalidDeadline)));
    config = setup.cfg.clone();
    config.creator_cut_bps = 1001;
    assert_eq!(setup.client().try_create(&config, &title, &setup.terms()), Err(Ok(Error::InvalidConfig)));
    assert_eq!(setup.client().try_create(&setup.cfg, &String::from_str(&setup.env, ""), &setup.terms()), Err(Ok(Error::InvalidConfig)));

    let empty: Vec<StageTerms> = Vec::new(&setup.env);
    assert_eq!(setup.client().try_create(&setup.cfg, &title, &empty), Err(Ok(Error::InvalidStages)));
    let one = vec![&setup.env, StageTerms { amount: 100, due_date: 1200 }];
    assert_eq!(setup.client().try_create(&setup.cfg, &title, &one), Err(Ok(Error::InvalidStages)));
    let mut unsorted = setup.terms();
    unsorted.set(2, StageTerms { amount: 200, due_date: 1200 });
    assert_eq!(setup.client().try_create(&setup.cfg, &title, &unsorted), Err(Ok(Error::InvalidStages)));
    let mut before_funding = setup.terms();
    before_funding.set(0, StageTerms { amount: 100, due_date: 1099 });
    assert_eq!(setup.client().try_create(&setup.cfg, &title, &before_funding), Err(Ok(Error::InvalidStages)));
    let mut after_review = setup.terms();
    after_review.set(2, StageTerms { amount: 300, due_date: 1400 });
    assert_eq!(setup.client().try_create(&setup.cfg, &title, &after_review), Err(Ok(Error::InvalidStages)));
    let mut no_amount = setup.terms();
    no_amount.set(1, StageTerms { amount: 0, due_date: 1200 });
    assert_eq!(setup.client().try_create(&setup.cfg, &title, &no_amount), Err(Ok(Error::InvalidStages)));
    assert_eq!(setup.client().try_campaigns(&0, &0), Err(Ok(Error::InvalidConfig)));
}

#[test]
fn donations_fill_stage_targets_in_order_and_cannot_exceed_the_locked_goal() {
    let setup = Setup::new();
    let id = setup.create();
    setup.client().donate(&id, &setup.donor, &150);
    setup.client().donate(&id, &setup.other, &200);
    let campaign = setup.client().campaign(&id);
    assert_eq!(campaign.total, 350);
    assert_eq!(campaign.escrow, 350);
    assert_eq!(campaign.stages.get(0).unwrap().funded, 100);
    assert_eq!(campaign.stages.get(1).unwrap().funded, 200);
    assert_eq!(campaign.stages.get(2).unwrap().funded, 50);
    let contribution = setup.client().contribution(&id, &setup.donor);
    assert_eq!(contribution.amount, 150);
    assert_eq!(contribution.stages, vec![&setup.env, 100, 50, 0]);
    assert_eq!(setup.client().try_donate(&id, &setup.other, &251), Err(Ok(Error::InvalidAmount)));
    assert_eq!(setup.client().try_donate(&id, &setup.donor, &0), Err(Ok(Error::InvalidAmount)));
    assert_eq!(setup.client().campaign(&id).total, 350);
    setup.time(1100);
    assert_eq!(setup.client().campaign(&id).state, State::Scheduled);
    assert_eq!(setup.client().try_donate(&id, &setup.donor, &1), Err(Ok(Error::FundingClosed)));
}

#[test]
fn stage_proof_requires_funding_close_due_date_full_stage_and_exact_quorum() {
    let setup = Setup::new();
    let id = setup.create();
    setup.client().donate(&id, &setup.donor, &100);
    assert_eq!(setup.client().try_submit_proof(&id, &setup.proof(7)), Err(Ok(Error::TooEarly)));
    setup.time(1100);
    let proof = setup.proof(7);
    setup.client().submit_proof(&id, &proof);
    assert_eq!(setup.client().try_submit_proof(&id, &setup.proof(8)), Err(Ok(Error::ProofAlreadySubmitted)));
    setup.client().approve(&id, &setup.cfg.approvers.get(0).unwrap(), &proof.hash);
    setup.client().approve(&id, &setup.cfg.approvers.get(1).unwrap(), &proof.hash);
    setup.client().release(&id);
    assert_eq!(setup.client().try_submit_proof(&id, &setup.proof(8)), Err(Ok(Error::TooEarly)));
    setup.time(1200);
    assert_eq!(setup.client().try_donate(&id, &setup.other, &1), Err(Ok(Error::FundingClosed)));

    let underfunded = Setup::new();
    let underfunded_id = underfunded.create();
    underfunded.client().donate(&underfunded_id, &underfunded.donor, &99);
    underfunded.time(1100);
    assert_eq!(underfunded.client().try_submit_proof(&underfunded_id, &underfunded.proof(7)), Err(Ok(Error::StageNotFunded)));
}

#[test]
fn every_stage_uses_a_distinct_proof_two_approvals_and_one_locked_split() {
    let setup = Setup::new();
    let id = setup.create();
    setup.client().donate(&id, &setup.donor, &600);
    let a = setup.cfg.approvers.get(0).unwrap();
    let b = setup.cfg.approvers.get(1).unwrap();
    for (due, byte, escrow) in [(1100, 7, 500), (1200, 8, 300), (1300, 9, 0)] {
        setup.time(due);
        let proof = setup.proof(byte);
        setup.client().submit_proof(&id, &proof);
        assert_eq!(setup.client().try_release(&id), Err(Ok(Error::BelowThreshold)));
        assert_eq!(setup.client().try_approve(&id, &setup.other, &proof.hash), Err(Ok(Error::NotApprover)));
        assert_eq!(setup.client().try_approve(&id, &a, &setup.proof(byte + 1).hash), Err(Ok(Error::InvalidProof)));
        setup.client().approve(&id, &a, &proof.hash);
        assert_eq!(setup.client().try_approve(&id, &a, &proof.hash), Err(Ok(Error::AlreadyApproved)));
        assert_eq!(setup.client().try_release(&id), Err(Ok(Error::BelowThreshold)));
        setup.client().approve(&id, &b, &proof.hash);
        setup.client().release(&id);
        let campaign = setup.client().campaign(&id);
        assert_eq!(campaign.escrow, escrow);
        assert!(campaign.stages.get(campaign.current_stage - 1).unwrap().released);
    }
    let campaign = setup.client().campaign(&id);
    assert_eq!(campaign.current_stage, 3);
    assert_eq!(campaign.state, State::Released);
    assert_eq!(campaign.escrow, 0);
    assert_eq!(setup.balance(&setup.cfg.creator), 30);
    assert_eq!(setup.balance(&setup.cfg.beneficiary), 570);
    assert_eq!(setup.balance(&setup.id), 0);
    assert_eq!(setup.client().try_release(&id), Err(Ok(Error::BelowThreshold)));
    assert_eq!(setup.client().try_refund(&id, &setup.donor), Err(Ok(Error::InvalidState)));
}

#[test]
fn donors_refund_only_unreleased_stage_allocations_after_final_review_deadline() {
    let setup = Setup::new();
    let id = setup.create();
    setup.client().donate(&id, &setup.donor, &150); // stage 1 full; stage 2 partially funded
    let before = setup.balance(&setup.donor);
    setup.release_stage(id, 1100, 7);
    assert_eq!(setup.client().campaign(&id).escrow, 50);
    assert_eq!(setup.client().try_refund(&id, &setup.donor), Err(Ok(Error::TooEarly)));
    setup.time(1400);
    let campaign = setup.client().campaign(&id);
    assert_eq!(campaign.state, State::Refundable);
    assert_eq!(setup.client().try_release(&id), Err(Ok(Error::BelowThreshold)));
    setup.client().refund(&id, &setup.donor);
    assert_eq!(setup.balance(&setup.donor), before + 50);
    assert_eq!(setup.client().contribution(&id, &setup.donor).refunded, true);
    assert_eq!(setup.client().campaign(&id).state, State::Closed);
    assert_eq!(setup.client().campaign(&id).escrow, 0);
    assert_eq!(setup.client().try_refund(&id, &setup.donor), Err(Ok(Error::InvalidState)));
}

#[test]
fn timely_quorum_can_release_after_deadline_but_unspent_stages_are_refundable() {
    let setup = Setup::new();
    let id = setup.create();
    setup.client().donate(&id, &setup.donor, &300);
    setup.time(1100);
    let proof = setup.proof(7);
    setup.client().submit_proof(&id, &proof);
    setup.client().approve(&id, &setup.cfg.approvers.get(0).unwrap(), &proof.hash);
    setup.client().approve(&id, &setup.cfg.approvers.get(1).unwrap(), &proof.hash);
    setup.time(1400);
    assert_eq!(setup.client().campaign(&id).state, State::PendingProof);
    setup.client().release(&id);
    assert_eq!(setup.client().campaign(&id).state, State::Refundable);
    assert_eq!(setup.client().campaign(&id).escrow, 200);
    let before = setup.balance(&setup.donor);
    setup.client().refund(&id, &setup.donor);
    assert_eq!(setup.balance(&setup.donor), before + 200);
    assert_eq!(setup.client().campaign(&id).state, State::Closed);
}

#[test]
fn late_quorum_cannot_block_refunds_and_an_empty_campaign_can_close() {
    let setup = Setup::new();
    let id = setup.create();
    let empty = setup.create();
    assert_eq!(setup.client().try_close_empty(&empty), Err(Ok(Error::TooEarly)));
    setup.client().donate(&id, &setup.donor, &100);
    setup.time(1100);
    let proof = setup.proof(7);
    setup.client().submit_proof(&id, &proof);
    setup.client().approve(&id, &setup.cfg.approvers.get(0).unwrap(), &proof.hash);
    setup.time(1400);
    assert_eq!(setup.client().campaign(&id).state, State::Refundable);
    assert_eq!(setup.client().try_approve(&id, &setup.cfg.approvers.get(1).unwrap(), &proof.hash), Err(Ok(Error::InvalidState)));
    setup.client().refund(&id, &setup.donor);

    setup.client().close_empty(&empty);
    assert_eq!(setup.client().campaign(&empty).state, State::Closed);
}

#[test]
fn creator_donor_and_approver_actions_require_authorization() {
    let setup = Setup::new();
    let title = String::from_str(&setup.env, "Recurring test");
    assert!(setup.client().mock_auths(&[]).try_create(&setup.cfg, &title, &setup.terms()).is_err());
    setup.env.mock_all_auths();
    let id = setup.create();
    assert!(setup.client().mock_auths(&[]).try_donate(&id, &setup.donor, &100).is_err());
    setup.env.mock_all_auths();
    setup.client().donate(&id, &setup.donor, &100);
    setup.time(1100);
    assert!(setup.client().mock_auths(&[]).try_submit_proof(&id, &setup.proof(7)).is_err());
    setup.env.mock_all_auths();
    setup.client().submit_proof(&id, &setup.proof(7));
    let who = setup.cfg.approvers.get(0).unwrap();
    let hash = setup.proof(7).hash;
    let auth = [MockAuth {
        address: &who,
        invoke: &MockAuthInvoke {
            contract: &setup.id,
            fn_name: "approve",
            args: (id, &who, &hash).into_val(&setup.env),
            sub_invokes: &[],
        },
    }];
    assert!(setup.client().mock_auths(&[]).try_approve(&id, &who, &hash).is_err());
    setup.client().mock_auths(&auth).approve(&id, &who, &hash);
}

#[test]
fn campaign_stage_payouts_ignore_unattributed_transfers_and_upgrade_is_unavailable() {
    let setup = Setup::new();
    let id = setup.create();
    setup.client().donate(&id, &setup.donor, &100);
    token::Client::new(&setup.env, &setup.cfg.token).transfer(&setup.other, &setup.id, &777);
    setup.release_stage(id, 1100, 7);
    assert_eq!(setup.balance(&setup.cfg.creator) + setup.balance(&setup.cfg.beneficiary), 100);
    assert_eq!(setup.client().campaign(&id).escrow, 0);
    assert_eq!(setup.balance(&setup.id), 777);
    assert!(setup.env.try_invoke_contract::<(), Error>(&setup.id, &Symbol::new(&setup.env, "upgrade"), vec![&setup.env]).is_err());
}

#[test]
fn maximum_i128_stage_split_does_not_overflow() {
    let setup = Setup::new();
    let mut terms = setup.terms();
    terms.set(0, StageTerms { amount: i128::MAX, due_date: 1100 });
    terms.set(1, StageTerms { amount: 1, due_date: 1200 });
    terms.set(2, StageTerms { amount: 1, due_date: 1300 });
    assert_eq!(setup.client().try_create(&setup.cfg, &String::from_str(&setup.env, "Overflow"), &terms), Err(Ok(Error::Arithmetic)));
}
