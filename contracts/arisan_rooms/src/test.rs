#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};
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

fn open_room_for_join_test(
    env: &Env,
    host: &Address,
    member: &Address,
) -> (Address, Address, u32, u64) {
    let admin = Address::generate(env);
    let (token_id, token_admin, _) = setup(env, &admin);
    token_admin.mint(host, &1_000);
    token_admin.mint(member, &1_000);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(env, &contract_id);
    client.initialize(&token_id);
    let first = env.ledger().timestamp() + 4 * DAY;
    let join_deadline = first - DAY;
    let room_id = client.create_room(
        host,
        &Symbol::new(env, "JOIN01"),
        &SorobanString::from_str(env, "Join deadline"),
        &3,
        &100,
        &Cadence::Weekly,
        &first,
        &join_deadline,
    );
    (contract_id, token_id, room_id, join_deadline)
}

fn assert_join_rejected_without_mutations(deadline_offset: u64) {
    let env = fresh_env();
    let host = Address::generate(&env);
    let member = Address::generate(&env);
    let (contract_id, token_id, room_id, join_deadline) =
        open_room_for_join_test(&env, &host, &member);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let room_before = client.get_room(&room_id);
    let members_before = client.get_members(&room_id);
    let host_balance_before = token.balance(&host);
    let member_balance_before = token.balance(&member);
    let contract_balance_before = token.balance(&contract_id);
    let host_locked_before = client.locked_of(&room_id, &host);
    let member_locked_before = client.locked_of(&room_id, &member);
    assert_eq!(room_before.status, RoomStatus::Open);
    set_ts(&env, join_deadline + deadline_offset);

    assert_eq!(
        client.try_join_room(&room_id, &room_before.code, &member),
        Err(Ok(Error::WrongStatus))
    );

    assert_eq!(
        client.get_room(&room_id).to_xdr(&env),
        room_before.to_xdr(&env)
    );
    assert_eq!(client.get_members(&room_id), members_before);
    assert_eq!(token.balance(&host), host_balance_before);
    assert_eq!(token.balance(&member), member_balance_before);
    assert_eq!(token.balance(&contract_id), contract_balance_before);
    assert_eq!(client.locked_of(&room_id, &host), host_locked_before);
    assert_eq!(client.locked_of(&room_id, &member), member_locked_before);
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
fn join_before_deadline_locks_full_commitment() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let member = Address::generate(&env);
    let (contract_id, token_id, room_id, join_deadline) =
        open_room_for_join_test(&env, &host, &member);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&room_id).code;
    set_ts(&env, join_deadline - 1);

    client.join_room(&room_id, &code, &member);

    assert_eq!(client.get_room(&room_id).status, RoomStatus::Open);
    assert_eq!(client.get_room(&room_id).member_count, 2);
    assert_eq!(
        client.get_members(&room_id),
        Vec::from_array(&env, [host.clone(), member.clone()])
    );
    assert_eq!(client.locked_of(&room_id, &member), 300);
    assert_eq!(token.balance(&host), 700);
    assert_eq!(token.balance(&member), 700);
    assert_eq!(token.balance(&contract_id), 600);
}

#[test]
fn join_at_deadline_does_not_mutate_funds_or_members() {
    assert_join_rejected_without_mutations(0);
}

#[test]
fn join_after_deadline_does_not_mutate_funds_or_members() {
    assert_join_rejected_without_mutations(1);
}

#[test]
fn full_room_can_start_at_join_deadline_and_complete_normal_reveals() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let members = [&host, &m1, &m2];
    let (contract_id, token_id, room_id, join_deadline) = open_room_for_join_test(&env, &host, &m1);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    StellarAssetClient::new(&env, &token_id).mint(&m2, &1_000);
    let code = client.get_room(&room_id).code;
    set_ts(&env, join_deadline - 1);
    client.join_room(&room_id, &code, &m1);
    client.join_room(&room_id, &code, &m2);

    set_ts(&env, join_deadline);
    client.start_room(&room_id, &host);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Active);
    assert_eq!(token.balance(&contract_id), 900);

    let w1 = complete_round(&env, &client, &contract_id, room_id, &host, &members, 10);
    assert_eq!(client.commit_count(&room_id, &1), 3);
    assert_eq!(client.reveal_count(&room_id, &1), 3);
    let w2 = complete_round(&env, &client, &contract_id, room_id, &m1, &members, 20);
    assert_eq!(client.reveal_count(&room_id, &2), 2);
    let w3 = complete_round(&env, &client, &contract_id, room_id, &m2, &members, 30);
    assert_eq!(client.reveal_count(&room_id, &3), 1);

    assert_ne!(w1, w2);
    assert_ne!(w2, w3);
    assert_ne!(w1, w3);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Done);
    assert_eq!(token.balance(&contract_id), 0);
    for member in members {
        assert_eq!(token.balance(member), 1_000);
    }
}

