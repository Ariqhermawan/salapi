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

    // Round 1: pool=[host,m1,m2]; client picks idx 0 → host.
    set_ts(&env, first_kocok + 1);
    let w1 = a.kocok(&room_id, &host, &0u32);

    // Round 2: pool=[m1,m2]; idx 0 → m1.
    set_ts(&env, first_kocok + 7 * DAY + 1);
    let w2 = a.kocok(&room_id, &m1, &0u32);

    // Round 3: pool=[m2]; idx 0 → m2.
    set_ts(&env, first_kocok + 14 * DAY + 1);
    let w3 = a.kocok(&room_id, &m2, &0u32);

    // Three distinct winners. Distinctness is enforced by the unwon-pool
    // construction; the caller-supplied idx only picks *which* unwon
    // member wins, never violating the no-repeat invariant.
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
