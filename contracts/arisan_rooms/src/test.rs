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

fn account_address(env: &Env, tag: u8) -> Address {
    use soroban_sdk::{
        xdr::{AccountId, PublicKey, ScAddress, Uint256},
        TryFromVal,
    };
    Address::try_from_val(
        env,
        &ScAddress::Account(AccountId(PublicKey::PublicKeyTypeEd25519(Uint256(
            [tag; 32],
        )))),
    )
    .unwrap()
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
        assert!(env.storage().instance().get_ttl() <= CODE_TTL_TARGET);
        assert!(env.storage().instance().get_ttl() >= CODE_TTL_THRESHOLD);
        for key in [
            DataKey::Room(room_id),
            DataKey::Members(room_id),
            DataKey::RoomByCode(code.clone()),
            DataKey::Installment(room_id),
            DataKey::RoomPool(room_id),
            DataKey::Locked(room_id, host.clone()),
            DataKey::Locked(room_id, m1.clone()),
        ] {
            assert_eq!(env.storage().persistent().get_ttl(&key), DATA_TTL_TARGET);
        }
    });
    // Daily submitted keepalives bound code rent increments. Room data and the
    // SAC balance last longer, but code expiry cannot be ignored for 29 days.
    for elapsed_days in 1..57 {
        env.ledger().with_mut(|ledger| {
            ledger.timestamp = start_ts + elapsed_days * DAY;
            ledger.sequence_number = start_sequence + elapsed_days as u32 * LEDGERS_PER_DAY;
        });
        assert_eq!(client.funding_state(&room_id).pooled, 205);
        client.keepalive_room(&room_id);
        // Address::generate fixtures own separate contract SAC balances.
        token.balance(&host);
        token.balance(&m1);
        env.as_contract(&contract_id, || {
            assert!(env.storage().instance().get_ttl() >= CODE_TTL_THRESHOLD);
            assert!(env.storage().instance().get_ttl() <= CODE_TTL_TARGET);
            let ttl = env
                .storage()
                .persistent()
                .get_ttl(&DataKey::Locked(room_id, host.clone()));
            assert!(ttl >= DATA_TTL_THRESHOLD);
            assert!(ttl <= DATA_TTL_TARGET);
        });
    }
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = start_ts + 57 * DAY;
        ledger.sequence_number = start_sequence + 57 * LEDGERS_PER_DAY;
    });
    client.cancel_room(&room_id, &m2);
    assert_eq!(client.get_room(&room_id).status, RoomStatus::Dissolved);
    assert_eq!(client.funding_state(&room_id).pooled, 0);
    assert_eq!(token.balance(&host), 1_000);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn installment_keepalive_uses_bounded_thresholds_without_renting_network_maximum() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, _, id, _) = installment_room(&env, &host, &m1, &m2, false);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let start_sequence = env.ledger().sequence();
    let start_ts = env.ledger().timestamp();
    env.as_contract(&contract_id, || {
        assert!(env.storage().max_ttl() > DATA_TTL_TARGET);
        assert_eq!(env.storage().instance().get_ttl(), CODE_TTL_TARGET);
        assert_eq!(
            env.storage().persistent().get_ttl(&DataKey::Room(id)),
            DATA_TTL_TARGET
        );
    });
    // A sub-day call must not rent the code or room back to their targets.
    env.ledger().with_mut(|ledger| {
        ledger.sequence_number = start_sequence + LEDGERS_PER_DAY / 2;
        ledger.timestamp = start_ts + DAY / 2;
    });
    client.keepalive_room(&id);
    env.as_contract(&contract_id, || {
        assert_eq!(
            env.storage().instance().get_ttl(),
            CODE_TTL_TARGET - LEDGERS_PER_DAY / 2
        );
        assert_eq!(
            env.storage().persistent().get_ttl(&DataKey::Room(id)),
            DATA_TTL_TARGET - LEDGERS_PER_DAY / 2
        );
    });
    env.ledger().with_mut(|ledger| {
        ledger.sequence_number = start_sequence + LEDGERS_PER_DAY + 1;
        ledger.timestamp = start_ts + DAY + 5;
    });
    client.keepalive_room(&id);
    env.as_contract(&contract_id, || {
        assert_eq!(env.storage().instance().get_ttl(), CODE_TTL_TARGET);
        assert_eq!(
            env.storage().persistent().get_ttl(&DataKey::Room(id)),
            DATA_TTL_TARGET - LEDGERS_PER_DAY - 1
        );
    });
}