#[test]
fn member_can_leave_at_join_deadline_with_full_refund() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let member = Address::generate(&env);
    let (contract_id, token_id, room_id, join_deadline) =
        open_room_for_join_test(&env, &host, &member);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&room_id).code;
    set_ts(&env, join_deadline - 1);
    client.join_room(&room_id, &code, &member);

    set_ts(&env, join_deadline);
    client.leave_room(&room_id, &member);

    assert_eq!(client.get_room(&room_id).status, RoomStatus::Open);
    assert_eq!(client.get_room(&room_id).member_count, 1);
    assert_eq!(
        client.get_members(&room_id),
        Vec::from_array(&env, [host.clone()])
    );
    assert_eq!(client.locked_of(&room_id, &member), 0);
    assert_eq!(token.balance(&member), 1_000);
    assert_eq!(token.balance(&host), 700);
    assert_eq!(token.balance(&contract_id), 300);

    client.cancel_room(&room_id, &host);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn incomplete_room_can_cancel_after_join_deadline_and_refund_every_member() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let member = Address::generate(&env);
    let outsider = Address::generate(&env);
    let (contract_id, token_id, room_id, join_deadline) =
        open_room_for_join_test(&env, &host, &member);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&room_id).code;
    set_ts(&env, join_deadline - 1);
    client.join_room(&room_id, &code, &member);

    set_ts(&env, join_deadline);
    assert_eq!(
        client.try_cancel_room(&room_id, &outsider),
        Err(Ok(Error::NotHost))
    );
    assert_eq!(token.balance(&contract_id), 600);
    assert_eq!(client.locked_of(&room_id, &host), 300);
    assert_eq!(client.locked_of(&room_id, &member), 300);

    set_ts(&env, join_deadline + 1);
    client.cancel_room(&room_id, &outsider);

    assert_eq!(client.get_room(&room_id).status, RoomStatus::Dissolved);
    assert_eq!(client.locked_of(&room_id, &host), 0);
    assert_eq!(client.locked_of(&room_id, &member), 0);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&member), 1_000);
    assert_eq!(token.balance(&contract_id), 0);
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

fn installment_room(
    env: &Env,
    host: &Address,
    m1: &Address,
    m2: &Address,
    funded_wallets: bool,
) -> (Address, Address, u32, u64) {
    let admin = Address::generate(env);
    let (token_id, token_admin, _) = setup(env, &admin);
    if funded_wallets {
        for member in [host, m1, m2] {
            token_admin.mint(member, &1_000);
        }
    }
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(env, &contract_id);
    client.initialize(&token_id);
    let deadline = env.ledger().timestamp() + 7 * DAY;
    let room_id = client.create_installment_room(
        host,
        &Symbol::new(env, "PART01"),
        &SorobanString::from_str(env, "Installment test"),
        &3,
        &100,
        &Cadence::Monthly,
        &deadline,
    );
    (contract_id, token_id, room_id, deadline)
}

fn seat_and_fund_installment_members(
    client: &ArisanRoomsClient<'_>,
    room_id: u32,
    host: &Address,
    m1: &Address,
    m2: &Address,
) {
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, m1);
    client.join_room(&room_id, &code, m2);
    for member in [host, m1, m2] {
        client.deposit_room(&room_id, member, &300);
    }
}

#[test]
fn installment_create_and_join_reserve_seats_without_tokens() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, deadline) = installment_room(&env, &host, &m1, &m2, false);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    client.join_room(&room_id, &code, &m2);
    assert_eq!(client.get_room(&room_id).member_count, 3);
    assert_eq!(client.get_room(&room_id).first_kocok, 0);
    for member in [&host, &m1, &m2] {
        assert_eq!(token.balance(member), 0);
        assert_eq!(client.locked_of(&room_id, member), 0);
    }
    assert_eq!(token.balance(&contract_id), 0);
    assert_eq!(
        client.funding_state(&room_id),
        FundingState {
            mode: FundingMode::Installments,
            obligation: 300,
            pooled: 0,
            fully_funded_count: 0,
            deadline,
        }
    );
}

