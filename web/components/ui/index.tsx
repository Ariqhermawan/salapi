"use client";

// Token-driven primitive library. Restyle the whole app from ONE place when
// the claude.ai/design system arrives. Every screen should compose these.

import { forwardRef } from "react";

function cx(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "success";
}) {
  const base =
    variant === "ghost"
      ? "s-btn-ghost w-full"
      : "s-btn";
  const style =
    variant === "success"
      ? { background: "var(--color-money)" }
      : undefined;
  return <button className={cx(base, className)} style={style} {...p} />;
}

export function Card({
  className,
  ...p
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("s-card", className)} {...p} />;
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx("s-input", className)} {...p} />;
});

export function Label({
  className,
  ...p
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cx("s-label", className)} {...p} />;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warn" | "success" | "active";
  children: React.ReactNode;
}) {
  const map = {
    neutral: { background: "#eef1f6", color: "var(--color-slate)" },
    warn: { background: "#fef3c7", color: "var(--color-warn)" },
    success: { background: "#d1fae5", color: "var(--color-money)" },
    active: { background: "#fee2e2", color: "#b91c1c" },
  } as const;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={map[tone]}
    >
      {children}
    </span>
  );
}

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cx("s-skeleton", className)} style={style} />;
}

export function Progress({ pct }: { pct: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-hairline)]">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: "linear-gradient(90deg,#2563eb,#059669)",
        }}
      />
    </div>
  );
}

export function Avatar({
  label,
  highlight,
}: {
  label: string;
  highlight?: boolean;
}) {
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
      style={{
        background: highlight
          ? "var(--color-money)"
          : "var(--color-action)",
      }}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Bottom sheet / modal. */
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="s-anim-up w-full max-w-[460px] rounded-t-2xl bg-[var(--color-surface)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Toast({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  const s =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-[var(--color-money)]"
      : "border-red-200 bg-red-50 text-red-700";
  return (
    <div className={cx("s-anim-pop rounded-xl border px-3 py-2.5 text-sm", s)}>
      {children}
    </div>
  );
}
