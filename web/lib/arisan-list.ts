/** Inclusive start-ID cursor. Every request examines at most 50 room IDs. */
export function arisanRoomPage(count: number, cursor?: unknown, pageSize = 50): { ids: number[]; nextCursor: number | null } {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error("Room count is unavailable. Please retry.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new Error("Invalid room page size");
  if (cursor !== undefined && (typeof cursor !== "number" || !Number.isSafeInteger(cursor) || cursor < 1 || cursor > count))
    throw new Error("Invalid room cursor");
  const start = cursor === undefined ? count : cursor as number;
  const length = Math.min(start, pageSize, 50);
  const ids = Array.from({ length }, (_, index) => start - index);
  return { ids, nextCursor: start > length ? start - length : null };
}

/** Backwards-compatible first-page helper; malformed inputs remain inert. */
export function newestRoomIds(count: number, pageSize = 50): number[] {
  try { return arisanRoomPage(count, undefined, pageSize).ids; } catch { return []; }
}