#[test]
fn installment_repeated_deposits_accumulate_and_reject_invalid_amounts() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    client.deposit_room(&room_id, &host, &25);
    client.deposit_room(&room_id, &host, &75);
    assert_eq!(client.locked_of(&room_id, &host), 100);
    for amount in [0, -1, 201, i128::MAX] {
        assert_eq!(
            client.try_deposit_room(&room_id, &host, &amount),
            Err(Ok(Error::InvalidParams))
        );
        assert_eq!(client.locked_of(&room_id, &host), 100);
        assert_eq!(client.funding_state(&room_id).pooled, 100);
        assert_eq!(token.balance(&host), 900);
    }
    client.deposit_room(&room_id, &host, &200);
    assert_eq!(client.funding_state(&room_id).fully_funded_count, 1);
    assert_eq!(
        client.try_deposit_room(&room_id, &host, &1),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(token.balance(&contract_id), 300);
}

#[test]
fn installment_nonmember_and_unauthorized_wallet_cannot_deposit() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    assert_eq!(
        client.try_deposit_room(&room_id, &m1, &100),
        Err(Ok(Error::NotMember))
    );
    env.mock_auths(&[]);
    assert!(client.try_deposit_room(&room_id, &host, &100).is_err());
    assert_eq!(client.funding_state(&room_id).pooled, 0);
    assert_eq!(token.balance(&host), 1_000);
}

#[test]
fn installment_failed_token_transfer_does_not_record_payment() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, false);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    assert!(client.try_deposit_room(&room_id, &host, &100).is_err());
    assert_eq!(client.locked_of(&room_id, &host), 0);
    assert_eq!(client.funding_state(&room_id).pooled, 0);
    assert_eq!(token.balance(&contract_id), 0);
    assert_eq!(client.get_room(&room_id).member_count, 1);
}

#[test]
fn installment_start_requires_every_seat_and_every_exact_obligation() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    client.deposit_room(&room_id, &host, &300);
    assert_eq!(
        client.try_start_room(&room_id, &host),
        Err(Ok(Error::InvalidParams))
    );
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    client.join_room(&room_id, &code, &m2);
    client.deposit_room(&room_id, &m1, &300);
    client.deposit_room(&room_id, &m2, &299);
    assert_eq!(
        client.try_start_room(&room_id, &host),
        Err(Ok(Error::NotFullyFunded))
    );
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Open);
    assert_eq!(client.funding_state(&room_id).pooled, 899);
    assert_eq!(token.balance(&contract_id), 899);
    client.deposit_room(&room_id, &m2, &1);
    assert_eq!(
        client.try_start_room(&room_id, &m1),
        Err(Ok(Error::NotHost))
    );
    let started_at = env.ledger().timestamp();
    client.start_room(&room_id, &host);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Active);
    assert_eq!(
        client.kocok_at(&room_id, &1),
        started_at + FIRST_COMMIT_WINDOW
    );
    assert_eq!(client.draw_phase(&room_id), DrawPhase::Commit);
    assert_eq!(client.funding_state(&room_id).fully_funded_count, 3);
}