#[test]
fn installment_bounded_ttl_clamps_to_lower_network_maximum() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let admin = Address::generate(&env);
    let (token_id, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    env.ledger().set_max_entry_ttl(100_000);
    let id = client.create_installment_room(
        &host,
        &Symbol::new(&env, "TTL003"),
        &SorobanString::from_str(&env, "Bounded retention"),
        &3,
        &100,
        &Cadence::Weekly,
        &(env.ledger().timestamp() + 60),
    );
    env.as_contract(&contract_id, || {
        assert_eq!(env.storage().instance().get_ttl(), env.storage().max_ttl());
        assert_eq!(
            env.storage().persistent().get_ttl(&DataKey::Room(id)),
            env.storage().max_ttl()
        );
    });
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

fn scheduled_room(
    env: &Env,
    host: &Address,
    m1: &Address,
    m2: &Address,
    interval_days: u64,
) -> (Address, Address, u32, RoomSchedule) {
    let admin = Address::generate(env);
    let (token_id, token_admin, _) = setup(env, &admin);
    for member in [host, m1, m2] {
        token_admin.mint(member, &1_000);
    }
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(env, &contract_id);
    // These historical financial fixtures deliberately use contract-address
    // token recipients. The isolated web deployment's G-wallet gate is tested
    // separately below and in independent-wallet live Testnet QA.
    client.initialize(&token_id);
    let funding_deadline = env.ledger().timestamp() + 7 * DAY;
    let first_commit_at = funding_deadline + FIRST_COMMIT_WINDOW;
    let first_draw_at = first_commit_at + SCHEDULED_REVEAL_WINDOW;
    let room_id = client.create_scheduled_room(
        host,
        &Symbol::new(env, "SCHED2"),
        &SorobanString::from_str(env, "Agreed draw schedule"),
        &3,
        &100,
        &(interval_days * DAY),
        &first_draw_at,
        &funding_deadline,
    );
    let schedule = client.scheduled_room_info(&room_id);
    (contract_id, token_id, room_id, schedule)
}

#[test]
fn scheduled_only_initializer_blocks_public_legacy_creates_without_state_or_tokens() {
    let env = fresh_env();
    let host = account_address(&env, 1);
    let admin = Address::generate(&env);
    let (token_id, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize_scheduled(&token_id);
    let token = TokenClient::new(&env, &token_id);
    assert!(client.scheduled_only());
    let deadline = env.ledger().timestamp() + DAY;
    let draw = deadline + FIRST_COMMIT_WINDOW + SCHEDULED_REVEAL_WINDOW;
    let id = client.create_scheduled_room(
        &host,
        &Symbol::new(&env, "GHAST2"),
        &SorobanString::from_str(&env, "Supported G host"),
        &3,
        &100,
        &(7 * DAY),
        &draw,
        &deadline,
    );
    let count = client.room_count();
    let first = env.ledger().timestamp() + 4 * DAY;
    assert_eq!(
        client.try_create_room(
            &host,
            &Symbol::new(&env, "BADOLD"),
            &SorobanString::from_str(&env, "Legacy bypass"),
            &3,
            &100,
            &Cadence::Weekly,
            &first,
            &(first - DAY),
        ),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(
        client.try_create_installment_room(
            &host,
            &Symbol::new(&env, "BADINS"),
            &SorobanString::from_str(&env, "Installment bypass"),
            &3,
            &100,
            &Cadence::Weekly,
            &(env.ledger().timestamp() + DAY),
        ),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(client.room_count(), count);
    assert_eq!(token.balance(&contract_id), 0);
    assert_eq!(client.funding_state(&id).pooled, 0);
    assert_eq!(
        client.try_initialize(&token_id),
        Err(Ok(Error::AlreadyInitialized))
    );
    assert_eq!(
        client.try_initialize_scheduled(&token_id),
        Err(Ok(Error::AlreadyInitialized))
    );
    assert!(client.scheduled_only());

    // Old initialization cannot be changed into scheduled-only after rooms
    // exist, and its old entry points retain the original behavior.
    let legacy_id = env.register(ArisanRooms, ());
    let legacy = ArisanRoomsClient::new(&env, &legacy_id);
    assert!(!legacy.scheduled_only());
    legacy.initialize(&token_id);
    assert!(!legacy.scheduled_only());
    assert_eq!(
        legacy.try_initialize_scheduled(&token_id),
        Err(Ok(Error::AlreadyInitialized))
    );
    assert!(!legacy.scheduled_only());
    let old_host = Address::generate(&env);
    let (other_token, admin_client, _) = setup(&env, &old_host);
    admin_client.mint(&old_host, &1_000);
    let compatible_id = env.register(ArisanRooms, ());
    let compatible = ArisanRoomsClient::new(&env, &compatible_id);
    compatible.initialize(&other_token);
    compatible.create_installment_room(
        &old_host,
        &Symbol::new(&env, "OLDINS"),
        &SorobanString::from_str(&env, "Old room"),
        &3,
        &100,
        &Cadence::Weekly,
        &(env.ledger().timestamp() + DAY),
    );
    compatible.create_room(
        &old_host,
        &Symbol::new(&env, "OLDROO"),
        &SorobanString::from_str(&env, "Old prefund"),
        &3,
        &100,
        &Cadence::Weekly,
        &first,
        &(first - DAY),
    );
    assert_eq!(compatible.room_count(), 2);
}

#[test]
fn scheduled_only_rejects_contract_addresses_and_accepts_classic_free_joins() {
    let env = fresh_env();
    let host = account_address(&env, 1);
    let m1 = account_address(&env, 2);
    let m2 = account_address(&env, 3);
    let contract_actor = Address::generate(&env);
    let admin = Address::generate(&env);
    let (token, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize_scheduled(&token);
    let deadline = env.ledger().timestamp() + DAY;
    let draw = deadline + FIRST_COMMIT_WINDOW + SCHEDULED_REVEAL_WINDOW;
    let code = Symbol::new(&env, "GWAL22");
    let name = SorobanString::from_str(&env, "G wallets only");
    assert_eq!(
        client.try_create_scheduled_room(
            &contract_actor,
            &code,
            &name,
            &3,
            &100,
            &(7 * DAY),
            &draw,
            &deadline
        ),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(client.room_count(), 0);
    let id =
        client.create_scheduled_room(&host, &code, &name, &3, &100, &(7 * DAY), &draw, &deadline);
    assert_eq!(
        client.try_join_room(&id, &code, &contract_actor),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(
        client.get_members(&id),
        Vec::from_array(&env, [host.clone()])
    );
    client.join_room(&id, &code, &m1);
    client.join_room(&id, &code, &m2);
    assert_eq!(
        client.get_members(&id),
        Vec::from_array(&env, [host.clone(), m1.clone(), m2.clone()])
    );
    assert_eq!(client.funding_state(&id).pooled, 0);
    for member in [&host, &m1, &m2] {
        assert_eq!(client.locked_of(&id, member), 0);
    }
}

#[test]
fn scheduled_codes_and_share_bound_match_supported_web_read_domain() {
    let env = fresh_env();
    let host = account_address(&env, 1);
    let admin = Address::generate(&env);
    let (token, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize_scheduled(&token);
    let deadline = env.ledger().timestamp() + DAY;
    let draw = deadline + FIRST_COMMIT_WINDOW + SCHEDULED_REVEAL_WINDOW;
    let name = SorobanString::from_str(&env, "Safe public terms");
    for code in [
        "", "ABCDE", "ABCDEFG", "ABC0EF", "ABC1EF", "ABIDEF", "ABODEF", "ABCdEF", "ABC_EF",
    ] {
        assert_eq!(
            client.try_create_scheduled_room(
                &host,
                &Symbol::new(&env, code),
                &name,
                &3,
                &100,
                &(7 * DAY),
                &draw,
                &deadline
            ),
            Err(Ok(Error::InvalidParams))
        );
        assert_eq!(client.room_count(), 0);
    }
    assert_eq!(
        client.try_create_scheduled_room(
            &host,
            &Symbol::new(&env, "MAXSHR"),
            &name,
            &3,
            &(MAX_SCHEDULED_SHARE + 1),
            &(7 * DAY),
            &draw,
            &deadline
        ),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(client.room_count(), 0);
    let id = client.create_scheduled_room(
        &host,
        &Symbol::new(&env, "MAXSHR"),
        &name,
        &20,
        &MAX_SCHEDULED_SHARE,
        &(7 * DAY),
        &draw,
        &deadline,
    );
    assert_eq!(client.get_room(&id).share, MAX_SCHEDULED_SHARE);
    assert_eq!(
        client.funding_state(&id).obligation,
        MAX_SCHEDULED_SHARE * 20
    );
    assert_eq!(client.funding_state(&id).pooled, 0);
}

#[test]
fn scheduled_names_reject_discovery_poisoning_and_enforce_utf8_byte_bound() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, _, _, schedule) = scheduled_room(&env, &host, &m1, &m2, 7);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let count = client.room_count();
    let oversized = "x".repeat(121);
    let oversized_unicode = "é".repeat(61);
    for bad in [
        "",
        " ",
        " leading",
        "trailing ",
        "line\nbreak",
        "tab\tname",
        "bad\0name",
        "bad\u{7f}name",
        "bad\u{85}name",
        "<room>",
        "bad>name",
        "\u{2003}",
        oversized.as_str(),
        oversized_unicode.as_str(),
    ] {
        assert_eq!(
            client.try_create_scheduled_room(
                &host,
                &Symbol::new(&env, "BADNAM"),
                &SorobanString::from_str(&env, bad),
                &3,
                &100,
                &(7 * DAY),
                &schedule.first_draw_at,
                &schedule.funding_deadline,
            ),
            Err(Ok(Error::InvalidParams)),
            "unexpected accepted name {bad:?}"
        );
        assert_eq!(client.room_count(), count);
    }
    let maximum = "é".repeat(60);
    let id = client.create_scheduled_room(
        &host,
        &Symbol::new(&env, "UTF228"),
        &SorobanString::from_str(&env, &maximum),
        &3,
        &100,
        &(7 * DAY),
        &schedule.first_draw_at,
        &schedule.funding_deadline,
    );
    assert_eq!(
        client.get_room(&id).name,
        SorobanString::from_str(&env, &maximum)
    );
    let visible = SorobanString::from_str(&env, "Keluarga 嘉 - tabungan bersama");
    let other = client.create_scheduled_room(
        &host,
        &Symbol::new(&env, "UTFKK2"),
        &visible,
        &3,
        &100,
        &(7 * DAY),
        &schedule.first_draw_at,
        &schedule.funding_deadline,
    );
    assert_eq!(client.get_room(&other).name, visible);
}

#[test]
fn scheduled_create_records_agreed_dates_without_payment_and_preserves_room_layout() {
    for interval_days in [1, 7, 13, 30, 365] {
        let env = fresh_env();
        let host = Address::generate(&env);
        let m1 = Address::generate(&env);
        let m2 = Address::generate(&env);
        let (contract_id, token_id, id, schedule) =
            scheduled_room(&env, &host, &m1, &m2, interval_days);
        let client = ArisanRoomsClient::new(&env, &contract_id);
        let room = client.get_room(&id);
        assert_eq!(schedule.version, 1);
        assert_eq!(schedule.interval_seconds, interval_days * DAY);
        assert_eq!(schedule.first_commit_at, room.first_kocok);
        assert_eq!(schedule.funding_deadline, room.join_deadline);
        assert_eq!(
            schedule.first_draw_at,
            schedule.first_commit_at + SCHEDULED_REVEAL_WINDOW
        );
        assert_eq!(room.status, RoomStatus::Open);
        assert_eq!(room.round, 0);
        assert_eq!(
            room.cadence,
            if interval_days == 30 {
                Cadence::Monthly
            } else {
                Cadence::Weekly
            }
        );
        assert_eq!(client.funding_state(&id).mode, FundingMode::Installments);
        assert_eq!(
            client.funding_state(&id).deadline,
            schedule.funding_deadline
        );
        assert_eq!(client.funding_state(&id).pooled, 0);
        assert_eq!(client.locked_of(&id, &host), 0);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&host), 1_000);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&contract_id), 0);
    }
}

#[test]
fn scheduled_start_requires_single_member_full_payment_and_exact_aggregate_pool() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, id, schedule) = scheduled_room(&env, &host, &m1, &m2, 7);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&id).code;
    client.join_room(&id, &code, &m1);
    client.join_room(&id, &code, &m2);
    client.deposit_room(&id, &host, &300);
    client.deposit_room(&id, &m1, &300);
    client.deposit_room(&id, &m2, &299);
    assert_eq!(
        client.try_start_room(&id, &host),
        Err(Ok(Error::NotFullyFunded))
    );
    assert_eq!(client.get_room(&id).status, RoomStatus::Open);
    assert_eq!(client.get_room(&id).first_kocok, schedule.first_commit_at);
    assert_eq!(client.funding_state(&id).fully_funded_count, 2);
    assert_eq!(token.balance(&contract_id), 899);
    client.deposit_room(&id, &m2, &1);
    // Prove that every fully paid seat alone is insufficient if the attributed
    // pool does not reconcile. An unrelated/global token balance is not used.
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::RoomPool(id), &899i128);
    });
    assert_eq!(
        client.try_start_room(&id, &host),
        Err(Ok(Error::NotFullyFunded))
    );
    assert_eq!(token.balance(&contract_id), 900);
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::RoomPool(id), &900i128);
    });
    assert_eq!(client.try_start_room(&id, &m1), Err(Ok(Error::NotHost)));
    client.start_room(&id, &host);
    assert_eq!(client.get_room(&id).status, RoomStatus::Active);
    assert_eq!(client.kocok_at(&id, &1), schedule.first_commit_at);
    assert_eq!(client.reveal_at(&id, &1), schedule.first_draw_at);
}

