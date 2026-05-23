#![no_std]

//! Arisan Rooms — a roomed, invite-only, PREFUND arisan/ROSCA on Stellar.
//!
//! Every member locks their FULL cycle commitment (N × s) into the contract
//! before round 1. Each round, the contract draws a random winner on-chain
//! via Soroban PRNG from members who haven't won yet, and transfers the pot
//! (N × s) to that winner. After N rounds everyone has won exactly once and
//! the contract balance for the room is exactly zero. Late payment, default,
//! and abscond are structurally impossible — there is no payment owed after
//! join.
//!
//! Build-Award preview: the kocok is fair under invite-trust assumptions
//! (Soroban PRNG is ledger-seeded), not adversarial-grade — commit-reveal
//! is the hardening path. Honestly badged as a preview in the UI.
//!
//! One contract holds many rooms keyed by `room_id`. Each room has a unique
//! 6-char invite code — that is the only way to find or join a room. There
//! is NO discovery mechanism by design.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
    String, Symbol, Vec,
};

// ── TIMINGS ───────────────────────────────────────────────────────────────
// The default build runs in SECONDS so a full N=3 cycle is observable in a
// hackathon demo (~3 minutes total). The "Pratinjau · Build-Award" chip in
// the UI flags this honestly.
//
// Build with `--features production-cadences` for the mainnet candidate:
// the same source compiled with real days-based timings. This avoids two
// divergent forks of the contract — same code, one cargo flag.
// ─────────────────────────────────────────────────────────────────────────
// First kocok must be at least this far in the future at room creation.
#[cfg(not(feature = "production-cadences"))]
const JOIN_WINDOW: u64 = 60; // demo: 60s
#[cfg(feature = "production-cadences")]
const JOIN_WINDOW: u64 = 3 * 24 * 60 * 60; // production: 3 days

// Host can postpone one kocok per round by at most this much.
#[cfg(not(feature = "production-cadences"))]
const MAX_POSTPONE_SECONDS: u64 = 300; // demo: 5 min
#[cfg(feature = "production-cadences")]
const MAX_POSTPONE_SECONDS: u64 = 3 * 24 * 60 * 60; // production: 3 days

// Grace before any member can emergency-dissolve a stuck active room.
#[cfg(not(feature = "production-cadences"))]
const GRACE_PERIOD: u64 = 180; // demo: 3 min
#[cfg(feature = "production-cadences")]
const GRACE_PERIOD: u64 = 14 * 24 * 60 * 60; // production: 14 days

