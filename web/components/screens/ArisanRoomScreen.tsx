"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  arisanRoomState,
  arisanStart,
  arisanCancel,
  arisanLeave,
  arisanKocok,
  arisanFriendsJoin,
  arisanPostpone,
} from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  Avatar,
  Peso,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatLocal } from "@/lib/ui/currency";

type State = Awaited<ReturnType<typeof arisanRoomState>>;
type KocokResult = Awaited<ReturnType<typeof arisanKocok>>;

const RING = ["#FDE6D9", "#DCEAF8", "#E8E3FA", "#DDF1E5", "#FBEAE0", "#E1ECF6"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return "ready";
  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ringPos(i: number, total: number, r: number, w: number) {
  const a = (i / total) * Math.PI * 2 - Math.PI / 2;
  return {
    left: `calc(50% + ${Math.cos(a) * r}px - ${w / 2}px)`,
    top: `calc(50% + ${Math.sin(a) * r}px - ${w / 2}px)`,
  };
}

// ─────────────────────────────────────────────────────────────
// Kocok roulette overlay — lands on the winner the contract returned.
// HONESTY: the winner is drawn ON-CHAIN, not in the browser. arisanKocok
// seals a Soroban-PRNG seed for the round (seal_kocok), then the deterministic
// kocok pays unwon[seed % pool.len] and returns that member's Address. The
// overlay spins to the seat matching that Address — no browser CSPRNG, no
// caller choice, and no Math.random for the visual landing.
// ─────────────────────────────────────────────────────────────
function Roulette({
  seats,
  winnerIdx,
  onDone,
}: {
  seats: { addr: string; label: string; won: boolean; isYou: boolean }[];
  winnerIdx: number;
  onDone: () => void;
}) {
  const { t } = useT();
  const [phase, setPhase] = useState<"spin" | "land">("spin");
  const [pointer, setPointer] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let i = 0;
    tickRef.current = setInterval(() => {
      i++;
      setPointer((p) => (p + 1) % seats.length);
      // Decelerate then land on winnerIdx.
      if (i > 18) {
        if (tickRef.current) clearInterval(tickRef.current);
        setPointer(winnerIdx);
        setPhase("land");
        setTimeout(onDone, 1800);
      }
    }, 80);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerIdx]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(11,18,32,0.86)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ color: "#fff", fontWeight: 700, letterSpacing: "0.16em", fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}>
        {phase === "spin" ? t("arisan.kocok.spinning") : t("arisan.kocok.winner")}
      </div>
      <div style={{ position: "relative", width: 280, height: 280, marginTop: 14 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 99, border: "2px dashed rgba(255,255,255,0.25)" }} />
        {seats.map((m, i) => {
          const pos = ringPos(i, seats.length, 110, 56);
          const active = i === pointer;
          return (
            <div
              key={m.addr}
              style={{
                position: "absolute",
                ...pos,
                width: 56,
                height: 56,
                borderRadius: 99,
                background: RING[i % RING.length],
                color: "#3d2a18",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: active ? 18 : 14,
                fontWeight: 700,
                transition: "all .25s",
                boxShadow: active
                  ? "0 0 0 4px #fff, 0 0 32px 8px rgba(255,255,255,.45)"
                  : "inset 0 0 0 1px rgba(255,255,255,0.2)",
                transform: active ? "scale(1.18)" : "scale(1)",
              }}
            >
              {m.label.trim().charAt(0).toUpperCase()}
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            inset: "50% 50% auto auto",
            transform: "translate(50%, -50%)",
            width: 120,
            height: 120,
            borderRadius: 99,
            background: "rgba(255,255,255,0.07)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.6 }}>
            {t("arisan.kocok.kocok")}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {phase === "land" ? seats[winnerIdx]?.label.slice(0, 10) : "•••"}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18, color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
        {phase === "spin"
          ? t("arisan.kocok.spinFooter")
          : t("arisan.kocok.landFooter")}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen — polymorphic per RoomStatus.
// ─────────────────────────────────────────────────────────────
export default function ArisanRoomScreen({ roomId }: { roomId: number }) {
  const { t, currency } = useT();
  const router = useRouter();
  const [st, setSt] = useState<State | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string; link?: string } | null>(null);
  const [pending, start] = useTransition();
  const [roulette, setRoulette] = useState<{
    winnerIdx: number;
    link?: string;
    winnerLabel: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setSt(await arisanRoomState(roomId));
  }
  useEffect(() => {
    refresh();
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function run<
    T extends { ok: boolean; link?: string; error?: string; errorKey?: string },
  >(fn: () => Promise<T>, okText: string) {
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.ok) {
        setMsg({ tone: "ok", text: okText, link: r.link });
      } else {
        // Prefer the i18n key the action attached (e.g. arisanPostpone maps
        // contract error codes to keys) so the toast is human-readable
        // instead of a raw HostError / XDR dump.
        const text = r.errorKey
          ? t(r.errorKey)
          : r.error || t("arisan.somethingWrong");
        setMsg({ tone: "err", text });
      }
      await refresh();
    });
  }

  function doKocok() {
    start(async () => {
      setMsg(null);
      const r: KocokResult = await arisanKocok(roomId);
      if (!r.ok) {
        setMsg({ tone: "err", text: r.error || t("arisan.somethingWrong") });
        return;
      }
      // Find winner index by address — the contract is the source of truth.
      const idx = st && st.ready ? st.seats.findIndex((s) => s.addr === r.winner) : -1;
      setRoulette({
        winnerIdx: Math.max(0, idx),
        link: r.link,
        winnerLabel: r.winnerLabel,
      });
    });
  }

  function copyCode() {
    if (!st || !st.ready || !st.code) return;
    navigator.clipboard?.writeText(st.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 130,
  };

  if (st === null) {
    return (
      <div style={shell}>
        <AppBar
          leading={
            <IconButton onClick={() => router.push("/arisan")}>{Ico.back({})}</IconButton>
          }
          title={t("arisan.room.title")}
        />
        <div style={{ padding: "60px 24px", textAlign: "center", color: T.slate, fontSize: 14 }}>
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (!st.ready) {
    return (
      <div style={shell}>
        <AppBar
          leading={
            <IconButton onClick={() => router.push("/arisan")}>{Ico.back({})}</IconButton>
          }
          title={t("arisan.room.title")}
        />
        <div style={{ padding: "30px 24px", textAlign: "center", color: T.slate, fontSize: 14 }}>
          {t("arisan.room.notFound")}
        </div>
      </div>
    );
  }

  const totalSeats = Math.max(st.seats.length, st.memberTarget);
  const countdown = Math.max(0, st.nextKocok - now);
  const canKocokNow =
    st.status === "Active" && countdown === 0 && st.round <= st.memberTarget;

  return (
    <div style={shell}>
      {roulette && (
        <Roulette
          seats={st.seats}
          winnerIdx={roulette.winnerIdx}
          onDone={() => {
            setMsg({
              tone: "ok",
              text: t("arisan.kocok.wonText", { who: roulette.winnerLabel, pot: st.potPeso }),
              link: roulette.link,
            });
            setRoulette(null);
            refresh();
          }}
        />
      )}

      <AppBar
        leading={
          <IconButton onClick={() => router.push("/arisan")}>{Ico.back({})}</IconButton>
        }
        title={st.name}
      />

      {/* Status row */}
      <div style={{ padding: "4px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Chip
            kind={
              st.status === "Open"
                ? "action"
                : st.status === "Active"
                  ? "success"
                  : st.status === "Done"
                    ? "neutral"
                    : "warn"
            }
          >
            {t("arisan.status." + st.status)}
          </Chip>
          <Chip kind="neutral">{t("arisan.cadence." + st.cadence)}</Chip>
        </div>
        <Chip kind="warn" leading={Ico.sparkle({ size: 11, c: "#9a6b1c" })}>
          {t("arisan.previewBadge")}
        </Chip>
      </div>

      {/* Visual ring */}
      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ position: "relative", width: "100%", height: 240, background: T.surface, borderRadius: 20, boxShadow: "inset 0 0 0 1px " + T.hairline, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: "24px 50px", borderRadius: 99, border: "2px dashed " + T.hairline }} />
          {Array.from({ length: totalSeats }).map((_, i) => {
            const seat = st.seats[i];
            const pos = ringPos(i, totalSeats, 84, 44);
            const w = 44;
            const filled = !!seat;
            return (
              <div key={i} style={{ position: "absolute", ...pos, width: w, height: w, transition: "all .4s" }}>
                <div
                  style={{
                    width: w,
                    height: w,
                    borderRadius: 99,
                    background: filled ? RING[i % RING.length] : "transparent",
                    color: "#3d2a18",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    boxShadow: filled
                      ? seat!.won
                        ? "inset 0 0 0 2px " + T.moneyIn
                        : "inset 0 0 0 1px " + T.hairline
                      : "inset 0 0 0 1px " + T.hairline,
                    position: "relative",
                  }}
                >
                  {filled ? seat!.label.trim().charAt(0).toUpperCase() : "+"}
                  {filled && seat!.won && (
                    <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 99, background: T.moneyIn, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px " + T.surface }}>
                      {Ico.check({ size: 10, c: "#fff" })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 116, height: 116, borderRadius: 99, background: T.ink, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, boxShadow: "0 10px 28px -8px rgba(11,18,32,.4)" }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
              {t("arisan.pot")}
            </div>
            <Peso value={st.potPesos} size={18} weight={600} color="#fff" />
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: T.fontMono }}>
              {st.memberCount}/{st.memberTarget}
            </div>
          </div>
        </div>
      </div>

      {/* Info card */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card p={14}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                {t("arisan.share")}
              </div>
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                {formatLocal(st.sharePesos, currency)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                {st.status === "Open" ? t("arisan.firstKocokIn") : t("arisan.nextKocokIn")}
              </div>
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                {st.status === "Done" || st.status === "Dissolved"
                  ? "—"
                  : fmtCountdown(countdown)}
              </div>
            </div>
          </div>
          {st.status === "Active" && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, background: T.canvas, fontSize: 12, color: T.slate }}>
              {t("arisan.room.roundLine", {
                n: pad2(Math.min(st.round, st.memberTarget)),
                total: pad2(st.memberTarget),
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Invite code (members only) */}
      {st.code && st.status === "Open" && (
        <div style={{ padding: "12px 16px 0" }}>
          <Card p={14}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                  {t("arisan.room.inviteCode")}
                </div>
                <div style={{ marginTop: 4, fontFamily: T.fontMono, fontSize: 22, fontWeight: 700, letterSpacing: "0.16em" }}>
                  {st.code}
                </div>
              </div>
              <Btn kind="quiet" size="md" full={false} onClick={copyCode} leading={Ico.link({ size: 14, c: T.action })}>
                {copied ? t("arisan.room.copied") : t("arisan.room.copy")}
              </Btn>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: T.slate, lineHeight: 1.5 }}>
              {t("arisan.room.inviteBody")}
            </div>
          </Card>
        </div>
      )}

      {/* Members list */}
      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate, marginBottom: 8 }}>
          {t("arisan.members")}
        </div>
        <Card p={0}>
          {st.seats.map((s, i) => (
            <div
              key={s.addr}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderBottom: i < st.seats.length - 1 ? "1px solid " + T.hairline : "none",
              }}
            >
              <Avatar name={s.label} size={28} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
                {s.label}
                {s.isYou && <span style={{ marginLeft: 6, color: T.action, fontSize: 12 }}>· {t("arisan.you")}</span>}
              </div>
              {s.won ? (
                <Chip kind="success" size="sm" leading={Ico.check({ size: 11, c: T.moneyIn })}>
                  {t("arisan.statusWon")}
                </Chip>
              ) : (
                <Chip kind="neutral" size="sm">
                  {t("arisan.statusWaiting")}
                </Chip>
              )}
            </div>
          ))}
        </Card>
      </div>

      {/* History (when Active or Done) */}
      {st.winners.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate, marginBottom: 8 }}>
            {t("arisan.history")}
          </div>
          <Card p={0}>
            {st.winners.map((w, i) => (
              <div
                key={w.round}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderBottom: i < st.winners.length - 1 ? "1px solid " + T.hairline : "none",
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 99, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                  {pad2(w.round)}
                </div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
                  {w.label}
                </div>
                <div style={{ fontSize: 12, color: T.slate }}>
                  {formatLocal(st.sharePesos * st.memberTarget, currency)}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Toast */}
      {msg && (
        <div style={{ padding: "16px 16px 0" }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: msg.tone === "ok" ? T.moneyInTint : T.warnTint,
              color: msg.tone === "ok" ? T.moneyIn : T.warn,
              fontSize: 13,
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{msg.text}</span>
            {msg.link && (
              <a href={msg.link} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", fontSize: 12 }}>
                {t("paluwagan.viewOnStellar")}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: "20px 16px 0", display: "grid", gap: 10 }}>
        {/* OPEN: host controls + invite/leave */}
        {st.status === "Open" && (
          <>
            {st.memberCount < st.memberTarget && (
              <Btn
                kind="secondary"
                onClick={() =>
                  run(
                    () => arisanFriendsJoin(st.id),
                    t("arisan.room.friendsJoinedOk")
                  )
                }
                disabled={pending}
                loading={pending && !roulette}
                leading={Ico.plus({ size: 14, c: T.ink })}
              >
                {t("arisan.room.friendsJoinCta")}
              </Btn>
            )}
            {st.readyToStart && (
              <Btn
                kind="primary"
                onClick={() => run(() => arisanStart(st.id), t("arisan.room.startedOk"))}
                disabled={pending}
                loading={pending && !roulette}
              >
                {t("arisan.room.startCta")}
              </Btn>
            )}
            {st.isHost ? (
              <Btn
                kind="ghost"
                onClick={() => run(() => arisanCancel(st.id), t("arisan.room.cancelledOk"))}
                disabled={pending}
              >
                {t("arisan.room.cancelCta")}
              </Btn>
            ) : (
              <Btn
                kind="ghost"
                onClick={() => run(() => arisanLeave(st.id), t("arisan.room.leftOk"))}
                disabled={pending}
              >
                {t("arisan.room.leaveCta")}
              </Btn>
            )}
          </>
        )}

        {/* ACTIVE: kocok button + host-only postpone */}
        {st.status === "Active" && st.round <= st.memberTarget && (
          <>
            <Btn
              kind="primary"
              onClick={doKocok}
              disabled={!canKocokNow || pending || !!roulette}
              loading={pending && !roulette}
            >
              {canKocokNow
                ? t("arisan.kocok.cta", { pot: st.potPeso })
                : t("arisan.kocok.waitCta", { time: fmtCountdown(countdown) })}
            </Btn>
            {st.isHost && (
              <Btn
                kind="ghost"
                onClick={() =>
                  run(
                    () => arisanPostpone(st.id, 60),
                    t("arisan.room.postponingOk")
                  )
                }
                disabled={pending}
              >
                {t("arisan.room.postponeCta")}
              </Btn>
            )}
          </>
        )}

        {/* DONE */}
        {st.status === "Done" && (
          <Card p={16} style={{ background: T.moneyInTint }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.moneyIn }}>
              {t("arisan.room.doneTitle")}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
              {t("arisan.room.doneBody")}
            </div>
          </Card>
        )}

        {/* DISSOLVED */}
        {st.status === "Dissolved" && (
          <Card p={16} style={{ background: T.warnTint }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.warn }}>
              {t("arisan.room.dissolvedTitle")}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
              {t("arisan.room.dissolvedBody")}
            </div>
          </Card>
        )}
      </div>

      <div style={{ padding: "20px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