#[test]
fn scheduled_start_does_not_reset_agreed_future_clock_and_cutoffs_fail_closed() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, id, schedule) = scheduled_room(&env, &host, &m1, &m2, 30);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    seat_and_fund_installment_members(&client, id, &host, &m1, &m2);
    set_ts(&env, schedule.funding_deadline);
    assert_eq!(
        client.try_start_room(&id, &host),
        Err(Ok(Error::WrongStatus))
    );
    set_ts(&env, schedule.first_commit_at);
    assert_eq!(
        client.try_start_room(&id, &host),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(client.get_room(&id).status, RoomStatus::Open);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&contract_id), 900);
    set_ts(&env, schedule.funding_deadline - 1);
    client.start_room(&id, &host);
    assert_eq!(client.kocok_at(&id, &1), schedule.first_commit_at);
    assert_ne!(
        client.kocok_at(&id, &1),
        env.ledger().timestamp() + FIRST_COMMIT_WINDOW
    );
    assert_eq!(client.draw_phase(&id), DrawPhase::Commit);
    assert_eq!(client.scheduled_room_info(&id), schedule);
    assert_eq!(
        client.try_postpone_kocok(&id, &host, &1),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(client.reveal_at(&id, &1), schedule.first_draw_at);
}

#[test]
fn scheduled_one_day_and_manual_interval_complete_normal_reveals_without_drift() {
    for interval_days in [1, 13, 30] {
        let env = fresh_env();
        let host = Address::generate(&env);
        let m1 = Address::generate(&env);
        let m2 = Address::generate(&env);
        let members = [&host, &m1, &m2];
        let (contract_id, token_id, id, schedule) =
            scheduled_room(&env, &host, &m1, &m2, interval_days);
        let client = ArisanRoomsClient::new(&env, &contract_id);
        seat_and_fund_installment_members(&client, id, &host, &m1, &m2);
        client.start_room(&id, &host);
        let mut winners: Vec<Address> = Vec::new(&env);
        for round in 1..=3 {
            assert_eq!(
                client.kocok_at(&id, &round),
                schedule.first_commit_at + (round as u64 - 1) * interval_days * DAY
            );
            assert_eq!(
                client.reveal_at(&id, &round),
                schedule.first_draw_at + (round as u64 - 1) * interval_days * DAY
            );
            let winner = complete_round(&env, &client, &contract_id, id, &host, &members, 151);
            assert!(!winners.iter().any(|previous| previous == winner));
            winners.push_back(winner);
            assert_eq!(client.funding_state(&id).pooled, 900 - 300 * round as i128);
            if round < 3 {
                assert_eq!(client.draw_phase(&id), DrawPhase::Commit);
                assert_eq!(
                    client.kocok_at(&id, &(round + 1)) - env.ledger().timestamp(),
                    interval_days * DAY - SCHEDULED_REVEAL_WINDOW
                );
            }
        }
        assert_eq!(client.get_room(&id).status, RoomStatus::Done);
        assert_eq!(client.scheduled_room_info(&id), schedule);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&contract_id), 0);
        for member in members {
            assert_eq!(TokenClient::new(&env, &token_id).balance(member), 1_000);
            assert_eq!(client.locked_of(&id, member), 300); // Historical contribution.
        }
    }
}

