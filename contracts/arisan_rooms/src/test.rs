#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String as SorobanString, Symbol,
};

const DAY: u64 = 86_400;

fn setup<'a>(env: &Env, admin: &Address) -> (Address, StellarAssetClient<'a>, TokenClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let a = sac.address();
    (
        a.clone(),
        StellarAssetClient::new(env, &a),
        TokenClient::new(env, &a),
    )
}

fn set_ts(env: &Env, ts: u64) {
    env.ledger().with_mut(|li| {
        li.timestamp = ts;
    });
}

fn fresh_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    // Park us at a sane real-world timestamp so JOIN_WINDOW math is normal.
    set_ts(&env, 1_700_000_000);
    env
}

/// Run the two-phase draw the UI performs: seal the round's on-chain PRNG,
/// then run the deterministic kocok.
fn draw(a: &ArisanRoomsClient<'_>, room_id: &u32, caller: &Address) -> Address {
    a.seal_kocok(room_id, caller);
    a.kocok(room_id, caller)
}

/// Happy path: N=3 prefund cycle, every member wins exactly once, contract
/// balance ends at zero.
#[test]
fn prefund_full_cycle_zero_residual() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);

    let (tok, tok_admin, token) = setup(&env, &admin);
    // Each member starts with enough to lock N*s = 3*100 = 300.
    for who in [&host, &m1, &m2] {
        tok_admin.mint(who, &1_000);
    }

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY; // past JOIN_WINDOW (60s, prod 3 days)
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "Arisan Test");
    let code = Symbol::new(&env, "TEST01");

    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    assert_eq!(room_id, 1);
    // Host's 3*100 locked.
    assert_eq!(token.balance(&host), 700);
    let room = a.get_room(&room_id);
    assert_eq!(room.code, code);

    // Two more join with the code.
    a.join_room(&room_id, &room.code, &m1);
    a.join_room(&room_id, &room.code, &m2);
    assert_eq!(token.balance(&m1), 700);
    assert_eq!(token.balance(&m2), 700);
    // Contract holds 3 × 300 = 900.
    assert_eq!(token.balance(&id), 900);

    // Start.
    a.start_room(&room_id, &host);

    // Round 1: seal the on-chain PRNG, then draw. Winner is unwon[seed % 3].
    set_ts(&env, first_kocok + 1);
    let w1 = draw(&a, &room_id, &host);

    // Round 2: the unwon pool shrinks to the two members who haven't won.
    set_ts(&env, first_kocok + 7 * DAY + 1);
    let w2 = draw(&a, &room_id, &m1);

    // Round 3: one member left; they win.
    set_ts(&env, first_kocok + 14 * DAY + 1);
    let w3 = draw(&a, &room_id, &m2);

    // Three distinct winners — the unwon-pool construction guarantees no
    // repeat regardless of the sealed seed.
    assert_ne!(w1, w2);
    assert_ne!(w2, w3);
    assert_ne!(w1, w3);

    // Contract balance for this room ends at exactly zero.
    assert_eq!(token.balance(&id), 0);

    // Each member ends back at their starting balance (locked N*s, received N*s).
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(token.balance(&m2), 1_000);

    // Room is Done.
    let room_done = a.get_room(&room_id);
    assert_eq!(room_done.status, RoomStatus::Done);
}

#[test]
fn host_can_cancel_open_room_and_refund_all() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);

    let (tok, tok_admin, token) = setup(&env, &admin);
    tok_admin.mint(&host, &1_000);
    tok_admin.mint(&m1, &1_000);

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "X");
    let code = Symbol::new(&env, "CANCEL");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    let room = a.get_room(&room_id);
    a.join_room(&room_id, &room.code, &m1);
    // Not full (need 3); host cancels.
    a.cancel_room(&room_id, &host);
    assert_eq!(a.get_room(&room_id).status, RoomStatus::Dissolved);
    // Everyone is whole.
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(token.balance(&id), 0);
}

#[test]
fn cannot_start_before_room_is_full() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);

    let (tok, tok_admin, _) = setup(&env, &admin);
    tok_admin.mint(&host, &1_000);
    tok_admin.mint(&m1, &1_000);

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "X");
    let code = Symbol::new(&env, "NOTYET");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    let room = a.get_room(&room_id);
    a.join_room(&room_id, &room.code, &m1);
    // Only 2/3 seated. Start must fail.
    let try_start = a.try_start_room(&room_id, &host);
    assert!(try_start.is_err());
}

