#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn register_and_resolve() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let id = env.register(UsernameRegistry, ());
    let reg = UsernameRegistryClient::new(&env, &id);

    let name = String::from_str(&env, "juandelacruz");
    reg.register(&user, &name);

    assert_eq!(reg.resolve(&name), user);
    assert_eq!(reg.username_of(&user), name);
}

#[test]
#[should_panic]
fn username_must_be_unique() {
    let env = Env::default();
    env.mock_all_auths();

    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let id = env.register(UsernameRegistry, ());
    let reg = UsernameRegistryClient::new(&env, &id);

    let name = String::from_str(&env, "maria");
    reg.register(&a, &name);
    reg.register(&b, &name);
}