#[test]
fn scheduled_late_finalize_does_not_shift_agreed_later_dates_or_change_fallback() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, _, id, schedule) = scheduled_room(&env, &host, &m1, &m2, 1);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    seat_and_fund_installment_members(&client, id, &host, &m1, &m2);
    client.start_room(&id, &host);
    let second_commit_at = schedule.first_commit_at + DAY;
    set_ts(&env, second_commit_at + 1);
    // The fallback context and immutable roster are the existing protocol.
    let mut entropy = Bytes::new(&env);
    entropy.append(&contract_id.clone().to_xdr(&env));
    entropy.append(&id.to_xdr(&env));
    entropy.append(&1u32.to_xdr(&env));
    let hash = env.crypto().sha256(&entropy).to_array();
    let mut ticket = 0u64;
    for byte in hash.iter().take(8) {
        ticket = (ticket << 8) | *byte as u64;
    }
    let expected = client.get_members(&id).get((ticket % 3) as u32).unwrap();
    assert_eq!(client.finalize_draw(&id, &host), expected);
    assert_eq!(client.kocok_at(&id, &2), second_commit_at);
    assert_eq!(client.draw_phase(&id), DrawPhase::Reveal);
    assert_eq!(client.commit_count(&id, &1), 0);
    assert_eq!(client.reveal_count(&id, &1), 0);
}