#[test]
fn installment_start_does_not_borrow_another_rooms_escrow() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, deadline) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let other = client.create_installment_room(
        &host,
        &Symbol::new(&env, "OTHER1"),
        &SorobanString::from_str(&env, "Other"),
        &3,
        &100,
        &Cadence::Weekly,
        &deadline,
    );
    seat_and_fund_installment_members(&client, other, &host, &m1, &m2);
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    client.join_room(&room_id, &code, &m2);
    assert_eq!(token.balance(&contract_id), 900);
    assert_eq!(
        client.try_start_room(&room_id, &host),
        Err(Ok(Error::NotFullyFunded))
    );
    assert_eq!(client.funding_state(&room_id).pooled, 0);
    assert_eq!(client.funding_state(&other).pooled, 900);
    client.cancel_room(&other, &host);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn installment_leave_and_cancel_refund_actual_partial_payments_only() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    client.join_room(&room_id, &code, &m2);
    client.deposit_room(&room_id, &host, &80);
    client.deposit_room(&room_id, &m1, &125);
    assert_eq!(
        client.try_leave_room(&room_id, &host),
        Err(Ok(Error::InvalidParams))
    );
    client.leave_room(&room_id, &m1);
    assert_eq!(client.locked_of(&room_id, &m1), 0);
    assert_eq!(client.funding_state(&room_id).pooled, 80);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(client.get_room(&room_id).member_count, 2);
    client.join_room(&room_id, &code, &m1);
    assert_eq!(client.locked_of(&room_id, &m1), 0);
    client.deposit_room(&room_id, &m1, &10);
    client.cancel_room(&room_id, &host);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Dissolved);
    assert_eq!(client.funding_state(&room_id).pooled, 0);
    for member in [&host, &m1, &m2] {
        assert_eq!(client.locked_of(&room_id, member), 0);
        assert_eq!(token.balance(member), 1_000);
    }
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn installment_zero_paid_member_can_leave_without_a_transfer() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, false);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    client.leave_room(&room_id, &m1);
    assert_eq!(client.get_members(&room_id).len(), 1);
    assert_eq!(client.locked_of(&room_id, &m1), 0);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&contract_id), 0);
}

#[test]
fn installment_exact_deadline_rejects_join_deposit_start_and_allows_cancel() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let outsider = Address::generate(&env);
    let (contract_id, token_id, room_id, deadline) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&room_id).code;
    client.join_room(&room_id, &code, &m1);
    client.deposit_room(&room_id, &host, &100);
    assert_eq!(
        client.try_cancel_room(&room_id, &outsider),
        Err(Ok(Error::NotHost))
    );
    set_ts(&env, deadline);
    assert_eq!(
        client.try_join_room(&room_id, &code, &m2),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(
        client.try_deposit_room(&room_id, &host, &100),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(
        client.try_start_room(&room_id, &host),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(client.funding_state(&room_id).pooled, 100);
    client.cancel_room(&room_id, &outsider);
    assert_eq!(client.funding_state(&room_id).pooled, 0);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn installment_full_room_starts_one_second_before_deadline_not_at_deadline() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, _, room_id, deadline) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    seat_and_fund_installment_members(&client, room_id, &host, &m1, &m2);
    set_ts(&env, deadline);
    assert_eq!(
        client.try_start_room(&room_id, &host),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Open);
    set_ts(&env, deadline - 1);
    client.start_room(&room_id, &host);
    assert_eq!(
        client.kocok_at(&room_id, &1),
        deadline - 1 + FIRST_COMMIT_WINDOW
    );
}

#[test]
fn installment_active_roster_and_funding_are_frozen() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let outsider = Address::generate(&env);
    let (contract_id, _, room_id, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    seat_and_fund_installment_members(&client, room_id, &host, &m1, &m2);
    client.start_room(&room_id, &host);
    let code = client.get_room(&room_id).code;
    assert_eq!(
        client.try_deposit_room(&room_id, &host, &1),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(
        client.try_join_room(&room_id, &code, &outsider),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(
        client.try_leave_room(&room_id, &m1),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(
        client.try_cancel_room(&room_id, &host),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(client.funding_state(&room_id).pooled, 900);
}

#[test]
fn installment_full_cycle_pays_every_member_once_and_zeros_own_pool() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let members = [&host, &m1, &m2];
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    seat_and_fund_installment_members(&client, room_id, &host, &m1, &m2);
    client.start_room(&room_id, &host);
    let mut winners: Vec<Address> = Vec::new(&env);
    for round in 1..=3 {
        let winner = complete_round(&env, &client, &contract_id, room_id, &host, &members, 120);
        assert!(!winners.iter().any(|previous| previous == winner));
        winners.push_back(winner);
        assert_eq!(
            client.funding_state(&room_id).pooled,
            900 - 300 * round as i128
        );
    }
    assert_eq!(winners.len(), 3);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Done);
    for member in members {
        assert_eq!(token.balance(member), 1_000);
    }
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn installment_emergency_refund_uses_only_remaining_room_pool() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let members = [&host, &m1, &m2];
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    seat_and_fund_installment_members(&client, room_id, &host, &m1, &m2);
    client.start_room(&room_id, &host);
    complete_round(&env, &client, &contract_id, room_id, &host, &members, 121);
    assert_eq!(client.funding_state(&room_id).pooled, 600);
    set_ts(&env, client.reveal_at(&room_id, &2) + GRACE_PERIOD);
    client.emergency_dissolve(&room_id, &m1);
    assert_eq!(client.funding_state(&room_id).pooled, 0);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Dissolved);
    for member in members {
        assert_eq!(token.balance(member), 1_000);
    }
}

#[test]
fn installment_cancellation_isolated_from_second_room_partial_contributions() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, first, deadline) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let second = client.create_installment_room(
        &host,
        &Symbol::new(&env, "OTHER2"),
        &SorobanString::from_str(&env, "Other"),
        &3,
        &100,
        &Cadence::Weekly,
        &deadline,
    );
    client.deposit_room(&first, &host, &80);
    client.deposit_room(&second, &host, &125);
    client.cancel_room(&first, &host);
    assert_eq!(client.funding_state(&first).pooled, 0);
    assert_eq!(client.funding_state(&second).pooled, 125);
    assert_eq!(client.locked_of(&second, &host), 125);
    assert_eq!(client.get_room(&second).status, RoomStatus::Open);
    assert_eq!(token.balance(&contract_id), 125);
    assert_eq!(token.balance(&host), 875);
    client.cancel_room(&second, &host);
    assert_eq!(token.balance(&host), 1_000);
}

