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

    let id = env.register(BaseVault, (admin.clone(), token_addr.clone()));
    let vault = BaseVaultClient::new(&env, &id);

    assert_eq!(vault.total(), 0);

    vault.deposit(&donor, &600);
    assert_eq!(vault.total(), 600);
    assert_eq!(vault.contribution_of(&donor), 600);
    assert_eq!(token.balance(&donor), 400);
    assert_eq!(token.balance(&id), 600);

    vault.disburse(&beneficiary, &250);
    assert_eq!(vault.total(), 350);
    assert_eq!(token.balance(&beneficiary), 250);
    assert_eq!(
        token.balance(&id) + token.balance(&beneficiary) + token.balance(&donor),
        1_000
    );
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
    let id = env.register(BaseVault, (admin.clone(), token_addr.clone()));
    let vault = BaseVaultClient::new(&env, &id);
    vault.deposit(&donor, &100);
    vault.disburse(&donor, &500);
}

#[test]
fn deployment_binds_authority_and_rejects_reinitialization() {
    use soroban_sdk::{IntoVal, Symbol};
    let env = Env::default();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let (token_addr, _, _) = setup(&env, &admin);
    let (other_token, _, _) = setup(&env, &attacker);
    let id = env.register(BaseVault, (admin.clone(), token_addr.clone()));
    let vault = BaseVaultClient::new(&env, &id);
    assert_eq!(vault.admin(), admin);
    assert_eq!(vault.total(), 0);

    // Even an attacker willing to authorize their own address cannot rebind it.
    env.mock_all_auths();
    for method in ["initialize", "__constructor"] {
        assert!(env
            .try_invoke_contract::<(), Error>(
                &id,
                &Symbol::new(&env, method),
                (attacker.clone(), other_token.clone()).into_val(&env),
            )
            .is_err());
        assert_eq!(vault.admin(), admin);
        assert_eq!(vault.total(), 0);
        env.as_contract(&id, || {
            assert_eq!(
                env.storage().instance().get::<_, Address>(&DataKey::Token),
                Some(token_addr.clone())
            );
        });
    }
}

#[test]
fn disbursement_requires_the_deployment_bound_admin() {
    use soroban_sdk::{
        testutils::{MockAuth, MockAuthInvoke},
        IntoVal,
    };
    let env = Env::default();
    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let attacker = Address::generate(&env);
    let (token_addr, token_admin, token) = setup(&env, &admin);
    let id = env.register(BaseVault, (admin.clone(), token_addr.clone()));
    let vault = BaseVaultClient::new(&env, &id);
    env.mock_all_auths();
    token_admin.mint(&donor, &100);
    vault.deposit(&donor, &100);
    env.mock_auths(&[]);
    assert!(vault.try_disburse(&attacker, &100).is_err());
    let args: soroban_sdk::Vec<soroban_sdk::Val> = (attacker.clone(), 100i128).into_val(&env);
    assert!(vault
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "disburse",
                args: args.clone(),
                sub_invokes: &[],
            },
        }])
        .try_disburse(&attacker, &100)
        .is_err());
    assert_eq!(vault.total(), 100);
    assert_eq!(token.balance(&id), 100);
    assert_eq!(token.balance(&attacker), 0);
    vault
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "disburse",
                args,
                sub_invokes: &[],
            },
        }])
        .disburse(&attacker, &100);
    assert_eq!(vault.total(), 0);
    assert_eq!(token.balance(&attacker), 100);
    assert_eq!(vault.contribution_of(&donor), 100);
}
