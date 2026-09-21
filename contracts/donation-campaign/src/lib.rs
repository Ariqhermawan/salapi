#![no_std]

//! D4: per-campaign escrow, immutable terms, proof-bound 2-of-3 approval.
//! No admin, upgrade, signer replacement, deadline extension, or batch refund.
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env,
    String, Vec,
};

const TTL_THRESHOLD: u32 = 100_000;
const TTL_EXTEND: u32 = 500_000;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Token,
    NextId,
    Campaign(u64),
    Contribution(u64, Address),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Config {
    pub creator: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub creator_cut_bps: u32,
    pub funding_deadline: u64,
    pub review_deadline: u64,
    pub approvers: Vec<Address>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum State {
    Funding,
    PendingProof,
    Refundable,
    Released,
    Closed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Proof {
    pub hash: BytesN<32>,
    pub url: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Campaign {
    pub id: u64,
    pub config: Config,
    pub title: String,
    pub state: State,
    pub total: i128,
    pub escrow: i128,
    pub proof_hash: Option<BytesN<32>>,
    pub proof_url: String,
    pub approvals: Vec<Address>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Contribution {
    pub amount: i128,
    pub refunded: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Missing = 1,
    InvalidApprovers = 2,
    InvalidDeadline = 3,
    InvalidConfig = 4,
    InvalidAmount = 5,
    FundingClosed = 6,
    InvalidState = 7,
    TooEarly = 8,
    ReviewClosed = 9,
    ProofAlreadySubmitted = 10,
    InvalidProof = 11,
    NotApprover = 12,
    AlreadyApproved = 13,
    BelowThreshold = 14,
    RefundUnavailable = 15,
    NothingToRefund = 16,
    Arithmetic = 17,
}

fn touch(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}
fn load(env: &Env, id: u64) -> Result<Campaign, Error> {
    touch(env);
    let key = DataKey::Campaign(id);
    let c = env.storage().persistent().get(&key).ok_or(Error::Missing)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(c)
}
fn save(env: &Env, c: &Campaign) {
    let key = DataKey::Campaign(c.id);
    env.storage().persistent().set(&key, c);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}
fn contribution(env: &Env, id: u64, donor: &Address) -> Contribution {
    let key = DataKey::Contribution(id, donor.clone());
    match env.storage().persistent().get(&key) {
        Some(value) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
            value
        }
        None => Contribution {
            amount: 0,
            refunded: false,
        },
    }
}
fn save_contribution(env: &Env, id: u64, donor: &Address, value: &Contribution) {
    let key = DataKey::Contribution(id, donor.clone());
    env.storage().persistent().set(&key, value);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

#[contract]
pub struct DonationCampaign;

#[contractimpl]
impl DonationCampaign {
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        touch(&env);
    }
    pub fn version() -> u32 {
        4
    }
    pub fn token(env: Env) -> Result<Address, Error> {
        touch(&env);
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::Missing)
    }
    pub fn clock(env: Env) -> u64 {
        env.ledger().timestamp()
    }

    pub fn create(env: Env, config: Config, title: String) -> Result<u64, Error> {
        config.creator.require_auth();
        if config.approvers.len() != 3
            || config.approvers.get(0) == config.approvers.get(1)
            || config.approvers.get(0) == config.approvers.get(2)
            || config.approvers.get(1) == config.approvers.get(2)
        {
            return Err(Error::InvalidApprovers);
        }
        if config.funding_deadline <= env.ledger().timestamp()
            || config.review_deadline <= config.funding_deadline
        {
            return Err(Error::InvalidDeadline);
        }
        if config.creator_cut_bps > 1000
            || config.token != Self::token(env.clone())?
            || title.is_empty()
            || title.len() > 120
            || config.creator == env.current_contract_address()
            || config.beneficiary == env.current_contract_address()
            || config.token == env.current_contract_address()
        {
            return Err(Error::InvalidConfig);
        }
        touch(&env);
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .ok_or(Error::Missing)?;
        let next = id.checked_add(1).ok_or(Error::Arithmetic)?;
        let c = Campaign {
            id,
            config,
            title,
            state: State::Funding,
            total: 0,
            escrow: 0,
            proof_hash: None,
            proof_url: String::from_str(&env, ""),
            approvals: Vec::new(&env),
        };
        save(&env, &c);
        env.storage().instance().set(&DataKey::NextId, &next);
        env.events().publish((symbol_short!("created"), id), c);
        Ok(id)
    }

    pub fn donate(env: Env, id: u64, donor: Address, amount: i128) -> Result<(), Error> {
        donor.require_auth();
        let mut c = load(&env, id)?;
        if c.state != State::Funding {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() >= c.config.funding_deadline {
            return Err(Error::FundingClosed);
        }
        if amount <= 0 || donor == env.current_contract_address() {
            return Err(Error::InvalidAmount);
        }
        let mut paid = contribution(&env, id, &donor);
        paid.amount = paid.amount.checked_add(amount).ok_or(Error::Arithmetic)?;
        c.total = c.total.checked_add(amount).ok_or(Error::Arithmetic)?;
        c.escrow = c.escrow.checked_add(amount).ok_or(Error::Arithmetic)?;
        save(&env, &c);
        save_contribution(&env, id, &donor, &paid);
        token::Client::new(&env, &c.config.token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );
        env.events()
            .publish((symbol_short!("donated"), id, donor), amount);
        Ok(())
    }

    pub fn submit_proof(env: Env, id: u64, proof: Proof) -> Result<(), Error> {
        let mut c = load(&env, id)?;
        c.config.creator.require_auth();
        if c.proof_hash.is_some() {
            return Err(Error::ProofAlreadySubmitted);
        }
        if c.state != State::Funding {
            return Err(Error::InvalidState);
        }
        let now = env.ledger().timestamp();
        if now < c.config.funding_deadline {
            return Err(Error::TooEarly);
        }
        if now >= c.config.review_deadline {
            return Err(Error::ReviewClosed);
        }
        if proof.hash == BytesN::from_array(&env, &[0; 32]) || proof.url.len() > 512 {
            return Err(Error::InvalidProof);
        }
        c.proof_hash = Some(proof.hash.clone());
        c.proof_url = proof.url.clone();
        c.state = State::PendingProof;
        save(&env, &c);
        env.events().publish((symbol_short!("proof"), id), proof);
        Ok(())
    }

    pub fn approve(env: Env, id: u64, who: Address, proof_hash: BytesN<32>) -> Result<(), Error> {
        let mut c = load(&env, id)?;
        if !c.config.approvers.contains(&who) {
            return Err(Error::NotApprover);
        }
        who.require_auth();
        if c.state != State::PendingProof {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() >= c.config.review_deadline {
            return Err(Error::ReviewClosed);
        }
        if c.proof_hash.as_ref().ok_or(Error::InvalidProof)? != &proof_hash {
            return Err(Error::InvalidProof);
        }
        if c.approvals.contains(&who) {
            return Err(Error::AlreadyApproved);
        }
        c.approvals.push_back(who.clone());
        save(&env, &c);
        env.events()
            .publish((symbol_short!("approved"), id, who), proof_hash);
        Ok(())
    }

    /// Anyone may execute an already-authorized fixed payout. Quorum can only
    /// form before review_deadline; timely quorum remains releasable afterwards.
    pub fn release(env: Env, id: u64) -> Result<(), Error> {
        let mut c = load(&env, id)?;
        if c.state != State::PendingProof {
            return Err(Error::InvalidState);
        }
        if c.approvals.len() < 2 {
            return Err(Error::BelowThreshold);
        }
        let bps = i128::from(c.config.creator_cut_bps);
        // Exact floor without overflowing total * bps.
        let creator = (c.escrow / 10_000) * bps + (c.escrow % 10_000) * bps / 10_000;
        let beneficiary = c.escrow - creator;
        c.state = State::Released;
        c.escrow = 0;
        save(&env, &c);
        let asset = token::Client::new(&env, &c.config.token);
        if creator > 0 {
            asset.transfer(&env.current_contract_address(), &c.config.creator, &creator);
        }
        if beneficiary > 0 {
            asset.transfer(
                &env.current_contract_address(),
                &c.config.beneficiary,
                &beneficiary,
            );
        }
        env.events()
            .publish((symbol_short!("released"), id), (creator, beneficiary));
        Ok(())
    }

    pub fn refund(env: Env, id: u64, donor: Address) -> Result<(), Error> {
        donor.require_auth();
        let mut c = load(&env, id)?;
        if c.state == State::Released || c.state == State::Closed {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() < c.config.review_deadline {
            return Err(Error::TooEarly);
        }
        if c.approvals.len() >= 2 {
            return Err(Error::RefundUnavailable);
        }
        let mut paid = contribution(&env, id, &donor);
        if paid.amount <= 0 || paid.refunded {
            return Err(Error::NothingToRefund);
        }
        c.escrow = c
            .escrow
            .checked_sub(paid.amount)
            .filter(|v| *v >= 0)
            .ok_or(Error::Arithmetic)?;
        c.state = if c.escrow == 0 {
            State::Closed
        } else {
            State::Refundable
        };
        paid.refunded = true;
        save(&env, &c);
        save_contribution(&env, id, &donor, &paid);
        token::Client::new(&env, &c.config.token).transfer(
            &env.current_contract_address(),
            &donor,
            &paid.amount,
        );
        env.events()
            .publish((symbol_short!("refunded"), id, donor), paid.amount);
        Ok(())
    }

    /// No donor exists to pull a refund from a campaign that received nothing.
    pub fn close_empty(env: Env, id: u64) -> Result<(), Error> {
        let mut c = load(&env, id)?;
        if c.state == State::Released || c.state == State::Closed {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() < c.config.review_deadline {
            return Err(Error::TooEarly);
        }
        if c.total != 0 || c.approvals.len() >= 2 {
            return Err(Error::RefundUnavailable);
        }
        c.state = State::Closed;
        save(&env, &c);
        env.events().publish((symbol_short!("closed"), id), ());
        Ok(())
    }

    pub fn campaign(env: Env, id: u64) -> Result<Campaign, Error> {
        load(&env, id)
    }
    pub fn contribution(env: Env, id: u64, donor: Address) -> Result<Contribution, Error> {
        load(&env, id)?;
        Ok(contribution(&env, id, &donor))
    }
    /// Bounded reviewer listing, not a discovery/search service.
    pub fn campaigns(env: Env, before: u64, limit: u32) -> Result<Vec<Campaign>, Error> {
        touch(&env);
        if limit == 0 || limit > 20 {
            return Err(Error::InvalidConfig);
        }
        let next: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .ok_or(Error::Missing)?;
        let mut cursor = if before == 0 { next } else { before.min(next) };
        let mut page = Vec::new(&env);
        while cursor > 1 && page.len() < limit {
            cursor -= 1;
            page.push_back(load(&env, cursor)?);
        }
        Ok(page)
    }
}

mod test;
