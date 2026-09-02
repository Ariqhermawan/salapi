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
    assert!(p.try_payout().is_err());
    p.contribute(&c);

    let winner = p.payout();
    assert_eq!(winner, a);
    assert_eq!(p.round(), 1);
    assert_eq!(token.balance(&a), 1_000 - 100 + 300); // paid 100, received 300
    assert_eq!(token.balance(&b), 900);
    assert_eq!(token.balance(&c), 900);
    assert_eq!(token.balance(&id), 0);
    assert_eq!(token.balance(&a) + token.balance(&b) + token.balance(&c), 3_000);
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
