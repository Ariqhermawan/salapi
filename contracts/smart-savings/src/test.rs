#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
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
fn save_to_target_then_withdraw() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let (tok, tok_admin, token) = setup(&env, &admin);
    tok_admin.mint(&user, &1_000);

    let id = env.register(SmartSavings, ());
    let c = SmartSavingsClient::new(&env, &id);
    c.initialize(&tok);

    // unlock far in the future — only reaching the target can unlock
    c.open_goal(&user, &500, &u32::MAX);
    c.deposit(&user, &200);
    assert!(c.try_withdraw(&user).is_err()); // below target and time-locked

    c.deposit(&user, &300); // saved == target (500)
    let got = c.withdraw(&user);
    assert_eq!(got, 500);
    assert_eq!(token.balance(&user), 1_000); // 500 out, 500 back
}

#[test]
#[should_panic]
fn withdraw_while_locked_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let (tok, tok_admin, _) = setup(&env, &admin);
    tok_admin.mint(&user, &100);

    let id = env.register(SmartSavings, ());
    let c = SmartSavingsClient::new(&env, &id);
    c.initialize(&tok);
    c.open_goal(&user, &1_000, &u32::MAX);
    c.deposit(&user, &50);
    c.withdraw(&user); // panics: Locked
}