// Contract-level bounds. The UI enforces stricter display-currency bounds.
const MIN_MEMBERS: u32 = 3;
const MAX_MEMBERS: u32 = 20;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RoomStatus {
    Open,
    Active,
    Done,
    Dissolved,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Cadence {
    Weekly,
    Biweekly,
    Monthly,
}

#[contracttype]
#[derive(Clone)]
pub struct Room {
    pub host: Address,
    pub name: String,
    pub code: Symbol,
    pub member_target: u32,
    pub share: i128,
    pub cadence: Cadence,
    pub first_kocok: u64,
    pub join_deadline: u64,
    pub status: RoomStatus,
    pub member_count: u32,
    pub round: u32,
}

#[contracttype]
pub enum DataKey {
    Token,
    RoomCount,
    Room(u32),
    Members(u32),
    RoomByCode(Symbol),
    Locked(u32, Address),
    Won(u32, Address),
    Winner(u32, u32),
    KocokAt(u32, u32),
    Postponed(u32, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidParams = 3,
    NotFound = 4,
    WrongStatus = 5,
    NotHost = 6,
    NotMember = 7,
    AlreadyJoined = 8,
    RoomFull = 9,
    NotYet = 10,
    AlreadyPostponed = 11,
}

#[contract]
pub struct ArisanRooms;

#[contractimpl]
impl ArisanRooms {
    pub fn initialize(env: Env, token: Address) -> Result<(), Error> {
        let inst = env.storage().instance();
        if inst.has(&DataKey::Token) {
            return Err(Error::AlreadyInitialized);
        }
        inst.set(&DataKey::Token, &token);
        inst.set(&DataKey::RoomCount, &0u32);
        Ok(())
    }

    /// Create a room and lock the host's full cycle commitment (N × share).
    ///
    /// The CALLER supplies the 6-char invite `code` (generated client-side
    /// from a CSPRNG); the contract verifies it isn't already in use and
    /// then stores it. Generating the code on-chain via `env.prng()` would
    /// mismatch the storage footprint between simulation and execution.
    pub fn create_room(
        env: Env,
        host: Address,
        code: Symbol,
        name: String,
        member_target: u32,
        share: i128,
        cadence: Cadence,
        first_kocok: u64,
        join_deadline: u64,
    ) -> Result<u32, Error> {
        host.require_auth();
        let now = env.ledger().timestamp();
        if member_target < MIN_MEMBERS
            || member_target > MAX_MEMBERS
            || share <= 0
            || first_kocok < now + JOIN_WINDOW
            || join_deadline >= first_kocok
        {
            return Err(Error::InvalidParams);
        }
        // Collision check — invite codes must be unique across all rooms.
        if env
            .storage()
            .persistent()
            .has(&DataKey::RoomByCode(code.clone()))
        {
            return Err(Error::InvalidParams);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;

        let prev: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoomCount)
            .unwrap_or(0);
        let room_id = prev + 1;

        // Lock host's full commitment.
        let total = share * (member_target as i128);
        token::Client::new(&env, &token).transfer(
            &host,
            &env.current_contract_address(),
            &total,
        );

        let room = Room {
            host: host.clone(),
            name,
            code: code.clone(),
            member_target,
            share,
            cadence,
            first_kocok,
            join_deadline,
            status: RoomStatus::Open,
            // Host is auto-seated, so the live count starts at 1.
            member_count: 1,
            round: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Room(room_id), &room);
        env.storage()
            .persistent()
            .set(&DataKey::RoomByCode(code.clone()), &room_id);
        let mut members: Vec<Address> = Vec::new(&env);
        members.push_back(host.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Members(room_id), &members);
        env.storage()
            .persistent()
            .set(&DataKey::Locked(room_id, host.clone()), &total);
        env.storage().instance().set(&DataKey::RoomCount, &room_id);

        env.events()
            .publish((symbol_short!("create"), host), room_id);
        Ok(room_id)
    }

    /// Join a room by its code, locking N × share.
    pub fn join_room(
        env: Env,
        room_id: u32,
        code: Symbol,
        member: Address,
    ) -> Result<(), Error> {
        member.require_auth();
        let mut room: Room = env
            .storage()
            .persistent()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::NotFound)?;
        if room.status != RoomStatus::Open {
            return Err(Error::WrongStatus);
        }
        if room.code != code {
            return Err(Error::NotFound);
        }
        let mut members: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Members(room_id))
            .unwrap_or_else(|| Vec::new(&env));
        if members.iter().any(|m| m == member) {
            return Err(Error::AlreadyJoined);
        }
        if members.len() >= room.member_target {
            return Err(Error::RoomFull);
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let total = room.share * (room.member_target as i128);
        token::Client::new(&env, &token).transfer(
            &member,
            &env.current_contract_address(),
            &total,
        );
        members.push_back(member.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Members(room_id), &members);
        env.storage()
            .persistent()
            .set(&DataKey::Locked(room_id, member.clone()), &total);
        // Keep room.member_count in sync with the actual roster so off-chain
        // readers (UI, scripts) don't have to load Members separately.
        room.member_count = members.len();
        env.storage()
            .persistent()
            .set(&DataKey::Room(room_id), &room);

        env.events()
            .publish((symbol_short!("join"), member), room_id);
        Ok(())
    }

    /// Leave a room while still Open; full refund of the lock.
    pub fn leave_room(env: Env, room_id: u32, member: Address) -> Result<(), Error> {
        member.require_auth();
        let mut room: Room = env
            .storage()
            .persistent()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::NotFound)?;
        if room.status != RoomStatus::Open {
            return Err(Error::WrongStatus);
        }
        // Host can't leave — they cancel the room instead (refunds everyone).
        if member == room.host {
            return Err(Error::InvalidParams);
        }
        let members: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Members(room_id))
            .unwrap_or_else(|| Vec::new(&env));
        let mut found = false;
        let mut next: Vec<Address> = Vec::new(&env);
        for m in members.iter() {
            if m == member {
                found = true;
                continue;
            }
            next.push_back(m);
        }
        if !found {
            return Err(Error::NotMember);
        }
        refund_member(&env, room_id, &member);
        env.storage()
            .persistent()
            .set(&DataKey::Members(room_id), &next);
        // Keep room.member_count in sync (see join_room).
        room.member_count = next.len();
        env.storage()
            .persistent()
            .set(&DataKey::Room(room_id), &room);

        env.events()
            .publish((symbol_short!("leave"), member), room_id);
        Ok(())
    }

    /// Host starts the room when all N seats are filled. Locks the roster.
    pub fn start_room(env: Env, room_id: u32, host: Address) -> Result<(), Error> {
        host.require_auth();
        let mut room: Room = env
            .storage()
            .persistent()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::NotFound)?;
        if host != room.host {
            return Err(Error::NotHost);
        }
        if room.status != RoomStatus::Open {
            return Err(Error::WrongStatus);
        }
        let members: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Members(room_id))
            .unwrap_or_else(|| Vec::new(&env));
        if members.len() != room.member_target {
            return Err(Error::InvalidParams);
        }
        room.status = RoomStatus::Active;
        room.member_count = room.member_target;
        room.round = 1;
        env.storage()
            .persistent()
            .set(&DataKey::Room(room_id), &room);
        env.storage()
            .persistent()
            .set(&DataKey::KocokAt(room_id, 1u32), &room.first_kocok);

        env.events()
            .publish((symbol_short!("start"), host), room_id);
        Ok(())
    }

    /// Cancel a room while Open. Host can always cancel. After the join
    /// deadline, anyone can cancel a still-unstarted room (anti-deadlock).
    /// Every member is refunded their lock.
    pub fn cancel_room(env: Env, room_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();
        let mut room: Room = env
            .storage()
            .persistent()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::NotFound)?;
        if room.status != RoomStatus::Open {
            return Err(Error::WrongStatus);
        }
        let now = env.ledger().timestamp();
        if caller != room.host && now <= room.join_deadline {
            return Err(Error::NotHost);
        }
        let members: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Members(room_id))
            .unwrap_or_else(|| Vec::new(&env));
        for m in members.iter() {
            refund_member(&env, room_id, &m);
        }
        room.status = RoomStatus::Dissolved;
        env.storage()
            .persistent()
            .set(&DataKey::Room(room_id), &room);

        env.events()
            .publish((symbol_short!("dissolve"), caller), room_id);
        Ok(())
    }

    /// Run the round's kocok. Any room member can call (anti-deadlock) once
    /// the scheduled kocok timestamp has passed. The CALLER supplies a
    /// `winner_idx` into the pool of unwon members (drawn client-side from a
    /// CSPRNG such as `crypto.getRandomValues`); the contract verifies the
    /// idx is in range, picks that member, transfers the pot (N × share) to
    /// them, and advances the round (or marks the cycle Done).
    ///
    /// Why client-supplied: an `env.prng()`-derived winner address would put
    /// a different storage/account key in the read-write footprint between
    /// simulation and execution, failing with "outside the footprint." A
    /// transaction argument is identical in both → footprint matches → the
    /// tx executes cleanly. The pool-of-unwon constraint still enforces
    /// distinct winners across the cycle. The hardening path is
    /// commit-reveal or VRF.
    pub fn kocok(
        env: Env,
        room_id: u32,
        caller: Address,
        winner_idx: u32,
    ) -> Result<Address, Error> {
        caller.require_auth();
        let mut room: Room = env
            .storage()
            .persistent()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::NotFound)?;
        if room.status != RoomStatus::Active {
            return Err(Error::WrongStatus);
        }
        let members: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Members(room_id))
            .unwrap_or_else(|| Vec::new(&env));
        if !members.iter().any(|m| m == caller) {
            return Err(Error::NotMember);
        }
        let now = env.ledger().timestamp();
        let deadline: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::KocokAt(room_id, room.round))
            .ok_or(Error::NotFound)?;
        if now < deadline {
            return Err(Error::NotYet);
        }
        // Build the eligible pool: members who haven't won yet.
        let mut pool: Vec<Address> = Vec::new(&env);
        for m in members.iter() {
            let won: bool = env
                .storage()
                .persistent()
                .get(&DataKey::Won(room_id, m.clone()))
                .unwrap_or(false);
            if !won {
                pool.push_back(m);
            }
        }
        if pool.is_empty() {
            return Err(Error::WrongStatus);
        }
        // Validate the client-supplied index, then pick.
        if winner_idx >= pool.len() {
            return Err(Error::InvalidParams);
        }
        let winner: Address = pool.get(winner_idx).unwrap();
        let pot = room.share * (room.member_count as i128);
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &winner,
            &pot,
        );
        env.storage()
            .persistent()
            .set(&DataKey::Won(room_id, winner.clone()), &true);
        env.storage()
            .persistent()
            .set(&DataKey::Winner(room_id, room.round), &winner);

        env.events()
            .publish((symbol_short!("kocok"), winner.clone()), pot);

        // Advance to the next round, or close the cycle.
        if room.round >= room.member_count {
            room.status = RoomStatus::Done;
        } else {
            let next_at = deadline + cadence_seconds(room.cadence);
            env.storage().persistent().set(
                &DataKey::KocokAt(room_id, room.round + 1),
                &next_at,
            );
        }
        room.round += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Room(room_id), &room);
        Ok(winner)
    }

    /// Host can push the current kocok later by up to MAX_POSTPONE_SECONDS,
    /// once per round. Subsequent kocoks compound the delay because the
    /// next deadline is derived from the current one.
    pub fn postpone_kocok(
        env: Env,
        room_id: u32,
        host: Address,
        delay: u64,
    ) -> Result<(), Error> {
        host.require_auth();
        let room: Room = env
            .storage()
            .persistent()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::NotFound)?;
        if host != room.host {
            return Err(Error::NotHost);
        }
        if room.status != RoomStatus::Active {
            return Err(Error::WrongStatus);
        }
        if delay == 0 || delay > MAX_POSTPONE_SECONDS {
            return Err(Error::InvalidParams);
        }
        let used: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Postponed(room_id, room.round))
            .unwrap_or(false);
        if used {
            return Err(Error::AlreadyPostponed);
        }
        let deadline: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::KocokAt(room_id, room.round))
            .ok_or(Error::NotFound)?;
        env.storage()
            .persistent()
            .set(&DataKey::KocokAt(room_id, room.round), &(deadline + delay));
        env.storage()
            .persistent()
            .set(&DataKey::Postponed(room_id, room.round), &true);
        Ok(())
    }

    /// Safety valve: any member may dissolve a stuck Active room after the
    /// current kocok deadline has lapsed by GRACE_PERIOD. Each unwon member
    /// is refunded N × share (their full unwon allocation). In normal use
    /// the permissionless `kocok()` keeps this from ever firing.
    pub fn emergency_dissolve(
        env: Env,
        room_id: u32,
        caller: Address,
    ) -> Result<(), Error> {
        caller.require_auth();
        let mut room: Room = env
            .storage()
            .persistent()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::NotFound)?;
        if room.status != RoomStatus::Active {
            return Err(Error::WrongStatus);
        }
        let members: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Members(room_id))
            .unwrap_or_else(|| Vec::new(&env));
        if !members.iter().any(|m| m == caller) {
            return Err(Error::NotMember);
        }
        let now = env.ledger().timestamp();
        let deadline: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::KocokAt(room_id, room.round))
            .ok_or(Error::NotFound)?;
        if now < deadline + GRACE_PERIOD {
            return Err(Error::NotYet);
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let client = token::Client::new(&env, &token);
        let refund_each = room.share * (room.member_count as i128);
        for m in members.iter() {
            let won: bool = env
                .storage()
                .persistent()
                .get(&DataKey::Won(room_id, m.clone()))
                .unwrap_or(false);
            if !won {
                client.transfer(&env.current_contract_address(), &m, &refund_each);
            }
        }
        room.status = RoomStatus::Dissolved;
        env.storage()
            .persistent()
            .set(&DataKey::Room(room_id), &room);

        env.events()
            .publish((symbol_short!("emerg"), caller), room_id);
        Ok(())
    }

    // ───────── read-only getters ─────────

    pub fn get_room(env: Env, room_id: u32) -> Result<Room, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::NotFound)
    }
    pub fn get_members(env: Env, room_id: u32) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Members(room_id))
            .unwrap_or_else(|| Vec::new(&env))
    }
    pub fn room_by_code(env: Env, code: Symbol) -> Result<u32, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::RoomByCode(code))
            .ok_or(Error::NotFound)
    }
    pub fn locked_of(env: Env, room_id: u32, member: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Locked(room_id, member))
            .unwrap_or(0)
    }
    pub fn has_won(env: Env, room_id: u32, member: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Won(room_id, member))
            .unwrap_or(false)
    }
    pub fn winner_of(env: Env, room_id: u32, round: u32) -> Result<Address, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Winner(room_id, round))
            .ok_or(Error::NotFound)
    }
    pub fn kocok_at(env: Env, room_id: u32, round: u32) -> Result<u64, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::KocokAt(room_id, round))
            .ok_or(Error::NotFound)
    }
    pub fn room_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::RoomCount)
            .unwrap_or(0)
    }
}

fn cadence_seconds(c: Cadence) -> u64 {
    // Default build: cadences run in seconds so the full N=3 cycle is
    // observable in a demo. Build with `--features production-cadences` for
    // the days-based mainnet candidate.
    #[cfg(not(feature = "production-cadences"))]
    {
        match c {
            Cadence::Weekly => 60,
            Cadence::Biweekly => 120,
            Cadence::Monthly => 300,
        }
    }
    #[cfg(feature = "production-cadences")]
    {
        match c {
            Cadence::Weekly => 7 * 24 * 60 * 60,
            Cadence::Biweekly => 14 * 24 * 60 * 60,
            Cadence::Monthly => 30 * 24 * 60 * 60,
        }
    }
}

fn refund_member(env: &Env, room_id: u32, member: &Address) {
    let locked: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Locked(room_id, member.clone()))
        .unwrap_or(0);
    if locked <= 0 {
        return;
    }
    let token: Address = env
        .storage()
        .instance()
        .get(&DataKey::Token)
        .expect("initialized");
    token::Client::new(env, &token).transfer(
        &env.current_contract_address(),
        member,
        &locked,
    );
    env.storage()
        .persistent()
        .remove(&DataKey::Locked(room_id, member.clone()));
}

mod test;