#[test]
fn scheduled_creation_rejects_bad_intervals_dates_counts_and_amounts_without_state() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let admin = Address::generate(&env);
    let (token_id, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let now = env.ledger().timestamp();
    let funding = now + DAY;
    let draw = funding + FIRST_COMMIT_WINDOW + SCHEDULED_REVEAL_WINDOW;
    for interval in [0, DAY - 1, DAY + 1, 366 * DAY, u64::MAX] {
        assert_eq!(
            client.try_create_scheduled_room(
                &host,
                &Symbol::new(&env, "BAD222"),
                &SorobanString::from_str(&env, "Bad interval"),
                &3,
                &100,
                &interval,
                &draw,
                &funding
            ),
            Err(Ok(Error::InvalidParams))
        );
    }
    for (first_draw, deadline) in [
        (draw - 1, funding),
        (draw, now),
        (now, funding),
        (now + MAX_FIRST_DRAW_DELAY + 1, funding),
        (draw, now + MAX_FUNDING_WINDOW + 1),
        (u64::MAX, funding),
        (SCHEDULED_REVEAL_WINDOW - 1, funding),
    ] {
        assert_eq!(
            client.try_create_scheduled_room(
                &host,
                &Symbol::new(&env, "BAD222"),
                &SorobanString::from_str(&env, "Bad dates"),
                &3,
                &100,
                &(7 * DAY),
                &first_draw,
                &deadline
            ),
            Err(Ok(Error::InvalidParams))
        );
    }
    for (target, share) in [(2, 100), (21, 100), (3, 0), (3, -1), (3, i128::MAX)] {
        assert_eq!(
            client.try_create_scheduled_room(
                &host,
                &Symbol::new(&env, "BAD222"),
                &SorobanString::from_str(&env, "Bad obligation"),
                &target,
                &share,
                &(7 * DAY),
                &draw,
                &funding
            ),
            Err(Ok(Error::InvalidParams))
        );
    }
    assert_eq!(client.room_count(), 0);
    assert_eq!(
        client.try_room_by_code(&Symbol::new(&env, "BAD222")),
        Err(Ok(Error::NotFound))
    );
    assert_eq!(TokenClient::new(&env, &token_id).balance(&contract_id), 0);
}

