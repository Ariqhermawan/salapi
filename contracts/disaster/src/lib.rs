#![no_std]

//! D3: immutable three-signer relief vault. All privileged actions require
//! proposals and two distinct authenticated approvals. No admin/upgrade path.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};

const DAY: u64 = 86_400;
const TTL_THRESHOLD: u32 = 100_000;
const TTL_EXTEND: u32 = 500_000;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Config,
    Paused,
    Epoch,
    NextId,
    Spends,
    Proposal(u64),
    Contribution(Address),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Config {
    pub signers: Vec<Address>,
    pub token: Address,
    pub cap_bps: u32,
    pub timelock_ledgers: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum Action {
    Disburse(Address, i128),
    Pause,
    Unpause,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Proposal {
    pub id: u64,
    pub proposer: Address,
    pub action: Action,
    pub approvals: Vec<Address>,
    pub ready_ledger: Option<u32>,
    pub executed: bool,
    pub epoch: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct Spend {
    pub timestamp: u64,
    pub amount: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Status {
    pub balance: i128,
    pub spent_24h: i128,
    pub cap: i128,
    pub allowance: i128,
    pub paused: bool,
    pub epoch: u64,
    pub ledger: u32,
    pub next_id: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    InvalidSigners = 2,
    InvalidConfig = 3,
    NotSigner = 4,
    InvalidAmount = 5,
    InvalidRecipient = 6,
    ProposalMissing = 7,
    AlreadyApproved = 8,
    AlreadyExecuted = 9,
    BelowThreshold = 10,
    Timelocked = 11,
    Paused = 12,
    OverCap = 13,
    InsufficientPool = 14,
    StaleControl = 15,
    AlreadyInState = 16,
    Arithmetic = 17,
    HistoryUnavailable = 18,
}

fn config(env: &Env) -> Result<Config, Error> {
    let value = env
        .storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(Error::NotInitialized)?;
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    Ok(value)
}

fn signer(env: &Env, who: &Address) -> Result<Config, Error> {
    let cfg = config(env)?;
    if !cfg.signers.contains(who) {
        return Err(Error::NotSigner);
    }
    who.require_auth();
    Ok(cfg)
}

fn proposal(env: &Env, id: u64) -> Result<Proposal, Error> {
    let key = DataKey::Proposal(id);
    let value = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::ProposalMissing)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(value)
}

fn save_proposal(env: &Env, value: &Proposal) {
    let key = DataKey::Proposal(value.id);
    env.storage().persistent().set(&key, value);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(true)
}
fn epoch(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::Epoch).unwrap_or(0)
}

fn cap(balance: i128, bps: u32) -> i128 {
    // Exact floor(balance * bps / 10000), without overflowing balance * bps.
    (balance / 10_000) * i128::from(bps) + (balance % 10_000) * i128::from(bps) / 10_000
}

fn recent_spends(env: &Env) -> Result<(Vec<Spend>, i128), Error> {
    // Never interpret missing/expired history as zero spending.
    let stored: Vec<Spend> = env
        .storage()
        .persistent()
        .get(&DataKey::Spends)
        .ok_or(Error::HistoryUnavailable)?;
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Spends, TTL_THRESHOLD, TTL_EXTEND);
    let now = env.ledger().timestamp();
    let mut recent = Vec::new(env);
    let mut total = 0i128;
    // ponytail: exact O(n) rolling window for low-volume Testnet governance.
    // Prune on execution; use an indexed queue if high throughput is needed.
    for spend in stored.iter() {
        // Window (now - 86400, now]: a payout expires at exactly 24h.
        if now.saturating_sub(spend.timestamp) < DAY {
            total = total.checked_add(spend.amount).ok_or(Error::Arithmetic)?;
            recent.push_back(spend);
        }
    }
    Ok((recent, total))
}

#[contract]
pub struct DisasterVault;

#[contractimpl]
impl DisasterVault {
    /// Runs atomically with deployment; no public initialize/front-running gap.
    pub fn __constructor(
        env: Env,
        signers: Vec<Address>,
        token: Address,
        cap_bps: u32,
        timelock_ledgers: u32,
    ) -> Result<(), Error> {
        if signers.len() != 3
            || signers.get(0) == signers.get(1)
            || signers.get(0) == signers.get(2)
            || signers.get(1) == signers.get(2)
        {
            return Err(Error::InvalidSigners);
        }
        if cap_bps == 0 || cap_bps > 10_000 || timelock_ledgers == 0 {
            return Err(Error::InvalidConfig);
        }
        let cfg = Config {
            signers,
            token,
            cap_bps,
            timelock_ledgers,
        };
        env.storage().instance().set(&DataKey::Config, &cfg);
        env.storage().instance().set(&DataKey::Paused, &true);
        env.storage().instance().set(&DataKey::Epoch, &0u64);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        env.storage()
            .persistent()
            .set(&DataKey::Spends, &Vec::<Spend>::new(&env));
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Spends, TTL_THRESHOLD, TTL_EXTEND);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        env.events().publish((symbol_short!("init"),), cfg);
        Ok(())
    }

    pub fn version() -> u32 {
        3
    }
    pub fn config(env: Env) -> Result<Config, Error> {
        config(&env)
    }

    /// Donations remain available while payouts are paused.
    pub fn contribute(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        let cfg = config(&env)?;
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let key = DataKey::Contribution(from.clone());
        let previous: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let contributed = previous.checked_add(amount).ok_or(Error::Arithmetic)?;
        token::Client::new(&env, &cfg.token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
        env.storage().persistent().set(&key, &contributed);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("contrib"), from), amount);
        Ok(())
    }

    /// Proposing does not implicitly approve: two approvals must be explicit.
    pub fn propose(env: Env, who: Address, action: Action) -> Result<u64, Error> {
        signer(&env, &who)?;
        match &action {
            Action::Disburse(to, amount) => {
                if *amount <= 0 {
                    return Err(Error::InvalidAmount);
                }
                if *to == env.current_contract_address() {
                    return Err(Error::InvalidRecipient);
                }
            }
            Action::Pause if paused(&env) => return Err(Error::AlreadyInState),
            Action::Unpause if !paused(&env) => return Err(Error::AlreadyInState),
            _ => (),
        }
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .ok_or(Error::NotInitialized)?;
        let next = id.checked_add(1).ok_or(Error::Arithmetic)?;
        let p = Proposal {
            id,
            proposer: who,
            action,
            approvals: Vec::new(&env),
            ready_ledger: None,
            executed: false,
            epoch: epoch(&env),
        };
        save_proposal(&env, &p);
        env.storage().instance().set(&DataKey::NextId, &next);
        env.events().publish((symbol_short!("propose"), id), p);
        Ok(id)
    }

    pub fn approve(env: Env, who: Address, id: u64) -> Result<(), Error> {
        let cfg = signer(&env, &who)?;
        let mut p = proposal(&env, id)?;
        if p.executed {
            return Err(Error::AlreadyExecuted);
        }
        if !matches!(p.action, Action::Disburse(..)) && p.epoch != epoch(&env) {
            return Err(Error::StaleControl);
        }
        if p.approvals.contains(&who) {
            return Err(Error::AlreadyApproved);
        }
        p.approvals.push_back(who.clone());
        if p.approvals.len() == 2 {
            let delay = if matches!(p.action, Action::Disburse(..)) {
                cfg.timelock_ledgers
            } else {
                0
            };
            p.ready_ledger = Some(
                env.ledger()
                    .sequence()
                    .checked_add(delay)
                    .ok_or(Error::Arithmetic)?,
            );
        }
        save_proposal(&env, &p);
        env.events()
            .publish((symbol_short!("approve"), id, who), p.ready_ledger);
        Ok(())
    }

    pub fn execute(env: Env, who: Address, id: u64) -> Result<(), Error> {
        let cfg = signer(&env, &who)?;
        let mut p = proposal(&env, id)?;
        if p.executed {
            return Err(Error::AlreadyExecuted);
        }
        if p.approvals.len() < 2 {
            return Err(Error::BelowThreshold);
        }
        let ready = p.ready_ledger.ok_or(Error::BelowThreshold)?;
        if env.ledger().sequence() < ready {
            return Err(Error::Timelocked);
        }
        match &p.action {
            Action::Disburse(to, amount) => {
                if paused(&env) {
                    return Err(Error::Paused);
                }
                let token = token::Client::new(&env, &cfg.token);
                let balance = token.balance(&env.current_contract_address());
                if *amount > balance {
                    return Err(Error::InsufficientPool);
                }
                let (mut recent, spent) = recent_spends(&env)?;
                if spent.checked_add(*amount).ok_or(Error::Arithmetic)? > cap(balance, cfg.cap_bps)
                {
                    return Err(Error::OverCap);
                }
                recent.push_back(Spend {
                    timestamp: env.ledger().timestamp(),
                    amount: *amount,
                });
                env.storage().persistent().set(&DataKey::Spends, &recent);
                token.transfer(&env.current_contract_address(), to, amount);
            }
            Action::Pause | Action::Unpause => {
                if p.epoch != epoch(&env) {
                    return Err(Error::StaleControl);
                }
                let next_paused = matches!(p.action, Action::Pause);
                if next_paused == paused(&env) {
                    return Err(Error::AlreadyInState);
                }
                let next_epoch = p.epoch.checked_add(1).ok_or(Error::Arithmetic)?;
                env.storage().instance().set(&DataKey::Epoch, &next_epoch);
                env.storage().instance().set(&DataKey::Paused, &next_paused);
                env.events()
                    .publish((symbol_short!("paused"), id), next_paused);
            }
        }
        p.executed = true;
        save_proposal(&env, &p);
        env.events()
            .publish((symbol_short!("execute"), id, who), p.action);
        Ok(())
    }

    pub fn proposal(env: Env, id: u64) -> Result<Proposal, Error> {
        config(&env)?;
        proposal(&env, id)
    }

    /// Descending page; before=0 starts from newest, at most 20 per request.
    pub fn proposals(env: Env, before: u64, limit: u32) -> Result<Vec<Proposal>, Error> {
        config(&env)?;
        if limit == 0 || limit > 20 {
            return Err(Error::InvalidConfig);
        }
        let next: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .ok_or(Error::NotInitialized)?;
        let mut cursor = if before == 0 { next } else { before.min(next) };
        let mut page = Vec::new(&env);
        while cursor > 1 && page.len() < limit {
            cursor -= 1;
            page.push_back(proposal(&env, cursor)?);
        }
        Ok(page)
    }

    pub fn status(env: Env) -> Result<Status, Error> {
        let cfg = config(&env)?;
        let balance = token::Client::new(&env, &cfg.token).balance(&env.current_contract_address());
        let (_, spent) = recent_spends(&env)?;
        let limit = cap(balance, cfg.cap_bps);
        Ok(Status {
            balance,
            spent_24h: spent,
            cap: limit,
            allowance: (limit - spent).max(0),
            paused: paused(&env),
            epoch: epoch(&env),
            ledger: env.ledger().sequence(),
            next_id: env
                .storage()
                .instance()
                .get(&DataKey::NextId)
                .ok_or(Error::NotInitialized)?,
        })
    }

    pub fn total(env: Env) -> Result<i128, Error> {
        let cfg = config(&env)?;
        Ok(token::Client::new(&env, &cfg.token).balance(&env.current_contract_address()))
    }

    pub fn contribution_of(env: Env, who: Address) -> Result<i128, Error> {
        config(&env)?;
        Ok(env
            .storage()
            .persistent()
            .get(&DataKey::Contribution(who))
            .unwrap_or(0))
    }

    pub fn is_disaster_active(env: Env) -> Result<bool, Error> {
        config(&env)?;
        Ok(!paused(&env))
    }
}

mod test;
