#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    vec, IntoVal, TryFromVal,
};

struct Setup {
    env: Env,
    id: Address,
    signers: Vec<Address>,
    token: Address,
    donor: Address,
    payee: Address,
}

impl Setup {
    fn new() -> Self {
        let env = Env::new_with_config(soroban_sdk::testutils::EnvTestConfig {
            capture_snapshot_at_drop: false,
        });
        env.mock_all_auths();
        env.ledger().with_mut(|l| {
            l.sequence_number = 100;
            l.timestamp = 100_000;
        });
        let signers = vec![
            &env,
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ];
        let token = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let donor = Address::generate(&env);
        let payee = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&donor, &10_000);
        let id = env.register(
            DisasterVault,
            (signers.clone(), token.clone(), 2000u32, 20u32),
        );
        Self {
            env,
            id,
            signers,
            token,
            donor,
            payee,
        }
    }
    fn v(&self) -> DisasterVaultClient<'_> {
        DisasterVaultClient::new(&self.env, &self.id)
    }
    fn a(&self) -> Address {
        self.signers.get(0).unwrap()
    }
    fn b(&self) -> Address {
        self.signers.get(1).unwrap()
    }
    fn c(&self) -> Address {
        self.signers.get(2).unwrap()
    }
    fn approve(&self, id: u64) {
        self.v().approve(&self.a(), &id);
        self.v().approve(&self.b(), &id);
    }
    fn control(&self, action: Action) -> u64 {
        let id = self.v().propose(&self.a(), &action);
        self.approve(id);
        self.v().execute(&self.c(), &id);
        id
    }
    fn funded(&self) {
        self.v().contribute(&self.donor, &1000);
        self.control(Action::Unpause);
    }
    fn payout(&self, amount: i128) -> u64 {
        self.v()
            .propose(&self.a(), &Action::Disburse(self.payee.clone(), amount))
    }
    fn advance(&self, ledgers: u32, seconds: u64) {
        self.env.ledger().with_mut(|l| {
            l.sequence_number += ledgers;
            l.timestamp += seconds;
        });
    }
    fn pay(&self, amount: i128) -> u64 {
        let id = self.payout(amount);
        self.approve(id);
        self.advance(20, 100);
        self.v().execute(&self.a(), &id);
        id
    }
}

#[test]
fn fixed_config_and_zero_balance_are_readable() {
    let s = Setup::new();
    assert_eq!(s.v().version(), 3);
    assert_eq!(s.v().config().signers, s.signers);
    assert_eq!(s.v().config().cap_bps, 2000);
    assert_eq!(s.v().config().timelock_ledgers, 20);
    assert!(s.v().status().paused);
    assert_eq!(s.v().total(), 0);
    assert_eq!(s.v().status().allowance, 0);
}

#[test]
#[should_panic]
fn init_duplicate_signers_rejected() {
    let s = Setup::new();
    s.env.register(
        DisasterVault,
        (vec![&s.env, s.a(), s.b(), s.a()], s.token, 2000u32, 20u32),
    );
}

#[test]
#[should_panic]
fn init_fewer_than_three_rejected() {
    let s = Setup::new();
    s.env.register(
        DisasterVault,
        (vec![&s.env, s.a(), s.b()], s.token, 2000u32, 20u32),
    );
}

#[test]
#[should_panic]
fn init_more_than_three_rejected() {
    let s = Setup::new();
    s.env.register(
        DisasterVault,
        (
            vec![&s.env, s.a(), s.b(), s.c(), s.donor],
            s.token,
            2000u32,
            20u32,
        ),
    );
}

#[test]
#[should_panic]
fn init_invalid_cap_rejected() {
    let s = Setup::new();
    s.env
        .register(DisasterVault, (s.signers, s.token, 10_001u32, 20u32));
}

#[test]
#[should_panic]
fn init_zero_timelock_rejected() {
    let s = Setup::new();
    s.env
        .register(DisasterVault, (s.signers, s.token, 2000u32, 0u32));
}