#[test]
fn scheduled_exact_maximum_first_draw_and_funding_bounds_are_accepted() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let admin = Address::generate(&env);
    let (token_id, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let now = env.ledger().timestamp();
    let id = client.create_scheduled_room(
        &host,
        &Symbol::new(&env, "MAXDAY"),
        &SorobanString::from_str(&env, "Maximum schedule"),
        &20,
        &1,
        &(365 * DAY),
        &(now + MAX_FIRST_DRAW_DELAY),
        &(now + MAX_FUNDING_WINDOW),
    );
    let schedule = client.scheduled_room_info(&id);
    assert_eq!(schedule.first_draw_at, now + MAX_FIRST_DRAW_DELAY);
    assert_eq!(schedule.funding_deadline, now + MAX_FUNDING_WINDOW);
    assert_eq!(schedule.interval_seconds, 365 * DAY);
    assert_eq!(client.get_room(&id).member_target, 20);
}

#[test]
fn scheduled_creation_checks_whole_cycle_timestamp_overflow_and_host_authorization() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let admin = Address::generate(&env);
    let (token_id, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize(&token_id);
    let now = env.ledger().timestamp();
    env.mock_auths(&[]);
    assert!(client
        .try_create_scheduled_room(
            &host,
            &Symbol::new(&env, "AUTH22"),
            &SorobanString::from_str(&env, "No consent"),
            &3,
            &100,
            &(7 * DAY),
            &(now + DAY + FIRST_COMMIT_WINDOW + SCHEDULED_REVEAL_WINDOW),
            &(now + DAY)
        )
        .is_err());
    assert_eq!(client.room_count(), 0);
    env.mock_all_auths();
    let near_limit = u64::MAX - MAX_FIRST_DRAW_DELAY - 10;
    set_ts(&env, near_limit);
    assert_eq!(
        client.try_create_scheduled_room(
            &host,
            &Symbol::new(&env, "KVFL22"),
            &SorobanString::from_str(&env, "Last round overflow"),
            &3,
            &100,
            &(365 * DAY),
            &(near_limit + DAY + FIRST_COMMIT_WINDOW + SCHEDULED_REVEAL_WINDOW),
            &(near_limit + DAY)
        ),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(client.room_count(), 0);
}

#[test]
fn scheduled_partial_leave_and_expired_cancel_refund_exact_actual_contributions() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, id, schedule) = scheduled_room(&env, &host, &m1, &m2, 7);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    let code = client.get_room(&id).code;
    client.join_room(&id, &code, &m1);
    client.join_room(&id, &code, &m2);
    client.deposit_room(&id, &host, &80);
    client.deposit_room(&id, &m1, &125);
    client.leave_room(&id, &m1);
    assert_eq!(token.balance(&m1), 1_000);
    assert_eq!(client.locked_of(&id, &m1), 0);
    assert_eq!(client.funding_state(&id).pooled, 80);
    set_ts(&env, schedule.first_commit_at);
    assert_eq!(
        client.try_deposit_room(&id, &host, &1),
        Err(Ok(Error::WrongStatus))
    );
    assert_eq!(
        client.try_start_room(&id, &host),
        Err(Ok(Error::WrongStatus))
    );
    client.cancel_room(&id, &m2);
    assert_eq!(client.get_room(&id).status, RoomStatus::Dissolved);
    assert_eq!(client.funding_state(&id).pooled, 0);
    assert_eq!(client.scheduled_room_info(&id), schedule);
    for member in [&host, &m1, &m2] {
        assert_eq!(token.balance(member), 1_000);
        assert_eq!(client.locked_of(&id, member), 0);
    }
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn scheduled_emergency_refund_uses_scheduled_reveal_deadline_not_legacy_window() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, id, schedule) = scheduled_room(&env, &host, &m1, &m2, 1);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    seat_and_fund_installment_members(&client, id, &host, &m1, &m2);
    client.start_room(&id, &host);
    set_ts(&env, schedule.first_draw_at + GRACE_PERIOD - 1);
    assert_eq!(
        client.try_emergency_dissolve(&id, &m1),
        Err(Ok(Error::NotYet))
    );
    set_ts(&env, schedule.first_draw_at + GRACE_PERIOD);
    client.emergency_dissolve(&id, &m1);
    assert_eq!(client.get_room(&id).status, RoomStatus::Dissolved);
    assert_eq!(client.funding_state(&id).pooled, 0);
    let token = TokenClient::new(&env, &token_id);
    for member in [&host, &m1, &m2] {
        assert_eq!(token.balance(member), 1_000);
    }
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn scheduled_year_interval_keepalive_retains_schedule_and_escrow_until_finalization() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, id, schedule) = scheduled_room(&env, &host, &m1, &m2, 365);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    seat_and_fund_installment_members(&client, id, &host, &m1, &m2);
    client.start_room(&id, &host);
    set_ts(&env, schedule.first_draw_at);
    client.finalize_draw(&id, &host);
    let initial_sequence = env.ledger().sequence();
    // Advance real ledger TTL as well as seconds, with a daily keeper. Reading
    // alone is not claimed to submit rent renewal. Contract fixtures own their
    // recipient SAC balances, so renew those separately as in the existing test.
    for elapsed_days in 1..=364 {
        env.ledger().with_mut(|ledger| {
            ledger.timestamp = schedule.first_draw_at + elapsed_days * DAY;
            ledger.sequence_number = initial_sequence + elapsed_days as u32 * LEDGERS_PER_DAY;
        });
        client.keepalive_room(&id);
        for member in [&host, &m1, &m2] {
            token.balance(member);
        }
        assert_eq!(client.scheduled_room_info(&id), schedule);
        env.as_contract(&contract_id, || {
            let ttl = env
                .storage()
                .persistent()
                .get_ttl(&DataKey::RoomSchedule(id));
            assert!(ttl >= DATA_TTL_THRESHOLD);
            assert!(ttl <= DATA_TTL_TARGET);
            assert!(env.storage().instance().get_ttl() >= CODE_TTL_THRESHOLD);
            assert!(env.storage().instance().get_ttl() <= CODE_TTL_TARGET);
        });
    }
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = schedule.first_draw_at + 365 * DAY;
        ledger.sequence_number = initial_sequence + 365 * LEDGERS_PER_DAY;
    });
    assert_eq!(
        client.reveal_at(&id, &2),
        schedule.first_draw_at + 365 * DAY
    );
    client.finalize_draw(&id, &m1);
    assert_eq!(client.funding_state(&id).pooled, 300);
    assert_eq!(token.balance(&contract_id), 300);
}

