#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, EnvTestConfig, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String as SorobanString, Symbol,
};

const DAY: u64 = 86_400;

fn setup<'a>(env: &Env, admin: &Address) -> (Address, StellarAssetClient<'a>, TokenClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let address = sac.address();
    (
        address.clone(),
        StellarAssetClient::new(env, &address),
        TokenClient::new(env, &address),
    )
}

fn set_ts(env: &Env, ts: u64) {
    env.ledger().with_mut(|li| li.timestamp = ts);
}

fn fresh_env() -> Env {
    // These tests assert behavior directly; multi-thousand-line auto-generated
    // ledger snapshots duplicate that evidence and make reviews unnecessarily
    // noisy.
    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    env.mock_all_auths();
    set_ts(&env, 1_700_000_000);
    env
}

fn active_room(
    env: &Env,
    host: &Address,
    m1: &Address,
    m2: &Address,
    code: &str,
) -> (Address, Address, u32, u64) {
    let admin = Address::generate(env);
    let (token_id, token_admin, _) = setup(env, &admin);
    for member in [host, m1, m2] {
        token_admin.mint(member, &1_000);
    }

    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(env, &contract_id);
    client.initialize(&token_id);
    let first_commit_at = env.ledger().timestamp() + 4 * DAY;
    let join_deadline = first_commit_at - DAY;
    let room_id = client.create_room(
        host,
        &Symbol::new(env, code),
        &SorobanString::from_str(env, "Commit reveal test"),
        &3,
        &100,
        &Cadence::Weekly,
        &first_commit_at,
        &join_deadline,
    );
    let room = client.get_room(&room_id);
    client.join_room(&room_id, &room.code, m1);
    client.join_room(&room_id, &room.code, m2);
    client.start_room(&room_id, host);
    (contract_id, token_id, room_id, first_commit_at)
}

fn round_secret(env: &Env, round: u32, index: usize, salt: u8) -> BytesN<32> {
    let marker = salt
        .wrapping_add((round as u8).wrapping_mul(17))
        .wrapping_add(index as u8);
    BytesN::from_array(env, &[marker; 32])
}

fn commit_eligible(
    env: &Env,
    client: &ArisanRoomsClient<'_>,
    contract_id: &Address,
    room_id: u32,
    members: &[&Address],
    salt: u8,
) {
    let round = client.get_room(&room_id).round;
    for (index, member) in members.iter().enumerate() {
        if client.has_won(&room_id, member) {
            continue;
        }
        let secret = round_secret(env, round, index, salt);
        let commitment = commitment_hash(env, contract_id, room_id, round, member, &secret);
        client.commit_draw(&room_id, member, &commitment);
    }
}

fn reveal_eligible(
    env: &Env,
    client: &ArisanRoomsClient<'_>,
    room_id: u32,
    members: &[&Address],
    salt: u8,
) {
    let round = client.get_room(&room_id).round;
    for (index, member) in members.iter().enumerate() {
        if client.has_won(&room_id, member) {
            continue;
        }
        let secret = round_secret(env, round, index, salt);
        client.reveal_draw(&room_id, member, &secret);
    }
}

fn complete_round(
    env: &Env,
    client: &ArisanRoomsClient<'_>,
    contract_id: &Address,
    room_id: u32,
    caller: &Address,
    members: &[&Address],
    salt: u8,
) -> Address {
    let round = client.get_room(&room_id).round;
    assert_eq!(client.draw_phase(&room_id), DrawPhase::Commit);
    commit_eligible(env, client, contract_id, room_id, members, salt);
    let commit_at = client.kocok_at(&room_id, &round);
    set_ts(env, commit_at);
    assert_eq!(client.draw_phase(&room_id), DrawPhase::Reveal);
    reveal_eligible(env, client, room_id, members, salt);
    set_ts(env, client.reveal_at(&room_id, &round));
    assert_eq!(client.draw_phase(&room_id), DrawPhase::Finalizable);
    client.finalize_draw(&room_id, caller)
}

#[test]
fn prefund_full_cycle_zero_residual() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let members = [&host, &m1, &m2];
    let (contract_id, token_id, room_id, _) = active_room(&env, &host, &m1, &m2, "FULL01");
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);

    assert_eq!(token.balance(&contract_id), 900);
    let w1 = complete_round(&env, &client, &contract_id, room_id, &host, &members, 10);
    let w2 = complete_round(&env, &client, &contract_id, room_id, &m1, &members, 20);
    let w3 = complete_round(&env, &client, &contract_id, room_id, &m2, &members, 30);

    assert_ne!(w1, w2);
    assert_ne!(w2, w3);
    assert_ne!(w1, w3);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Done);
    assert_eq!(token.balance(&contract_id), 0);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(token.balance(&m2), 1_000);
}