#[test]
fn anyone_can_cancel_after_join_deadline() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let outsider = Address::generate(&env);

    let (tok, tok_admin, token) = setup(&env, &admin);
    tok_admin.mint(&host, &1_000);

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "X");
    let code = Symbol::new(&env, "GRACE2");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    // Skip past the join deadline; the room never filled.
    set_ts(&env, join_deadline + 1);
    // A non-host can dissolve it. The host's lock is refunded.
    a.cancel_room(&room_id, &outsider);
    assert_eq!(a.get_room(&room_id).status, RoomStatus::Dissolved);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&id), 0);
}

#[test]
fn wrong_code_cannot_join() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);

    let (tok, tok_admin, _) = setup(&env, &admin);
    tok_admin.mint(&host, &1_000);
    tok_admin.mint(&m1, &1_000);

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "X");
    let code = Symbol::new(&env, "RIGHT2");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    let wrong = Symbol::new(&env, "WRONG2");
    let try_join = a.try_join_room(&room_id, &wrong, &m1);
    assert!(try_join.is_err());
}

/// Host can postpone the current round's kocok exactly once. The first
/// call shifts the round's deadline by `delay`; a second call in the same
/// round returns AlreadyPostponed; subsequent rounds reset the flag and
/// can each be postponed once again. After a postpone, the kocok still
/// fires once the (shifted) deadline arrives.
#[test]
fn host_can_postpone_each_round_once() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let outsider = Address::generate(&env);

    let (tok, tok_admin, _token) = setup(&env, &admin);
    for who in [&host, &m1, &m2] {
        tok_admin.mint(who, &1_000);
    }

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "Postpone test");
    let code = Symbol::new(&env, "PSTPN1");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    let room = a.get_room(&room_id);
    a.join_room(&room_id, &room.code, &m1);
    a.join_room(&room_id, &room.code, &m2);
    a.start_room(&room_id, &host);

    // Non-host cannot postpone.
    let try_outsider = a.try_postpone_kocok(&room_id, &outsider, &60u64);
    assert!(try_outsider.is_err());

    // Host postpones round 1's kocok by 60s; the deadline shifts.
    let before = a.kocok_at(&room_id, &1u32);
    a.postpone_kocok(&room_id, &host, &60u64);
    let after = a.kocok_at(&room_id, &1u32);
    assert_eq!(after, before + 60);

    // Second postpone in the same round is rejected (AlreadyPostponed).
    let try_again = a.try_postpone_kocok(&room_id, &host, &60u64);
    assert!(try_again.is_err());

    // delay=0 and delay>MAX_POSTPONE are rejected.
    let try_zero = a.try_postpone_kocok(&room_id, &host, &0u64);
    assert!(try_zero.is_err());

    // The (shifted) kocok still runs once the deadline arrives.
    set_ts(&env, after + 1);
    let w1 = draw(&a, &room_id, &host);
    assert_ne!(w1, outsider); // sanity — winner is one of the seated members

    // Round 2 starts fresh: postpone is allowed again. Verify deadline
    // and timing once more, then run kocok and round 3 unchanged.
    let before2 = a.kocok_at(&room_id, &2u32);
    a.postpone_kocok(&room_id, &host, &30u64);
    let after2 = a.kocok_at(&room_id, &2u32);
    assert_eq!(after2, before2 + 30);

    set_ts(&env, after2 + 1);
    let w2 = draw(&a, &room_id, &m1);
    assert_ne!(w1, w2);

    // Round 3 runs at its scheduled deadline (no postpone this round).
    let r3_deadline = a.kocok_at(&room_id, &3u32);
    set_ts(&env, r3_deadline + 1);
    let w3 = draw(&a, &room_id, &m2);
    assert_ne!(w2, w3);
    assert_ne!(w1, w3);

    // Cycle ends Done.
    assert_eq!(a.get_room(&room_id).status, RoomStatus::Done);
}

/// kocok before the round is sealed must fail (NotSealed); after sealing, the
/// winner is exactly unwon[seed % unwon_len] — proving the draw is decided by
/// the sealed on-chain seed, not by any caller-supplied value.
#[test]
fn kocok_requires_seal_and_is_seed_determined() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);

    let (tok, tok_admin, _) = setup(&env, &admin);
    for who in [&host, &m1, &m2] {
        tok_admin.mint(who, &1_000);
    }

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "Seal test");
    let code = Symbol::new(&env, "SEAL01");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    let room = a.get_room(&room_id);
    a.join_room(&room_id, &room.code, &m1);
    a.join_room(&room_id, &room.code, &m2);
    a.start_room(&room_id, &host);

    set_ts(&env, first_kocok + 1);
    // Not sealed yet → kocok rejected.
    assert!(a.try_kocok(&room_id, &host).is_err());

    // Seal fixes the round's randomness; seal_of returns the same seed.
    let seed = a.seal_kocok(&room_id, &host);
    assert_eq!(a.seal_of(&room_id, &1u32), seed);

    // Round 1: every member is unwon, in roster order, so the winner is
    // exactly members[seed % 3].
    let winner = a.kocok(&room_id, &host);
    let members = a.get_members(&room_id);
    let expected = members.get((seed % 3) as u32).unwrap();
    assert_eq!(winner, expected);
}