#[test]
fn installment_parameters_reject_overflow_expired_deadline_and_duplicate_code() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, _, room_id, deadline) = installment_room(&env, &host, &m1, &m2, false);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    for (target, share, funding_deadline) in [
        (2, 100, deadline),
        (21, 100, deadline),
        (3, 0, deadline),
        (3, -1, deadline),
        (3, i128::MAX, deadline),
        (3, i128::MAX / 5, deadline),
        (3, 100, env.ledger().timestamp()),
        (3, 100, u64::MAX),
    ] {
        assert_eq!(
            client.try_create_installment_room(
                &host,
                &Symbol::new(&env, "BAD001"),
                &SorobanString::from_str(&env, "Bad"),
                &target,
                &share,
                &Cadence::Weekly,
                &funding_deadline,
            ),
            Err(Ok(Error::InvalidParams))
        );
        assert_eq!(client.room_count(), 1);
    }
    assert_eq!(
        client.try_create_installment_room(
            &host,
            &Symbol::new(&env, "PART01"),
            &SorobanString::from_str(&env, "Duplicate"),
            &3,
            &100,
            &Cadence::Weekly,
            &deadline,
        ),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(client.room_by_code(&Symbol::new(&env, "PART01")), room_id);
    assert_eq!(client.get_room(&room_id).member_count, 1);
}

#[test]
fn installment_methods_do_not_convert_or_charge_legacy_rooms() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let member = Address::generate(&env);
    let (contract_id, token_id, room_id, _) = open_room_for_join_test(&env, &host, &member);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&room_id).code;
    assert_eq!(client.funding_state(&room_id).mode, FundingMode::LegacyFull);
    assert_eq!(client.funding_state(&room_id).pooled, 300);
    assert_eq!(
        client.try_deposit_room(&room_id, &host, &1),
        Err(Ok(Error::WrongStatus))
    );
    client.join_room(&room_id, &code, &member);
    assert_eq!(client.locked_of(&room_id, &member), 300);
    assert_eq!(client.funding_state(&room_id).fully_funded_count, 2);
    assert_eq!(client.funding_state(&room_id).pooled, 600);
    assert_eq!(token.balance(&member), 700);
}