#[test]
fn host_can_cancel_open_room_and_refund_all() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let (token_id, token_admin, token) = setup(&env, &admin);
    token_admin.mint(&host, &1_000);
    token_admin.mint(&m1, &1_000);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let first = env.ledger().timestamp() + 4 * DAY;
    let room_id = client.create_room(
        &host,
        &Symbol::new(&env, "CANCEL"),
        &SorobanString::from_str(&env, "Cancel"),
        &3,
        &100,
        &Cadence::Weekly,
        &first,
        &(first - DAY),
    );
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    client.cancel_room(&room_id, &host);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Dissolved);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn cannot_start_before_room_is_full() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let (token_id, token_admin, _) = setup(&env, &admin);
    token_admin.mint(&host, &1_000);
    token_admin.mint(&m1, &1_000);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let first = env.ledger().timestamp() + 4 * DAY;
    let room_id = client.create_room(
        &host,
        &Symbol::new(&env, "NOTYET"),
        &SorobanString::from_str(&env, "Not full"),
        &3,
        &100,
        &Cadence::Weekly,
        &first,
        &(first - DAY),
    );
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    assert!(client.try_start_room(&room_id, &host).is_err());
}

#[test]
fn cannot_start_after_commit_deadline() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (token_id, token_admin, _) = setup(&env, &admin);
    for member in [&host, &m1, &m2] {
        token_admin.mint(member, &1_000);
    }
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let first_commit_at = env.ledger().timestamp() + 4 * DAY;
    let room_id = client.create_room(
        &host,
        &Symbol::new(&env, "LATE01"),
        &SorobanString::from_str(&env, "Late start"),
        &3,
        &100,
        &Cadence::Weekly,
        &first_commit_at,
        &(first_commit_at - DAY),
    );
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    client.join_room(&room_id, &code, &m2);
    set_ts(&env, first_commit_at);
    assert!(client.try_start_room(&room_id, &host).is_err());
}

#[test]
fn anyone_can_cancel_after_join_deadline() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let outsider = Address::generate(&env);
    let (token_id, token_admin, token) = setup(&env, &admin);
    token_admin.mint(&host, &1_000);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let first = env.ledger().timestamp() + 4 * DAY;
    let join_deadline = first - DAY;
    let room_id = client.create_room(
        &host,
        &Symbol::new(&env, "GRACE2"),
        &SorobanString::from_str(&env, "Grace"),
        &3,
        &100,
        &Cadence::Weekly,
        &first,
        &join_deadline,
    );
    set_ts(&env, join_deadline + 1);
    client.cancel_room(&room_id, &outsider);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn wrong_code_cannot_join() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let (token_id, token_admin, _) = setup(&env, &admin);
    token_admin.mint(&host, &1_000);
    token_admin.mint(&m1, &1_000);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let first = env.ledger().timestamp() + 4 * DAY;
    let room_id = client.create_room(
        &host,
        &Symbol::new(&env, "RIGHT2"),
        &SorobanString::from_str(&env, "Code"),
        &3,
        &100,
        &Cadence::Weekly,
        &first,
        &(first - DAY),
    );
    assert!(client
        .try_join_room(&room_id, &Symbol::new(&env, "WRONG2"), &m1)
        .is_err());
}

#[test]
fn host_can_postpone_only_before_commitments() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let outsider = Address::generate(&env);
    let (contract_id, _, room_id, _) = active_room(&env, &host, &m1, &m2, "PSTPN1");
    let client = ArisanRoomsClient::new(&env, &contract_id);
    assert!(client.try_postpone_kocok(&room_id, &outsider, &60).is_err());
    let before = client.kocok_at(&room_id, &1);
    client.postpone_kocok(&room_id, &host, &60);
    assert_eq!(client.kocok_at(&room_id, &1), before + 60);
    assert!(client.try_postpone_kocok(&room_id, &host, &30).is_err());

    let secret = round_secret(&env, 1, 0, 40);
    let commitment = commitment_hash(&env, &contract_id, room_id, 1, &host, &secret);
    client.commit_draw(&room_id, &host, &commitment);
    assert!(client.try_postpone_kocok(&room_id, &host, &30).is_err());
}