#[test]
fn scheduled_capabilities_are_separate_and_old_create_abis_still_work() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, old_id, _) = installment_room(&env, &host, &m1, &m2, true);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    assert_eq!(client.installments_version(), 1);
    assert_eq!(client.installment_contract_info().version, 1);
    assert_eq!(client.scheduled_version(), 1);
    assert_eq!(
        client.try_scheduled_room_info(&old_id),
        Err(Ok(Error::NotFound))
    );
    assert_eq!(client.get_room(&old_id).first_kocok, 0);
    let info = client.scheduled_contract_info();
    assert_eq!(info.version, 1);
    assert_eq!(info.token, token_id);
    assert_eq!(info.min_interval_days, 1);
    assert_eq!(info.max_interval_days, 365);
    assert_eq!(info.first_commit_window, FIRST_COMMIT_WINDOW);
    assert_eq!(info.reveal_window, SCHEDULED_REVEAL_WINDOW);
    assert_eq!(info.max_first_draw_delay, MAX_FIRST_DRAW_DELAY);
    assert_eq!(info.max_funding_window, MAX_FUNDING_WINDOW);
    seat_and_fund_installment_members(&client, old_id, &host, &m1, &m2);
    client.start_room(&old_id, &host);
    assert_eq!(
        client.kocok_at(&old_id, &1),
        env.ledger().timestamp() + FIRST_COMMIT_WINDOW
    );
    assert_eq!(
        client.reveal_at(&old_id, &1),
        env.ledger().timestamp() + FIRST_COMMIT_WINDOW + REVEAL_WINDOW
    );
    let first = env.ledger().timestamp() + 4 * DAY;
    let legacy_id = client.create_room(
        &host,
        &Symbol::new(&env, "OLDABI"),
        &SorobanString::from_str(&env, "Original full-deposit ABI"),
        &3,
        &100,
        &Cadence::Monthly,
        &first,
        &(first - DAY),
    );
    assert_eq!(
        client.try_scheduled_room_info(&legacy_id),
        Err(Ok(Error::NotFound))
    );
    assert_eq!(
        client.funding_state(&legacy_id).mode,
        FundingMode::LegacyFull
    );
    assert_eq!(client.locked_of(&legacy_id, &host), 300);
    assert_eq!(client.get_room(&legacy_id).first_kocok, first);
    let uninitialized_id = env.register(ArisanRooms, ());
    let uninitialized = ArisanRoomsClient::new(&env, &uninitialized_id);
    assert_eq!(
        uninitialized.try_scheduled_contract_info(),
        Err(Ok(Error::NotInitialized))
    );
}

#[test]
fn scheduled_generated_abi() {
    use soroban_sdk::xdr::{Limits, ReadXdr, ScSpecEntry, ScSpecTypeDef};
    let ScSpecEntry::FunctionV0(creation) = ScSpecEntry::from_xdr(
        ArisanRooms::spec_xdr_create_scheduled_room(),
        Limits::none(),
    )
    .unwrap() else {
        panic!("function spec")
    };
    assert_eq!(creation.inputs.len(), 8);
    let expected = [
        ScSpecTypeDef::Address,
        ScSpecTypeDef::Symbol,
        ScSpecTypeDef::String,
        ScSpecTypeDef::U32,
        ScSpecTypeDef::I128,
        ScSpecTypeDef::U64,
        ScSpecTypeDef::U64,
        ScSpecTypeDef::U64,
    ];
    for (input, expected) in creation.inputs.iter().zip(expected) {
        assert_eq!(input.type_, expected);
    }
    let entries: &[&[u8]] = &[
        &ArisanRooms::spec_xdr_create_scheduled_room(),
        &ArisanRooms::spec_xdr_scheduled_version(),
        &ArisanRooms::spec_xdr_scheduled_contract_info(),
        &ArisanRooms::spec_xdr_scheduled_room_info(),
        &ArisanRooms::spec_xdr_initialize_scheduled(),
        &ArisanRooms::spec_xdr_scheduled_only(),
        &RoomSchedule::spec_xdr(),
        &ScheduledContractInfo::spec_xdr(),
    ];
    std::print!("SCHEDULED_SPEC_HEX=");
    for entry in entries {
        for byte in *entry {
            std::print!("{byte:02x}");
        }
    }
    std::println!();
}