#[test]
fn installment_funding_state_ttl_is_extended_and_keepalive_renews_token_pool() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, _, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let start_ts = env.ledger().timestamp();
    let start_sequence = env.ledger().sequence();
    let code = Symbol::new(&env, "TTL001");
    let room_id = client.create_installment_room(
        &host,
        &code,
        &SorobanString::from_str(&env, "Thirty day funding"),
        &3,
        &100,
        &Cadence::Monthly,
        &(start_ts + 30 * DAY),
    );
    client.join_room(&room_id, &code, &m1);
    client.deposit_room(&room_id, &host, &80);
    client.deposit_room(&room_id, &m1, &125);
    env.as_contract(&contract_id, || {
        let maximum = env.storage().max_ttl();
        assert_eq!(env.storage().instance().get_ttl(), maximum);
        for key in [
            DataKey::Room(room_id),
            DataKey::Members(room_id),
            DataKey::RoomByCode(code.clone()),
            DataKey::Installment(room_id),
            DataKey::RoomPool(room_id),
            DataKey::Locked(room_id, host.clone()),
            DataKey::Locked(room_id, m1.clone()),
        ] {
            assert_eq!(env.storage().persistent().get_ttl(&key), maximum);
        }
    });
    // The SAC's balance TTL is30days in ledgers. Renew it before expiry, then
    // refund after57days. Without the keeper that balance would be archived.
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = start_ts + 29 * DAY;
        ledger.sequence_number = start_sequence + 29 * 17_280;
    });
    assert_eq!(client.funding_state(&room_id).pooled, 205);
    client.keepalive_room(&room_id);
    // Address::generate fixtures are contract addresses, unlike the app's
    // classic G-wallets. Renew those fixture-recipient balances separately;
    // the room keeper is responsible for only its own pooled token balance.
    token.balance(&host);
    token.balance(&m1);
    env.as_contract(&contract_id, || {
        assert_eq!(
            env.storage()
                .persistent()
                .get_ttl(&DataKey::Locked(room_id, host.clone())),
            env.storage().max_ttl()
        );
    });
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = start_ts + 57 * DAY;
        ledger.sequence_number = start_sequence + 57 * 17_280;
    });
    client.cancel_room(&room_id, &m2);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Dissolved);
    assert_eq!(client.funding_state(&room_id).pooled, 0);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn installment_creation_rejects_network_retention_too_short_for_funding() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let admin = Address::generate(&env);
    let (token_id, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    env.ledger().set_max_entry_ttl(100_000);
    assert_eq!(
        client.try_create_installment_room(
            &host,
            &Symbol::new(&env, "TTL002"),
            &SorobanString::from_str(&env, "Unsafe retention"),
            &3,
            &100,
            &Cadence::Monthly,
            &(env.ledger().timestamp() + 30 * DAY),
        ),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(client.room_count(), 0);
}

#[test]
fn installment_capabilities_report_version_and_exact_initialized_asset() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, room_id, _) = installment_room(&env, &host, &m1, &m2, false);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    assert_eq!(client.installments_version(), 1);
    assert_eq!(client.token_address(), token_id);
    let info = client.installment_contract_info();
    assert_eq!(info.version, 1);
    assert_eq!(info.token, token_id);
    assert_eq!(info.cadence_weekly, cadence_seconds(Cadence::Weekly));
    assert_eq!(info.cadence_biweekly, cadence_seconds(Cadence::Biweekly));
    assert_eq!(info.cadence_monthly, cadence_seconds(Cadence::Monthly));
    assert_eq!(info.max_postpone, MAX_POSTPONE_SECONDS);
    assert_eq!(info.first_commit_window, FIRST_COMMIT_WINDOW);
    assert_eq!(info.max_funding_window, MAX_FUNDING_WINDOW);
    let legacy_id = env.register(ArisanRooms, ());
    let uninitialized = ArisanRoomsClient::new(&env, &legacy_id);
    assert_eq!(
        uninitialized.try_token_address(),
        Err(Ok(Error::NotInitialized))
    );
    assert_eq!(client.get_room(&room_id).member_count, 1);
}