#[test]
fn below_threshold_duplicate_approval_and_early_execute_rejected() {
    let s = Setup::new();
    s.funded();
    let id = s.payout(100);
    assert_eq!(
        s.v().try_execute(&s.a(), &id),
        Err(Ok(Error::BelowThreshold))
    );
    s.v().approve(&s.a(), &id);
    assert_eq!(
        s.v().try_approve(&s.a(), &id),
        Err(Ok(Error::AlreadyApproved))
    );
    assert_eq!(
        s.v().try_execute(&s.a(), &id),
        Err(Ok(Error::BelowThreshold))
    );
    s.advance(30, 150); // Waiting before quorum must not satisfy timelock.
    s.v().approve(&s.b(), &id);
    let ready = s.v().proposal(&id).ready_ledger.unwrap();
    s.advance(19, 95);
    s.v().approve(&s.c(), &id); // Third approval must not restart the delay.
    assert_eq!(s.v().proposal(&id).ready_ledger, Some(ready));
    assert_eq!(s.v().try_execute(&s.c(), &id), Err(Ok(Error::Timelocked)));
    assert_eq!(s.v().total(), 1000);
    s.advance(1, 5);
    s.v().execute(&s.c(), &id);
    assert_eq!(s.v().total(), 900);
    assert_eq!(
        s.v().try_execute(&s.a(), &id),
        Err(Ok(Error::AlreadyExecuted))
    );
    assert_eq!(
        s.v().try_approve(&s.a(), &id),
        Err(Ok(Error::AlreadyExecuted))
    );
}

#[test]
fn any_two_of_three_succeed_and_conserve_balances() {
    let s = Setup::new();
    s.funded();
    let id = s.payout(200);
    s.v().approve(&s.b(), &id);
    s.v().approve(&s.c(), &id);
    s.advance(20, 100);
    s.v().execute(&s.a(), &id);
    let token = token::Client::new(&s.env, &s.token);
    assert_eq!(token.balance(&s.payee), 200);
    assert_eq!(s.v().total(), 800);
    assert_eq!(
        token.balance(&s.donor) + token.balance(&s.payee) + token.balance(&s.id),
        10_000
    );
    assert_eq!(s.v().contribution_of(&s.donor), 1000);
}

#[test]
fn cap_uses_current_balance_and_all_executed_proposals() {
    let s = Setup::new();
    s.funded();
    // Both are approved before either transfer, but execute reads current state.
    let first = s.payout(100);
    let second = s.payout(100);
    s.approve(first);
    s.approve(second);
    s.advance(20, 100);
    s.v().execute(&s.a(), &first);
    assert_eq!(s.v().status().cap, 180);
    assert_eq!(s.v().status().allowance, 80);
    assert_eq!(s.v().try_execute(&s.b(), &second), Err(Ok(Error::OverCap)));
    assert!(!s.v().proposal(&second).executed);
    s.pay(80); // Exact equality 100+80 == 20% * 900 succeeds.
    assert_eq!(s.v().status().spent_24h, 180);
    assert_eq!(s.v().total(), 820);
    assert_eq!(s.v().status().allowance, 0);
}

#[test]
fn rolling_window_not_midnight_reset_and_exact_expiry() {
    let s = Setup::new();
    s.funded();
    s.env.ledger().with_mut(|l| l.timestamp = DAY * 2 - 101);
    s.pay(200); // One second before midnight.
    let id = s.payout(160);
    s.approve(id);
    s.advance(20, DAY - 1);
    assert_eq!(s.v().try_execute(&s.a(), &id), Err(Ok(Error::OverCap)));
    s.advance(1, 1);
    assert_eq!(s.v().status().spent_24h, 0);
    s.v().execute(&s.a(), &id);
    assert_eq!(s.v().status().spent_24h, 160);
}

#[test]
fn pause_unpause_require_quorum_and_stale_controls_cannot_replay() {
    let s = Setup::new();
    s.v().contribute(&s.donor, &1000); // Contribution works while paused.
    let u1 = s.v().propose(&s.a(), &Action::Unpause);
    let u2 = s.v().propose(&s.a(), &Action::Unpause);
    s.approve(u2);
    s.v().approve(&s.a(), &u1);
    assert_eq!(
        s.v().try_execute(&s.a(), &u1),
        Err(Ok(Error::BelowThreshold))
    );
    s.v().approve(&s.b(), &u1);
    s.v().execute(&s.a(), &u1);
    let payout = s.payout(100);
    s.approve(payout);
    s.advance(20, 100);
    let p = s.v().propose(&s.a(), &Action::Pause);
    s.v().approve(&s.a(), &p);
    assert_eq!(
        s.v().try_execute(&s.a(), &p),
        Err(Ok(Error::BelowThreshold))
    );
    s.v().approve(&s.b(), &p);
    s.v().execute(&s.b(), &p);
    assert_eq!(s.v().try_execute(&s.a(), &payout), Err(Ok(Error::Paused)));
    assert_eq!(s.v().try_execute(&s.a(), &u2), Err(Ok(Error::StaleControl)));
    s.control(Action::Unpause);
    s.v().execute(&s.a(), &payout);
}

