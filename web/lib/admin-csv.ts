// CSV export of the admin user directory. Pure: rows in, file text out.
import { SEGMENT_LABEL, accountSegment, providerLabel, type AdminAccountRow, type AdminQuery, type Lookup } from "./admin-users.ts";

const HEADER = ["daftar_wib", "email", "username", "wallet_address", "tx_terkirim", "segmen", "login_via", "terakhir_masuk_wib", "user_id", "admin"];
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "2026-11-19 23:11" in WIB, or "" when the timestamp is missing or invalid. */
export function wibDateTime(iso: string | null | undefined): string {
  const time = Date.parse(iso ?? "");
  return Number.isFinite(time) ? new Date(time + WIB_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") : "";
}

/**
 * One RFC 4180 field. A value that starts like a formula (= + - @ tab CR) is
 * prefixed with ' so spreadsheet apps keep it as text (CSV injection guard).
 */
export function csvField(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// A failed read is written out as such, never as an empty value that looks confirmed.
const lookup = <T>(value: Lookup<T>, show: (value: T) => string = String): string =>
  value.status === "ok" ? show(value.value) : value.status === "none" ? "" : "gagal dimuat";

/** e.g. "salapi-pengguna-real-2026-11-2026-11-20.csv": segment, month filter, export date (WIB). */
export function adminCsvFilename(query: AdminQuery, now: Date): string {
  return `salapi-pengguna-${query.segment}${query.month ? `-${query.month}` : ""}-${wibDateTime(now.toISOString()).slice(0, 10)}.csv`;
}

/**
 * UTF-8 with BOM (so Excel reads non-ASCII correctly) and CRLF line ends.
 * Usernames are written without "@": Excel would read "@name" as a formula.
 */
export function adminUsersCsv(rows: readonly AdminAccountRow[], adminIds: ReadonlySet<string>): string {
  const lines = rows.map(({ user, wallet, username, sentTx }) => [
    wibDateTime(user.created_at),
    user.email ?? "",
    lookup(username),
    lookup(wallet),
    lookup(sentTx),
    SEGMENT_LABEL[accountSegment(user)],
    providerLabel(user),
    wibDateTime(user.last_sign_in_at),
    user.id,
    adminIds.has(user.id.toLowerCase()) ? "ya" : "",
  ]);
  return "﻿" + [HEADER, ...lines].map(fields => fields.map(csvField).join(",")).join("\r\n") + "\r\n";
}
