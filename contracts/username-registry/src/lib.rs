#![no_std]

//! Username registry: maps a human @username to a Stellar account so
//! Salapi users can send by username — no addresses, no seed phrases.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Name(String),   // username -> Address
    Owner(Address), // Address  -> username
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    UsernameTaken = 1,
    AlreadyRegistered = 2,
    NotFound = 3,
    InvalidUsername = 4,
}

#[contract]
pub struct UsernameRegistry;

#[contractimpl]
impl UsernameRegistry {
    /// Claim `username` for the caller. One username per account; names are unique.
    pub fn register(env: Env, user: Address, username: String) -> Result<(), Error> {
        user.require_auth();
        if !valid_username(&username) {
            return Err(Error::InvalidUsername);
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::Name(username.clone()))
        {
            return Err(Error::UsernameTaken);
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::Owner(user.clone()))
        {
            return Err(Error::AlreadyRegistered);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Name(username.clone()), &user);
        env.storage()
            .persistent()
            .set(&DataKey::Owner(user), &username);
        Ok(())
    }

    /// Change the caller's display username to `new_username`.
    /// The previous name is intentionally kept as a permanent alias that
    /// still resolves to this account, so money addressed to the old handle
    /// is never misrouted. Reverse lookup (`username_of`) returns the new
    /// name — that is the one shown in the app.
    pub fn rename(env: Env, user: Address, new_username: String) -> Result<(), Error> {
        user.require_auth();
        if !valid_username(&new_username) {
            return Err(Error::InvalidUsername);
        }
        let current: String = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(user.clone()))
            .ok_or(Error::NotFound)?;
        if current == new_username {
            return Ok(());
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::Name(new_username.clone()))
        {
            return Err(Error::UsernameTaken);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Name(new_username.clone()), &user);
        env.storage()
            .persistent()
            .set(&DataKey::Owner(user), &new_username);
        // The old DataKey::Name(current) mapping is left in place on purpose:
        // it stays a permanent alias to this account (money-safe).
        Ok(())
    }

    /// Resolve a username to the account it points to (used by P2P send).
    pub fn resolve(env: Env, username: String) -> Result<Address, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Name(username))
            .ok_or(Error::NotFound)
    }

    /// Reverse lookup: the username an account owns.
    pub fn username_of(env: Env, user: Address) -> Result<String, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Owner(user))
            .ok_or(Error::NotFound)
    }
}

/// On-chain username policy: 3–32 chars, lowercase `a-z`, digits, or `_`.
/// Mirrors the app-side sanitiser so a direct contract call cannot register
/// an out-of-charset or homoglyph name the UI would never produce (which
/// could otherwise intercept username-addressed funds).
fn valid_username(s: &String) -> bool {
    let len = s.len();
    if len < 3 || len > 32 {
        return false;
    }
    let mut buf = [0u8; 32];
    s.copy_into_slice(&mut buf[..len as usize]);
    let mut i = 0usize;
    while i < len as usize {
        let c = buf[i];
        let ok = (c >= b'a' && c <= b'z') || (c >= b'0' && c <= b'9') || c == b'_';
        if !ok {
            return false;
        }
        i += 1;
    }
    true
}

mod test;
