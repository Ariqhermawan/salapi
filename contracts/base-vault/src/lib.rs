#![no_std]

//! Base vault: the shared primitive every Salapi vault is built on.
//! Holds a single token (USDC) under rules. Rule-set modules
//! (disaster / paluwagan / smart-savings) specialise the gated `disburse`.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    Total,
    Contribution(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientPool = 4,
}

#[contract]
pub struct BaseVault;

#[contractimpl]
impl BaseVault {
    /// One-time setup: the admin (disbursement authority) and the token held.
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Total, &0i128);
        Ok(())
    }

    /// Anyone contributes `amount` of the token into the pool.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;

        token::Client::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        let total: i128 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Total, &(total + amount));

        let key = DataKey::Contribution(from.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(prev + amount));

        env.events()
            .publish((symbol_short!("deposit"), from), amount);
        Ok(())
    }

    /// Gated payout. Rule-set modules wrap this with their own conditions.
    pub fn disburse(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let total: i128 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        if amount > total {
            return Err(Error::InsufficientPool);
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );

        env.storage()
            .instance()
            .set(&DataKey::Total, &(total - amount));
        env.events()
            .publish((symbol_short!("disburse"), to), amount);
        Ok(())
    }

    pub fn total(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Total).unwrap_or(0)
    }

    pub fn contribution_of(env: Env, who: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(who))
            .unwrap_or(0)
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }
}

mod test;
