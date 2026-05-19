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
fn rename_updates_display_and_keeps_old_as_alias() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let id = env.register(UsernameRegistry, ());
    let reg = UsernameRegistryClient::new(&env, &id);

    let old = String::from_str(&env, "henceut");
    let new = String::from_str(&env, "ariq");
    reg.register(&user, &old);
    reg.rename(&user, &new);

    assert_eq!(reg.username_of(&user), new); // display name = new
    assert_eq!(reg.resolve(&new), user); // new resolves
    assert_eq!(reg.resolve(&old), user); // old still resolves (alias) — money-safe
}

#[test]
#[should_panic]
fn rename_to_taken_name_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let id = env.register(UsernameRegistry, ());
    let reg = UsernameRegistryClient::new(&env, &id);

    reg.register(&a, &String::from_str(&env, "alice"));
    reg.register(&b, &String::from_str(&env, "bob"));
    reg.rename(&b, &String::from_str(&env, "alice")); // taken → panic
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