#[test]
fn scheduled_creation_authorization_binds_all_eight_new_arguments() {
    use soroban_sdk::{testutils::AuthorizedFunction, IntoVal};
    let env = fresh_env();
    let host = account_address(&env, 1);
    let admin = Address::generate(&env);
    let (token_id, _, _) = setup(&env, &admin);
    let contract_id = env.register(ArisanRooms, ());
    let client = ArisanRoomsClient::new(&env, &contract_id);
    client.initialize_scheduled(&token_id);
    let code = Symbol::new(&env, "AUTH88");
    let name = SorobanString::from_str(&env, "Authorize agreed terms");
    let deadline = env.ledger().timestamp() + DAY;
    let draw = deadline + FIRST_COMMIT_WINDOW + SCHEDULED_REVEAL_WINDOW;
    client.create_scheduled_room(&host, &code, &name, &3, &100, &(13 * DAY), &draw, &deadline);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, host);
    assert!(auths[0].1.sub_invocations.is_empty());
    assert_eq!(
        auths[0].1.function,
        AuthorizedFunction::Contract((
            contract_id,
            Symbol::new(&env, "create_scheduled_room"),
            (host, code, name, 3u32, 100i128, 13 * DAY, draw, deadline).into_val(&env),
        ))
    );
}

#[test]
fn scheduled_all_overdue_rounds_can_catch_up_to_done_without_new_commitments() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, id, schedule) = scheduled_room(&env, &host, &m1, &m2, 1);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    seat_and_fund_installment_members(&client, id, &host, &m1, &m2);
    client.start_room(&id, &host);
    set_ts(&env, schedule.first_draw_at + 2 * DAY + 1);
    let mut winners: Vec<Address> = Vec::new(&env);
    for round in 1..=3 {
        assert_eq!(client.draw_phase(&id), DrawPhase::Finalizable);
        assert_eq!(client.commit_count(&id, &round), 0);
        assert_eq!(client.reveal_count(&id, &round), 0);
        let winner = client.finalize_draw(&id, &m1);
        assert!(!winners.iter().any(|previous| previous == winner));
        winners.push_back(winner);
        assert_eq!(client.funding_state(&id).pooled, 900 - 300 * round as i128);
        // Advancing KocokAt never rewrites the original creation agreement.
        assert_eq!(client.get_room(&id).first_kocok, schedule.first_commit_at);
        assert_eq!(client.scheduled_room_info(&id), schedule);
        assert_eq!(
            client.kocok_at(&id, &round),
            schedule.first_commit_at + (round as u64 - 1) * DAY
        );
    }
    assert_eq!(client.get_room(&id).status, RoomStatus::Done);
    assert_eq!(token.balance(&contract_id), 0);
    for member in [&host, &m1, &m2] {
        assert_eq!(token.balance(member), 1_000);
    }
    assert_eq!(
        client.try_finalize_draw(&id, &host),
        Err(Ok(Error::WrongStatus))
    );
}

#[test]
fn scheduled_late_payout_then_emergency_refund_cannot_strand_remaining_escrow() {
    let env = fresh_env();
    let host = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let (contract_id, token_id, id, schedule) = scheduled_room(&env, &host, &m1, &m2, 1);
    let client = ArisanRoomsClient::new(&env, &contract_id);
    let token = TokenClient::new(&env, &token_id);
    seat_and_fund_installment_members(&client, id, &host, &m1, &m2);
    client.start_room(&id, &host);
    set_ts(&env, schedule.first_draw_at + DAY + GRACE_PERIOD);
    client.finalize_draw(&id, &host);
    assert_eq!(client.get_room(&id).round, 2);
    assert_eq!(client.draw_phase(&id), DrawPhase::Finalizable);
    assert_eq!(client.funding_state(&id).pooled, 600);
    client.emergency_dissolve(&id, &m2);
    assert_eq!(client.get_room(&id).status, RoomStatus::Dissolved);
    assert_eq!(client.get_room(&id).first_kocok, schedule.first_commit_at);
    assert_eq!(client.funding_state(&id).pooled, 0);
    assert_eq!(token.balance(&contract_id), 0);
    for member in [&host, &m1, &m2] {
        assert_eq!(token.balance(member), 1_000);
    }
}
