#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

fn setup<'a>(env: &Env, admin: &Address) -> (Address, StellarAssetClient<'a>, TokenClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = sac.address();
    (
        addr.clone(),
        StellarAssetClient::new(env, &addr),
        TokenClient::new(env, &addr),
    )
}

#[test]
fn contribute_then_gated_disburse() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let ngo = Address::generate(&env);

    let (tok, tok_admin, token) = setup(&env, &admin);
    tok_admin.mint(&donor, &1_000);

    let id = env.register(DisasterVault, ());
    let v = DisasterVaultClient::new(&env, &id);

    v.initialize(&admin, &tok);
    v.contribute(&donor, &800);
    assert_eq!(v.total(), 800);
    assert_eq!(v.is_disaster_active(), false);

    // Disbursement is blocked until a disaster is declared.
    assert!(v.try_disburse(&ngo, &500).is_err());

    v.set_disaster(&true);
    v.disburse(&ngo, &500);
    assert_eq!(v.total(), 300);
    assert_eq!(token.balance(&ngo), 500);
    assert_eq!(v.contribution_of(&donor), 800);
}

#[test]
#[should_panic]
fn disburse_without_disaster_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);

    let (tok, tok_admin, _) = setup(&env, &admin);
    tok_admin.mint(&donor, &100);

    let id = env.register(DisasterVault, ());
    let v = DisasterVaultClient::new(&env, &id);
    v.initialize(&admin, &tok);
    v.contribute(&donor, &100);
    v.disburse(&donor, &50); // panics: NotInDisaster
}
