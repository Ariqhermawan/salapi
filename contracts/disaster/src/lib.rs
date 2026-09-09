#![no_std]

//! Disaster relief vault — the hero rule-set on the base-vault primitive.
//! Anyone contributes into a transparent public pool; the admin can release
//! funds ONLY while a disaster is declared active. Every contribute / disburse
//! / disaster toggle is an on-chain event for the public transparency dashboard.
//!
//! DAO governance + AI Tribunal are Build-Award vision — explicitly NOT in the
//! 30-day scope. Day-30 disbursement is a simple admin gate, fully transparent.

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
    DisasterActive,
    PendingAdmin,
    DisburseCap,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientPool = 4,
    NotInDisaster = 5,
    NoPendingAdmin = 6,
    ExceedsCap = 7,
}

#[contract]
pub struct DisasterVault;

#[contractimpl]
impl DisasterVault {
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Total, &0i128);
        env.storage().instance().set(&DataKey::DisasterActive, &false);
        Ok(())
    }

    /// Anyone donates `amount` into the public relief pool.
    pub fn contribute(env: Env, from: Address, amount: i128) -> Result<(), Error> {
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
            .publish((symbol_short!("contrib"), from), amount);
        Ok(())
    }

    /// Admin declares (or clears) an active disaster — the disbursement gate.
    pub fn set_disaster(env: Env, active: bool) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::DisasterActive, &active);
        env.events()
            .publish((symbol_short!("disaster"),), active);
        Ok(())
    }

    /// Admin releases relief to `to` — only while a disaster is active.
    pub fn disburse(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        let active: bool = env
            .storage()
            .instance()
            .get(&DataKey::DisasterActive)
            .unwrap_or(false);
        if !active {
            return Err(Error::NotInDisaster);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        // Opt-in per-tx ceiling (0 = no cap). Bounds the blast radius if the
        // admin key is ever compromised. Operator sets it via set_disburse_cap.
        let cap: i128 = env
            .storage()
            .instance()
            .get(&DataKey::DisburseCap)
            .unwrap_or(0);
        if cap > 0 && amount > cap {
            return Err(Error::ExceedsCap);
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

    /// Admin sets a per-transaction disburse ceiling (0 = no cap). A bounded
    /// ceiling limits how much a single (possibly compromised) admin call can
    /// move out of the relief pool.
    pub fn set_disburse_cap(env: Env, cap: i128) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::DisburseCap, &cap);
        env.events().publish((symbol_short!("cap"),), cap);
        Ok(())
    }

    /// Step 1 of a two-step admin handover: the current admin nominates a
    /// successor. Nothing changes until the nominee calls `accept_admin`.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        Ok(())
    }

    /// Step 2: the nominated successor accepts and becomes admin. The two-step
    /// flow prevents handing control to an address nobody can actually use.
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdmin)?;
        pending.require_auth();
        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.events().publish((symbol_short!("admin"),), pending);
        Ok(())
    }

    pub fn disburse_cap(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::DisburseCap)
            .unwrap_or(0)
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

    pub fn is_disaster_active(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::DisasterActive)
            .unwrap_or(false)
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }
}

mod test;