#[test]
fn duplicate_invalid_and_out_of_phase_actions_are_rejected() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, _, room_id, commit_at) = active_room(&env, &host, &m1, &m2, "REJECT");
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let host_secret = round_secret(&env, 1, 0, 50);
    let host_commitment = commitment_hash(&env, &contract_id, room_id, 1, &host, &host_secret);
    client.commit_draw(&room_id, &host, &host_commitment);
    assert!(client
        .try_commit_draw(&room_id, &host, &host_commitment)
        .is_err());
    assert!(client
        .try_reveal_draw(&room_id, &host, &host_secret)
        .is_err());

    let m1_secret = round_secret(&env, 1, 1, 50);
    let m1_commitment = commitment_hash(&env, &contract_id, room_id, 1, &m1, &m1_secret);
    client.commit_draw(&room_id, &m1, &m1_commitment);
    set_ts(&env, commit_at);
    assert!(client
        .try_commit_draw(&room_id, &m2, &host_commitment)
        .is_err());
    assert!(client.try_reveal_draw(&room_id, &m2, &host_secret).is_err());
    assert!(client
        .try_reveal_draw(&room_id, &m1, &BytesN::from_array(&env, &[99; 32]))
        .is_err());
    client.reveal_draw(&room_id, &host, &host_secret);
    client.reveal_draw(&room_id, &m1, &m1_secret);
    assert!(client
        .try_reveal_draw(&room_id, &host, &host_secret)
        .is_err());
    assert!(client.try_finalize_draw(&room_id, &host).is_err());
}

#[test]
fn non_revealer_is_excluded_for_the_round() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let members = [&host, &m1, &m2];
    let (contract_id, _, room_id, commit_at) = active_room(&env, &host, &m1, &m2, "TIMEO1");
    let client = ArisanRoomsClient::new(&env, &contract_id);
    commit_eligible(&env, &client, &contract_id, room_id, &members, 60);
    set_ts(&env, commit_at);
    let host_secret = round_secret(&env, 1, 0, 60);
    client.reveal_draw(&room_id, &host, &host_secret);
    set_ts(&env, client.reveal_at(&room_id, &1));
    let winner = client.finalize_draw(&room_id, &m1);
    assert_eq!(winner, host);
    assert_eq!(client.reveal_count(&room_id, &1), 1);
    assert!(!client.has_won(&room_id, &m1));
    assert!(!client.has_won(&room_id, &m2));
}

#[test]
fn no_reveal_uses_liveness_fallback() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, _, room_id, _) = active_room(&env, &host, &m1, &m2, "TIMEO2");
    let client = ArisanRoomsClient::new(&env, &contract_id);
    set_ts(&env, client.reveal_at(&room_id, &1));
    let winner = client.finalize_draw(&room_id, &host);
    assert!(winner == host || winner == m1 || winner == m2);
    assert_eq!(client.reveal_count(&room_id, &1), 0);
    assert_eq!(client.get_room(&room_id).round, 2);
}

#[test]
fn cross_round_commitment_cannot_be_revealed() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let members = [&host, &m1, &m2];
    let (contract_id, _, room_id, _) = active_room(&env, &host, &m1, &m2, "ROUND2");
    let client = ArisanRoomsClient::new(&env, &contract_id);
    complete_round(&env, &client, &contract_id, room_id, &host, &members, 70);
    let target = members
        .iter()
        .find(|member| !client.has_won(&room_id, member))
        .copied()
        .unwrap();
    let old_secret = BytesN::from_array(&env, &[77; 32]);
    let old_commitment = commitment_hash(&env, &contract_id, room_id, 1, target, &old_secret);
    client.commit_draw(&room_id, target, &old_commitment);
    set_ts(&env, client.kocok_at(&room_id, &2));
    assert!(client
        .try_reveal_draw(&room_id, target, &old_secret)
        .is_err());
}

#[test]
fn cross_deployment_commitment_cannot_be_revealed() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_a, _, room_a, _) = active_room(&env, &host, &m1, &m2, "DEPLO1");
    let (contract_b, _, room_b, commit_at_b) = active_room(&env, &host, &m1, &m2, "DEPLO2");
    let client_b = ArisanRoomsClient::new(&env, &contract_b);
    let secret = BytesN::from_array(&env, &[88; 32]);
    let commitment_a = commitment_hash(&env, &contract_a, room_a, 1, &host, &secret);
    client_b.commit_draw(&room_b, &host, &commitment_a);
    set_ts(&env, commit_at_b);
    assert!(client_b.try_reveal_draw(&room_b, &host, &secret).is_err());
}

#[test]
fn emergency_dissolve_after_reveal_grace_refunds_unwon_members() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let members = [&host, &m1, &m2];
    let (contract_id, token_id, room_id, _) = active_room(&env, &host, &m1, &m2, "EMERG2");
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    complete_round(&env, &client, &contract_id, room_id, &host, &members, 90);
    let round_two_commit_at = client.kocok_at(&room_id, &2);
    set_ts(&env, round_two_commit_at + REVEAL_WINDOW + GRACE_PERIOD);
    client.emergency_dissolve(&room_id, &m1);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Dissolved);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(token.balance(&m2), 1_000);
    assert_eq!(token.balance(&contract_id), 0);
}
