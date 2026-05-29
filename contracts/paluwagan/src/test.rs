#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env,
};

fn setup<'a>(env: &Env, admin: &Address) -> (Address, StellarAssetClient<'a>, TokenClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let a = sac.address();
    (
        a.clone(),
        StellarAssetClient::new(env, &a),
        TokenClient::new(env, &a),
    )
}

#[test]
fn full_round_rotates_payout() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);

    let (tok, tok_admin, token) = setup(&env, &admin);
    for m in [&a, &b, &c] {
        tok_admin.mint(m, &1_000);
    }

    let id = env.register(Paluwagan, ());
    let p = PaluwaganClient::new(&env, &id);

    let members = vec![&env, a.clone(), b.clone(), c.clone()];
    p.initialize(&tok, &members, &100);
    assert_eq!(p.round(), 0);
    assert_eq!(p.recipient_of(&0), a);
    assert_eq!(p.amount(), 100);
    assert_eq!(p.paid_count(&0), 0);

    p.contribute(&a);
    assert!(p.has_paid(&0, &a));
    assert_eq!(p.paid_count(&0), 1);
    p.contribute(&b);
    // payout must fail until everyone has paid this round
    assert!(p.try_payout(&a).is_err());
    p.contribute(&c);

    let winner = p.payout(&a);
    assert_eq!(winner, a);
    assert_eq!(p.round(), 1);
    assert_eq!(token.balance(&a), 1_000 - 100 + 300); // paid 100, received 300
    assert_eq!(token.balance(&b), 900);
    assert_eq!(token.balance(&c), 900);
}

#[test]
#[should_panic]
fn non_member_cannot_contribute() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let outsider = Address::generate(&env);

    let (tok, tok_admin, _) = setup(&env, &admin);
    tok_admin.mint(&a, &1_000);
    tok_admin.mint(&outsider, &1_000);

    let id = env.register(Paluwagan, ());
    let p = PaluwaganClient::new(&env, &id);
    let members = vec![&env, a.clone()];
    p.initialize(&tok, &members, &100);

    p.contribute(&outsider); // panics: NotMember
}

#[test]
fn duplicate_members_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let (tok, _sac, _tc) = setup(&env, &admin);

    let id = env.register(Paluwagan, ());
    let p = PaluwaganClient::new(&env, &id);

    // Same address twice → would deadlock the circle. Must be rejected.
    let members = vec![&env, a.clone(), a.clone()];
    assert!(p.try_initialize(&tok, &members, &100).is_err());
}

#[test]
fn non_member_cannot_payout() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let outsider = Address::generate(&env);
    let (tok, _sac, _tc) = setup(&env, &admin);

    let id = env.register(Paluwagan, ());
    let p = PaluwaganClient::new(&env, &id);
    let members = vec![&env, a.clone()];
    p.initialize(&tok, &members, &100);

    // A non-member must not be able to trigger payout.
    assert!(p.try_payout(&outsider).is_err());
}
