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
fn deposit_then_disburse() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let beneficiary = Address::generate(&env);

    let (token_addr, token_admin, token) = setup(&env, &admin);
    token_admin.mint(&donor, &1_000);

    let id = env.register(BaseVault, ());
    let vault = BaseVaultClient::new(&env, &id);

    vault.initialize(&admin, &token_addr);
    assert_eq!(vault.total(), 0);

    vault.deposit(&donor, &600);
    assert_eq!(vault.total(), 600);
    assert_eq!(vault.contribution_of(&donor), 600);
    assert_eq!(token.balance(&donor), 400);
    assert_eq!(token.balance(&id), 600);

    vault.disburse(&beneficiary, &250);
    assert_eq!(vault.total(), 350);
    assert_eq!(token.balance(&beneficiary), 250);
}

#[test]
#[should_panic]
fn cannot_double_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _, _) = setup(&env, &admin);
    let id = env.register(BaseVault, ());
    let vault = BaseVaultClient::new(&env, &id);
    vault.initialize(&admin, &token_addr);
    vault.initialize(&admin, &token_addr);
}

#[test]
#[should_panic]
fn cannot_overdraw_pool() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let (token_addr, token_admin, _) = setup(&env, &admin);
    token_admin.mint(&donor, &100);
    let id = env.register(BaseVault, ());
    let vault = BaseVaultClient::new(&env, &id);
    vault.initialize(&admin, &token_addr);
    vault.deposit(&donor, &100);
    vault.disburse(&donor, &500);
}
