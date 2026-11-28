#![no_std]

//! Recurring campaign v5: one pooled Testnet escrow, sequential stage targets,
//! and one proof-bound 2-of-3 approval/release for each stage.
//! D4 remains the immutable contract for one-time campaigns.
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env,
    String, Vec,
};

const TTL_THRESHOLD: u32 = 100_000;
const TTL_EXTEND: u32 = 500_000;
const MIN_STAGES: u32 = 2;
const MAX_STAGES: u32 = 6;

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
pub struct StageTerms {
    pub amount: i128,
    pub due_date: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Stage {
    pub amount: i128,
    pub due_date: u64,
    pub funded: i128,
    pub released: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum State {
    Funding,
    Scheduled,
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
    pub stages: Vec<Stage>,
    pub current_stage: u32,
    pub proof_hash: Option<BytesN<32>>,
    pub proof_url: String,
    pub approvals: Vec<Address>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Contribution {
    /// Historical contribution, including amounts already paid by released stages.
    pub amount: i128,
    /// Per-stage allocations, aligned with Campaign.stages.
    pub stages: Vec<i128>,
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
    InvalidStages = 18,
    StageNotFunded = 19,
}

fn touch(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

fn load(env: &Env, id: u64) -> Result<Campaign, Error> {
    touch(env);
    let key = DataKey::Campaign(id);
    let campaign = env.storage().persistent().get(&key).ok_or(Error::Missing)?;
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(campaign)
}

fn save(env: &Env, campaign: &Campaign) {
    let key = DataKey::Campaign(campaign.id);
    env.storage().persistent().set(&key, campaign);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn contribution(env: &Env, id: u64, donor: &Address, stage_count: u32) -> Contribution {
    let key = DataKey::Contribution(id, donor.clone());
    match env.storage().persistent().get(&key) {
        Some(value) => {
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
            value
        }
        None => {
            let mut stages = Vec::new(env);
            for _ in 0..stage_count {
                stages.push_back(0);
            }
            Contribution { amount: 0, stages, refunded: false }
        }
    }
}

fn save_contribution(env: &Env, id: u64, donor: &Address, value: &Contribution) {
    let key = DataKey::Contribution(id, donor.clone());
    env.storage().persistent().set(&key, value);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn goal(stages: &Vec<Stage>) -> Result<i128, Error> {
    let mut total = 0i128;
    for stage in stages.iter() {
        total = total.checked_add(stage.amount).ok_or(Error::Arithmetic)?;
    }
    Ok(total)
}

fn effective_state(env: &Env, campaign: &Campaign) -> State {
    match &campaign.state {
        State::Released => State::Released,
        State::Closed => State::Closed,
        State::Refundable => State::Refundable,
        _ if campaign.current_stage >= campaign.stages.len() => State::Released,
        _ => {
            let now = env.ledger().timestamp();
            if campaign.proof_hash.is_some() {
                if now >= campaign.config.review_deadline && campaign.approvals.len() < 2 {
                    State::Refundable
                } else {
                    State::PendingProof
                }
            } else if now >= campaign.config.review_deadline {
                State::Refundable
            } else if now < campaign.config.funding_deadline {
                State::Funding
            } else {
                State::Scheduled
            }
        }
    }
}

#[contract]
pub struct RecurringCampaign;

#[contractimpl]
impl RecurringCampaign {
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        touch(&env);
    }

    pub fn version() -> u32 {
        5
    }

    pub fn token(env: Env) -> Result<Address, Error> {
        touch(&env);
        env.storage().instance().get(&DataKey::Token).ok_or(Error::Missing)
    }

    pub fn clock(env: Env) -> u64 {
        env.ledger().timestamp()
    }

    pub fn create(env: Env, config: Config, title: String, terms: Vec<StageTerms>) -> Result<u64, Error> {
        config.creator.require_auth();
        if config.approvers.len() != 3
            || config.approvers.get(0) == config.approvers.get(1)
            || config.approvers.get(0) == config.approvers.get(2)
            || config.approvers.get(1) == config.approvers.get(2)
        {
            return Err(Error::InvalidApprovers);
        }
        let now = env.ledger().timestamp();
        if config.funding_deadline <= now || config.review_deadline <= config.funding_deadline {
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
        if terms.len() < MIN_STAGES || terms.len() > MAX_STAGES {
            return Err(Error::InvalidStages);
        }
        let mut stages = Vec::new(&env);
        let mut previous_due = 0u64;
        let mut total_goal = 0i128;
        for (index, term) in terms.iter().enumerate() {
            if term.amount <= 0 || term.due_date < config.funding_deadline
                || term.due_date >= config.review_deadline
                || index > 0 && term.due_date <= previous_due
            {
                return Err(Error::InvalidStages);
            }
            total_goal = total_goal.checked_add(term.amount).ok_or(Error::Arithmetic)?;
            previous_due = term.due_date;
            stages.push_back(Stage { amount: term.amount, due_date: term.due_date, funded: 0, released: false });
        }
        if total_goal <= 0 {
            return Err(Error::InvalidStages);
        }

        touch(&env);
        let id: u64 = env.storage().instance().get(&DataKey::NextId).ok_or(Error::Missing)?;
        let next = id.checked_add(1).ok_or(Error::Arithmetic)?;
        let campaign = Campaign {
            id,
            config,
            title,
            state: State::Funding,
            total: 0,
            escrow: 0,
            stages,
            current_stage: 0,
            proof_hash: None,
            proof_url: String::from_str(&env, ""),
            approvals: Vec::new(&env),
        };
        save(&env, &campaign);
        env.storage().instance().set(&DataKey::NextId, &next);
        env.events().publish((symbol_short!("created"), id), campaign);
        Ok(id)
    }

    pub fn donate(env: Env, id: u64, donor: Address, amount: i128) -> Result<(), Error> {
        donor.require_auth();
        let mut campaign = load(&env, id)?;
        let now = env.ledger().timestamp();
        if campaign.state != State::Funding || now >= campaign.config.funding_deadline {
            return Err(Error::FundingClosed);
        }
        if amount <= 0 || donor == env.current_contract_address() {
            return Err(Error::InvalidAmount);
        }
        let cap = goal(&campaign.stages)?;
        let total = campaign.total.checked_add(amount).ok_or(Error::Arithmetic)?;
        if total > cap {
            return Err(Error::InvalidAmount);
        }

        let mut paid = contribution(&env, id, &donor, campaign.stages.len());
        if paid.refunded || paid.stages.len() != campaign.stages.len() {
            return Err(Error::InvalidState);
        }
        let mut remaining = amount;
        for index in 0..campaign.stages.len() {
            if remaining == 0 {
                break;
            }
            let mut stage = campaign.stages.get(index).ok_or(Error::InvalidStages)?;
            let capacity = stage.amount.checked_sub(stage.funded).ok_or(Error::Arithmetic)?;
            let allocation = if remaining < capacity { remaining } else { capacity };
            if allocation > 0 {
                stage.funded = stage.funded.checked_add(allocation).ok_or(Error::Arithmetic)?;
                let donor_stage = paid.stages.get(index).ok_or(Error::InvalidStages)?;
                paid.stages.set(index, donor_stage.checked_add(allocation).ok_or(Error::Arithmetic)?);
                campaign.stages.set(index, stage);
                remaining = remaining.checked_sub(allocation).ok_or(Error::Arithmetic)?;
            }
        }
        if remaining != 0 {
            return Err(Error::InvalidAmount);
        }
        paid.amount = paid.amount.checked_add(amount).ok_or(Error::Arithmetic)?;
        campaign.total = total;
        campaign.escrow = campaign.escrow.checked_add(amount).ok_or(Error::Arithmetic)?;
        save(&env, &campaign);
        save_contribution(&env, id, &donor, &paid);
        token::Client::new(&env, &campaign.config.token).transfer(&donor, &env.current_contract_address(), &amount);
        env.events().publish((symbol_short!("donated"), id, donor), amount);
        Ok(())
    }

    pub fn submit_proof(env: Env, id: u64, proof: Proof) -> Result<(), Error> {
        let mut campaign = load(&env, id)?;
        campaign.config.creator.require_auth();
        let now = env.ledger().timestamp();
        if campaign.proof_hash.is_some() {
            return Err(Error::ProofAlreadySubmitted);
        }
        if now < campaign.config.funding_deadline {
            return Err(Error::TooEarly);
        }
        if now >= campaign.config.review_deadline {
            return Err(Error::ReviewClosed);
        }
        if effective_state(&env, &campaign) != State::Scheduled {
            return Err(Error::InvalidState);
        }
        let stage = campaign.stages.get(campaign.current_stage).ok_or(Error::InvalidStages)?;
        if now < stage.due_date {
            return Err(Error::TooEarly);
        }
        if stage.funded != stage.amount {
            return Err(Error::StageNotFunded);
        }
        if proof.hash == BytesN::from_array(&env, &[0; 32]) || proof.url.len() > 512 {
            return Err(Error::InvalidProof);
        }
        campaign.proof_hash = Some(proof.hash.clone());
        campaign.proof_url = proof.url.clone();
        campaign.approvals = Vec::new(&env);
        campaign.state = State::PendingProof;
        save(&env, &campaign);
        env.events().publish((symbol_short!("proof"), id, campaign.current_stage), proof);
        Ok(())
    }

    pub fn approve(env: Env, id: u64, who: Address, proof_hash: BytesN<32>) -> Result<(), Error> {
        let mut campaign = load(&env, id)?;
        if !campaign.config.approvers.contains(&who) {
            return Err(Error::NotApprover);
        }
        who.require_auth();
        if effective_state(&env, &campaign) != State::PendingProof {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() >= campaign.config.review_deadline {
            return Err(Error::ReviewClosed);
        }
        if campaign.proof_hash.as_ref().ok_or(Error::InvalidProof)? != &proof_hash {
            return Err(Error::InvalidProof);
        }
        if campaign.approvals.contains(&who) {
            return Err(Error::AlreadyApproved);
        }
        campaign.approvals.push_back(who.clone());
        save(&env, &campaign);
        env.events().publish((symbol_short!("approved"), id, campaign.current_stage, who), proof_hash);
        Ok(())
    }

    /// Any caller may execute a stage payout after a timely 2-of-3 quorum.
    pub fn release(env: Env, id: u64) -> Result<(), Error> {
        let mut campaign = load(&env, id)?;
        if effective_state(&env, &campaign) != State::PendingProof || campaign.approvals.len() < 2 {
            return Err(Error::BelowThreshold);
        }
        let stage = campaign.stages.get(campaign.current_stage).ok_or(Error::InvalidStages)?;
        if stage.funded != stage.amount || stage.released || campaign.escrow < stage.amount {
            return Err(Error::StageNotFunded);
        }
        let amount = stage.amount;
        let bps = i128::from(campaign.config.creator_cut_bps);
        let creator = (amount / 10_000) * bps + (amount % 10_000) * bps / 10_000;
        let beneficiary = amount.checked_sub(creator).ok_or(Error::Arithmetic)?;
        let stage_index = campaign.current_stage;
        let mut released_stage = stage;
        released_stage.released = true;
        campaign.stages.set(stage_index, released_stage);
        campaign.current_stage = campaign.current_stage.checked_add(1).ok_or(Error::Arithmetic)?;
        campaign.escrow = campaign.escrow.checked_sub(amount).ok_or(Error::Arithmetic)?;
        campaign.proof_hash = None;
        campaign.proof_url = String::from_str(&env, "");
        campaign.approvals = Vec::new(&env);
        campaign.state = if campaign.current_stage >= campaign.stages.len() {
            State::Released
        } else if env.ledger().timestamp() >= campaign.config.review_deadline {
            State::Refundable
        } else {
            State::Scheduled
        };
        save(&env, &campaign);
        let asset = token::Client::new(&env, &campaign.config.token);
        if creator > 0 {
            asset.transfer(&env.current_contract_address(), &campaign.config.creator, &creator);
        }
        if beneficiary > 0 {
            asset.transfer(&env.current_contract_address(), &campaign.config.beneficiary, &beneficiary);
        }
        env.events().publish((symbol_short!("released"), id, stage_index), (creator, beneficiary));
        Ok(())
    }

    /// Return only the caller's allocations for stages that have not released.
    pub fn refund(env: Env, id: u64, donor: Address) -> Result<(), Error> {
        donor.require_auth();
        let mut campaign = load(&env, id)?;
        if campaign.state == State::Released || campaign.state == State::Closed {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() < campaign.config.review_deadline {
            return Err(Error::TooEarly);
        }
        if effective_state(&env, &campaign) != State::Refundable {
            return Err(Error::RefundUnavailable);
        }
        let mut paid = contribution(&env, id, &donor, campaign.stages.len());
        if paid.amount <= 0 || paid.refunded {
            return Err(Error::NothingToRefund);
        }
        let mut refundable = 0i128;
        for index in campaign.current_stage..paid.stages.len() {
            refundable = refundable.checked_add(paid.stages.get(index).ok_or(Error::InvalidStages)?).ok_or(Error::Arithmetic)?;
        }
        if refundable <= 0 {
            return Err(Error::NothingToRefund);
        }
        campaign.escrow = campaign.escrow.checked_sub(refundable).filter(|value| *value >= 0).ok_or(Error::Arithmetic)?;
        paid.refunded = true;
        campaign.state = if campaign.escrow == 0 { State::Closed } else { State::Refundable };
        save(&env, &campaign);
        save_contribution(&env, id, &donor, &paid);
        token::Client::new(&env, &campaign.config.token).transfer(&env.current_contract_address(), &donor, &refundable);
        env.events().publish((symbol_short!("refunded"), id, donor), refundable);
        Ok(())
    }

    pub fn close_empty(env: Env, id: u64) -> Result<(), Error> {
        let mut campaign = load(&env, id)?;
        if campaign.state == State::Released || campaign.state == State::Closed {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() < campaign.config.review_deadline {
            return Err(Error::TooEarly);
        }
        if campaign.total != 0 || effective_state(&env, &campaign) != State::Refundable {
            return Err(Error::RefundUnavailable);
        }
        campaign.state = State::Closed;
        save(&env, &campaign);
        env.events().publish((symbol_short!("closed"), id), ());
        Ok(())
    }

    pub fn campaign(env: Env, id: u64) -> Result<Campaign, Error> {
        let mut campaign = load(&env, id)?;
        campaign.state = effective_state(&env, &campaign);
        Ok(campaign)
    }

    pub fn contribution(env: Env, id: u64, donor: Address) -> Result<Contribution, Error> {
        let campaign = load(&env, id)?;
        Ok(contribution(&env, id, &donor, campaign.stages.len()))
    }

    pub fn campaigns(env: Env, before: u64, limit: u32) -> Result<Vec<Campaign>, Error> {
        touch(&env);
        if limit == 0 || limit > 20 {
            return Err(Error::InvalidConfig);
        }
        let next: u64 = env.storage().instance().get(&DataKey::NextId).ok_or(Error::Missing)?;
        let mut cursor = if before == 0 { next } else { before.min(next) };
        let mut page = Vec::new(&env);
        while cursor > 1 && page.len() < limit {
            cursor -= 1;
            let mut campaign = load(&env, cursor)?;
            campaign.state = effective_state(&env, &campaign);
            page.push_back(campaign);
        }
        Ok(page)
    }
}

mod test;