#[test]
fn unauthorized_signer_and_invalid_money_rejected() {
    let s = Setup::new();
    s.funded();
    assert_eq!(
        s.v().try_propose(&s.donor, &Action::Pause),
        Err(Ok(Error::NotSigner))
    );
    assert_eq!(
        s.v()
            .try_propose(&s.a(), &Action::Disburse(s.payee.clone(), 0)),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.v()
            .try_propose(&s.a(), &Action::Disburse(s.id.clone(), 1)),
        Err(Ok(Error::InvalidRecipient))
    );
    assert_eq!(
        s.v().try_contribute(&s.donor, &-1),
        Err(Ok(Error::InvalidAmount))
    );
    let id = s.payout(1001);
    s.approve(id);
    s.advance(20, 100);
    assert_eq!(
        s.v().try_execute(&s.a(), &id),
        Err(Ok(Error::InsufficientPool))
    );
    assert_eq!(s.v().try_approve(&s.donor, &id), Err(Ok(Error::NotSigner)));
    assert_eq!(s.v().try_execute(&s.donor, &id), Err(Ok(Error::NotSigner)));
}

#[test]
fn approval_requires_real_authorization_and_is_bound_to_proposal() {
    let s = Setup::new();
    let id = s.v().propose(&s.a(), &Action::Unpause);
    let other = s.v().propose(&s.a(), &Action::Unpause);
    let who = s.a();
    let auth = [MockAuth {
        address: &who,
        invoke: &MockAuthInvoke {
            contract: &s.id,
            fn_name: "approve",
            args: (&who, id).into_val(&s.env),
            sub_invokes: &[],
        },
    }];
    assert!(s.v().mock_auths(&[]).try_approve(&who, &id).is_err());
    assert!(s.v().mock_auths(&auth).try_approve(&who, &other).is_err());
    s.v().mock_auths(&auth).approve(&who, &id);
    assert_eq!(s.v().proposal(&id).approvals.len(), 1);
    assert!(s.v().mock_auths(&[]).try_execute(&who, &id).is_err());
}

#[test]
fn cap_rounds_down_without_i128_overflow() {
    assert_eq!(cap(9, 2000), 1);
    assert_eq!(cap(i128::MAX, 10_000), i128::MAX);
    assert_eq!(cap(i128::MAX, 2000), i128::MAX / 5);
}

#[test]
fn direct_token_transfers_count_in_vault_balance() {
    let s = Setup::new();
    token::Client::new(&s.env, &s.token).transfer(&s.donor, &s.id, &1000);
    assert_eq!(s.v().total(), 1000);
    assert_eq!(s.v().status().cap, 200);
}

#[test]
fn missing_spending_history_fails_closed() {
    let s = Setup::new();
    s.funded();
    let id = s.payout(1);
    s.approve(id);
    s.advance(20, 100);
    s.env.as_contract(&s.id, || {
        s.env.storage().persistent().remove(&DataKey::Spends)
    });
    assert_eq!(
        s.v().try_execute(&s.a(), &id),
        Err(Ok(Error::HistoryUnavailable))
    );
    assert_eq!(s.v().total(), 1000);
}

#[test]
fn privileged_events_and_proposal_pagination_are_reviewable() {
    let s = Setup::new();
    let emitted = |topic: &str| {
        assert!(
            s.env.events().all().iter().any(|e| e.0 == s.id
                && soroban_sdk::Symbol::try_from_val(&s.env, &e.1.get(0).unwrap()).ok()
                    == Some(soroban_sdk::Symbol::new(&s.env, topic))),
            "missing event: {}",
            topic
        );
    };
    emitted("init");
    let id = s.v().propose(&s.a(), &Action::Unpause);
    emitted("propose");
    s.v().approve(&s.a(), &id);
    emitted("approve");
    s.v().approve(&s.b(), &id);
    s.v().execute(&s.a(), &id);
    emitted("execute");
    emitted("paused");
    s.v().contribute(&s.donor, &1000);
    emitted("contrib");
    s.pay(100);
    emitted("execute");
    let latest = s.v().proposals(&0, &1);
    assert_eq!(latest.len(), 1);
    assert_eq!(latest.get(0).unwrap().id, 2);
    assert_eq!(s.v().proposals(&2, &20).get(0).unwrap().id, 1);
    assert!(s.v().try_proposals(&0, &21).is_err());
    assert_eq!(s.v().config().signers, s.signers);
}

#[test]
fn signer_rotation_and_legacy_admin_entrypoints_are_unavailable() {
    let s = Setup::new();
    for method in [
        "set_signers",
        "set_admin",
        "upgrade",
        "initialize",
        "disburse",
        "set_disaster",
    ] {
        assert!(s
            .env
            .try_invoke_contract::<(), Error>(
                &s.id,
                &soroban_sdk::Symbol::new(&s.env, method),
                vec![&s.env]
            )
            .is_err());
    }
}
