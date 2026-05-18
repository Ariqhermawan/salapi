#![no_std]

//! Smart-savings — a personal locked goal vault on the base-vault pattern.
//! A user opens a goal (target + unlock ledger), deposits over time, and can
//! only withdraw once the target is reached OR the unlock ledger has passed.
//! (The "Smart Allocator" that splits salary into goals is an off-chain
//! rule-based engine in the app layer; ML personalisation = Build Award.)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
};

#[derive(Clone)]
#[contracttype]
pub struct Goal {
    pub target: i128,
    pub unlock: u32,
    pub saved: i128,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Token,
    Goal(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    GoalExists = 4,
    NoGoal = 5,
    Locked = 6,
}

#[contract]
pub struct SmartSavings;

#[contractimpl]
impl SmartSavings {
    pub fn initialize(env: Env, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Token) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Token, &token);
        Ok(())
    }

    /// Open a savings goal: a target amount and an unlock ledger sequence.
    pub fn open_goal(
        env: Env,
        owner: Address,
        target: i128,
        unlock_ledger: u32,
    ) -> Result<(), Error> {
        owner.require_auth();
        if target <= 0 {
            return Err(Error::InvalidAmount);
        }
        let k = DataKey::Goal(owner.clone());
        if env.storage().persistent().has(&k) {
            return Err(Error::GoalExists);
        }
        env.storage().persistent().set(
            &k,
            &Goal {
                target,
                unlock: unlock_ledger,
                saved: 0,
            },
        );
        Ok(())
    }

    pub fn deposit(env: Env, owner: Address, amount: i128) -> Result<(), Error> {
        owner.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let k = DataKey::Goal(owner.clone());
        let mut g: Goal = env.storage().persistent().get(&k).ok_or(Error::NoGoal)?;
        token::Client::new(&env, &token).transfer(
            &owner,
            &env.current_contract_address(),
            &amount,
        );
        g.saved += amount;
        env.storage().persistent().set(&k, &g);
        env.events()
            .publish((symbol_short!("deposit"), owner), amount);
        Ok(())
    }

    /// Withdraw the saved amount — allowed once the target is reached OR the
    /// unlock ledger has passed. Otherwise the funds stay locked.
    pub fn withdraw(env: Env, owner: Address) -> Result<i128, Error> {
        owner.require_auth();
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let k = DataKey::Goal(owner.clone());
        let g: Goal = env.storage().persistent().get(&k).ok_or(Error::NoGoal)?;
        let unlocked = g.saved >= g.target || env.ledger().sequence() >= g.unlock;
        if !unlocked {
            return Err(Error::Locked);
        }
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &owner,
            &g.saved,
        );
        let amt = g.saved;
        env.storage().persistent().remove(&k);
        env.events()
            .publish((symbol_short!("withdraw"), owner), amt);
        Ok(amt)
    }

    pub fn goal_of(env: Env, owner: Address) -> Result<Goal, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Goal(owner))
            .ok_or(Error::NoGoal)
    }
}

mod test;