/// Public generated ABI export for the web encoder compatibility check. The
/// data comes from Soroban's macro output, not a separately handwritten schema.
/// `cargo test -p arisan-rooms installment_generated_abi -- --nocapture` emits
/// one marker containing concatenated ScSpecEntry XDR hex, with no secrets.
#[test]
fn installment_generated_abi() {
    use soroban_sdk::xdr::{Limits, ReadXdr, ScSpecEntry, ScSpecTypeDef};
    let creation = ScSpecEntry::from_xdr(
        ArisanRooms::spec_xdr_create_installment_room(),
        Limits::none(),
    )
    .unwrap();
    let ScSpecEntry::FunctionV0(creation) = creation else {
        panic!("function spec")
    };
    assert_eq!(creation.inputs.len(), 7);
    assert_eq!(creation.inputs[0].type_, ScSpecTypeDef::Address);
    assert_eq!(creation.inputs[1].type_, ScSpecTypeDef::Symbol);
    assert_eq!(creation.inputs[2].type_, ScSpecTypeDef::String);
    assert_eq!(creation.inputs[3].type_, ScSpecTypeDef::U32);
    assert_eq!(creation.inputs[4].type_, ScSpecTypeDef::I128);
    assert_eq!(creation.inputs[6].type_, ScSpecTypeDef::U64);
    let joining = ScSpecEntry::from_xdr(ArisanRooms::spec_xdr_join_room(), Limits::none()).unwrap();
    let ScSpecEntry::FunctionV0(joining) = joining else {
        panic!("function spec")
    };
    assert_eq!(joining.inputs.len(), 3);
    assert_eq!(joining.inputs[0].type_, ScSpecTypeDef::U32);
    assert_eq!(joining.inputs[1].type_, ScSpecTypeDef::Symbol);
    assert_eq!(joining.inputs[2].type_, ScSpecTypeDef::Address);
    let deposits =
        ScSpecEntry::from_xdr(ArisanRooms::spec_xdr_deposit_room(), Limits::none()).unwrap();
    let ScSpecEntry::FunctionV0(deposits) = deposits else {
        panic!("function spec")
    };
    assert_eq!(deposits.inputs.len(), 3);
    assert_eq!(deposits.inputs[0].type_, ScSpecTypeDef::U32);
    assert_eq!(deposits.inputs[1].type_, ScSpecTypeDef::Address);
    assert_eq!(deposits.inputs[2].type_, ScSpecTypeDef::I128);
    let entries: &[&[u8]] = &[
        &ArisanRooms::spec_xdr_create_installment_room(),
        &ArisanRooms::spec_xdr_join_room(),
        &ArisanRooms::spec_xdr_deposit_room(),
        &ArisanRooms::spec_xdr_start_room(),
        &ArisanRooms::spec_xdr_leave_room(),
        &ArisanRooms::spec_xdr_cancel_room(),
        &ArisanRooms::spec_xdr_funding_state(),
        &ArisanRooms::spec_xdr_installment_contract_info(),
        &ArisanRooms::spec_xdr_get_room(),
        &ArisanRooms::spec_xdr_locked_of(),
        &FundingMode::spec_xdr(),
        &FundingState::spec_xdr(),
        &InstallmentContractInfo::spec_xdr(),
        &Cadence::spec_xdr(),
        &Room::spec_xdr(),
        &RoomStatus::spec_xdr(),
        &Error::spec_xdr(),
    ];
    std::print!("INSTALLMENT_SPEC_HEX=");
    for entry in entries {
        for byte in *entry {
            std::print!("{byte:02x}");
        }
    }
    std::println!();
}

#[test]
fn installment_maximum_roster_can_fund_and_complete_all_twenty_payouts() {
    let env = fresh_env();
    let admin = Address::generate(&env);
    let (token_id, token_admin, token) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let mut members: Vec<Address> = Vec::new(&env);
    for _ in 0..MAX_MEMBERS {
        let member = Address::generate(&env);
        token_admin.mint(&member, &1_000);
        members.push_back(member);
    }
    let host = members.get(0).unwrap();
    let code = Symbol::new(&env, "MAX020");
    let room_id = client.create_installment_room(
        &host,
        &code,
        &SorobanString::from_str(&env, "Maximum roster"),
        &MAX_MEMBERS,
        &1,
        &Cadence::Monthly,
        &(env.ledger().timestamp() + DAY),
    );
    for index in 1..MAX_MEMBERS {
        client.join_room(&room_id, &code, &members.get(index).unwrap());
    }
    for member in members.iter() {
        client.deposit_room(&room_id, &member, &20);
    }
    assert_eq!(
        client.funding_state(&room_id).fully_funded_count,
        MAX_MEMBERS
    );
    assert_eq!(client.funding_state(&room_id).pooled, 400);
    client.start_room(&room_id, &host);
    let mut winners: Vec<Address> = Vec::new(&env);
    for round in 1..=MAX_MEMBERS {
        set_ts(&env, client.reveal_at(&room_id, &round));
        let winner = client.finalize_draw(&room_id, &host);
        assert!(!winners.iter().any(|previous| previous == winner));
        winners.push_back(winner);
        assert_eq!(
            client.funding_state(&room_id).pooled,
            400 - 20 * round as i128
        );
    }
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Done);
    assert_eq!(winners.len(), MAX_MEMBERS);
    for member in members.iter() {
        assert!(client.has_won(&room_id, &member));
        assert_eq!(token.balance(&member), 1_000);
    }
    assert_eq!(token.balance(&contract_id), 0);
}