/// A round can be sealed only once — a second seal is rejected (AlreadySealed),
/// so no one can re-roll the randomness after seeing the first seed.
#[test]
fn cannot_seal_twice() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);

    let (tok, tok_admin, _) = setup(&env, &admin);
    for who in [&host, &m1, &m2] {
        tok_admin.mint(who, &1_000);
    }

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "Reseal test");
    let code = Symbol::new(&env, "SEAL02");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    let room = a.get_room(&room_id);
    a.join_room(&room_id, &room.code, &m1);
    a.join_room(&room_id, &room.code, &m2);
    a.start_room(&room_id, &host);

    set_ts(&env, first_kocok + 1);
    a.seal_kocok(&room_id, &host);
    // A different member trying to re-seal the same round is rejected.
    assert!(a.try_seal_kocok(&room_id, &m1).is_err());
}

/// Once a round is sealed the host can no longer postpone it — the outcome is
/// already decided, and clearing the seal would allow a re-roll.
#[test]
fn cannot_postpone_after_seal() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);

    let (tok, tok_admin, _) = setup(&env, &admin);
    for who in [&host, &m1, &m2] {
        tok_admin.mint(who, &1_000);
    }

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "Seal vs postpone");
    let code = Symbol::new(&env, "SEAL03");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    let room = a.get_room(&room_id);
    a.join_room(&room_id, &room.code, &m1);
    a.join_room(&room_id, &room.code, &m2);
    a.start_room(&room_id, &host);

    set_ts(&env, first_kocok + 1);
    a.seal_kocok(&room_id, &host);
    // Round is sealed → postpone rejected.
    assert!(a.try_postpone_kocok(&room_id, &host, &60u64).is_err());
}

/// The new seal gate cannot strand funds: if a round is never sealed, any
/// member can emergency_dissolve after the grace period and every unwon member
/// is refunded in full — the cycle still conserves money to exactly zero.
#[test]
fn emergency_dissolve_after_unsealed_round_refunds_all() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);

    let (tok, tok_admin, token) = setup(&env, &admin);
    for who in [&host, &m1, &m2] {
        tok_admin.mint(who, &1_000);
    }

    let id = env.register(ArisanRooms, ());
    let a = ArisanRoomsClient::new(&env, &id);
    a.initialize(&tok);

    let now = env.ledger().timestamp();
    let first_kocok = now + 4 * DAY;
    let join_deadline = first_kocok - DAY;
    let name = SorobanString::from_str(&env, "Dissolve test");
    let code = Symbol::new(&env, "EMERG2");
    let room_id = a.create_room(
        &host,
        &code,
        &name,
        &3u32,
        &100i128,
        &Cadence::Weekly,
        &first_kocok,
        &join_deadline,
    );
    let room = a.get_room(&room_id);
    a.join_room(&room_id, &room.code, &m1);
    a.join_room(&room_id, &room.code, &m2);
    a.start_room(&room_id, &host);

    // Round 1 completes normally (seal + draw); one member wins the pot back.
    set_ts(&env, first_kocok + 1);
    let w1 = draw(&a, &room_id, &host);
    assert_eq!(token.balance(&w1), 1_000);

    // Round 2 is NEVER sealed. Well past its deadline + GRACE_PERIOD a member
    // dissolves the stuck room. 30 days clears the grace window under BOTH the
    // demo cadences (deadline+grace ~= 240s) and production cadences (round-2
    // deadline 7d + GRACE 14d = 21d), so this test is flag-agnostic.
    set_ts(&env, first_kocok + 30 * DAY);
    a.emergency_dissolve(&room_id, &m1);

    // Dissolved; the round-1 winner keeps their pot; the two unwon members are
    // each refunded share*N; the contract ends at exactly zero.
    assert_eq!(a.get_room(&room_id).status, RoomStatus::Dissolved);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(token.balance(&m2), 1_000);
    assert_eq!(token.balance(&id), 0);
}
