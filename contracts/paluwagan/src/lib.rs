#![no_std]

//! Paluwagan — a trustless rotating savings circle (ROSCA) on the base-vault
//! pattern. A fixed circle of members each contributes a fixed amount per
//! round; once everyone has paid, the whole pot rotates to the next member.
//! The contract holds the pot, not a human organiser — no one can abscond.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Token,
    Amount,
    Members,
    Round,
    Paid(u32, Address),
    PaidCount(u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    NotMember = 4,
    AlreadyPaid = 5,
    RoundNotComplete = 6,
}

#[contract]
pub struct Paluwagan;

#[contractimpl]
impl Paluwagan {
    pub fn initialize(
        env: Env,
        token: Address,
        members: Vec<Address>,
        amount: i128,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Members) {
            return Err(Error::AlreadyInitialized);
        }
        if amount <= 0 || members.len() == 0 {
            return Err(Error::InvalidAmount);
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);
        env.storage().instance().set(&DataKey::Members, &members);
        env.storage().instance().set(&DataKey::Round, &0u32);
        Ok(())
    }

    /// A member pays their fixed contribution for the current round.
    pub fn contribute(env: Env, member: Address) -> Result<(), Error> {
        member.require_auth();
        let members: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Members)
            .ok_or(Error::NotInitialized)?;
        if !members.iter().any(|m| m == member) {
            return Err(Error::NotMember);
        }
        let round: u32 = env.storage().instance().get(&DataKey::Round).unwrap_or(0);
        let paid_key = DataKey::Paid(round, member.clone());
        let already: bool = env.storage().persistent().get(&paid_key).unwrap_or(false);
        if already {
            return Err(Error::AlreadyPaid);
        }
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(Error::NotInitialized)?;
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        token::Client::new(&env, &token).transfer(
            &member,
            &env.current_contract_address(),
            &amount,
        );
        env.storage().persistent().set(&paid_key, &true);
        let ck = DataKey::PaidCount(round);
        let cnt: u32 = env.storage().persistent().get(&ck).unwrap_or(0);
        env.storage().persistent().set(&ck, &(cnt + 1));
        env.events()
            .publish((symbol_short!("contrib"), member), amount);
        Ok(())
    }

    /// Once every member has paid this round, the pot rotates to the next
    /// member in turn. Permissionless to trigger — the rule is on-chain.
    pub fn payout(env: Env) -> Result<Address, Error> {
        let members: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Members)
            .ok_or(Error::NotInitialized)?;
        let round: u32 = env.storage().instance().get(&DataKey::Round).unwrap_or(0);
        let cnt: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PaidCount(round))
            .unwrap_or(0);
        if cnt < members.len() {
            return Err(Error::RoundNotComplete);
        }
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(Error::NotInitialized)?;
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let recipient = members.get(round % members.len()).unwrap();
        let pot = amount * (members.len() as i128);
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &pot,
        );
        env.storage().instance().set(&DataKey::Round, &(round + 1));
        env.events()
            .publish((symbol_short!("payout"), recipient.clone()), pot);
        Ok(recipient)
    }

    pub fn round(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Round).unwrap_or(0)
    }

    pub fn members(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Members)
            .unwrap_or(Vec::new(&env))
    }

    pub fn recipient_of(env: Env, round: u32) -> Result<Address, Error> {
        let members: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Members)
            .ok_or(Error::NotInitialized)?;
        Ok(members.get(round % members.len()).unwrap())
    }
}

mod test;
