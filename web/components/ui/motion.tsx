"use client";

// Zero-dependency motion kit. Design-agnostic primitives the eventual
// claude.ai/design output can compose. Honors prefers-reduced-motion.

import { useEffect, useRef, useState } from "react";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const fn = () => setReduced(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);
  return reduced;
}

/** Smoothly counts a number up when it changes (e.g. the balance). */
export function CountUp({
  value,
  prefix = "",
  duration = 700,
  className,
}: {
  value: number;
  prefix?: string;
  duration?: number;
  className?: string;
}) {
  const [n, setN] = useState(value);
  const from = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setN(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return (
    <span className={className}>
      {prefix}
      {Math.round(n).toLocaleString("en-PH")}
    </span>
  );
}

/** Fade + rise in, with optional stagger index. */
export function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`s-anim-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** An animated success checkmark for confirmations. */
export function SuccessCheck({ size = 56 }: { size?: number }) {
  const reduced = useReducedMotion();
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden>
      <circle
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke="var(--color-money)"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M14 27 L23 35 L38 18"
        fill="none"
        stroke="var(--color-money)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          reduced
            ? undefined
            : {
                strokeDasharray: 48,
                strokeDashoffset: 48,
                animation: "s-check 0.5s 0.1s ease forwards",
              }
        }
      />
    </svg>
  );
}

/** Tasteful confetti burst (DOM, no canvas, auto-cleans). */
export function Confetti({ fire }: { fire: boolean }) {
  const reduced = useReducedMotion();
  if (!fire || reduced) return null;
  const colors = ["#2563eb", "#059669", "#f59e0b", "#1d4ed8"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${50 + (Math.random() * 40 - 20)}%`,
            top: "30%",
            width: 8,
            height: 8,
            background: colors[i % colors.length],
            borderRadius: i % 2 ? "50%" : "2px",
            animation: `s-confetti ${0.9 + Math.random()}s ${
              Math.random() * 0.2
            }s ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
}
