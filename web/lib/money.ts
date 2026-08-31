// Exact money boundary for values that enter a Soroban contract.
//
// User input is kept as a decimal string until it has become integer token
// units.  No floating-point operation belongs in this module: a one-stroop
// difference is still a real balance difference on-chain.

export type MoneyCurrency = "en" | "tl" | "id" | "vi";

export type MoneyInput = {
  amount: string;
  currency: MoneyCurrency;
};

export const STROOPS_PER_XLM = 10_000_000n;

type Ratio = { numerator: bigint; denominator: bigint };

// The display layer uses PHP as its stable anchor. These are the same
// illustrative rates shown in web/lib/ui/currency.ts, represented as exact
// rational values instead of JavaScript numbers.
const LOCAL_TO_PHP: Record<MoneyCurrency, Ratio> = {
  en: { numerator: 58n, denominator: 1n },
  tl: { numerator: 1n, denominator: 1n },
  id: { numerator: 58n, denominator: 16_000n },
  vi: { numerator: 58n, denominator: 25_500n },
};

const CURRENCIES = new Set<MoneyCurrency>(["en", "tl", "id", "vi"]);

function isMoneyCurrency(value: unknown): value is MoneyCurrency {
  return typeof value === "string" && CURRENCIES.has(value as MoneyCurrency);
}

/** Parse a non-negative decimal without Number(), parseFloat(), or rounding. */
function decimalRatio(raw: string): Ratio | null {
  const value = raw.trim();
  // Keep pathological input from creating an unbounded BigInt exponent.
  if (value.length === 0 || value.length > 64) return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;

  const dot = value.indexOf(".");
  const whole = dot < 0 ? value : value.slice(0, dot);
  const fraction = dot < 0 ? "" : value.slice(dot + 1);
  const digits = `${whole || "0"}${fraction}`;
  return {
    numerator: BigInt(digits || "0"),
    denominator: 10n ** BigInt(fraction.length),
  };
}

/** Deterministic half-up rounding for a non-negative rational value. */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

function ratioToStroops(value: Ratio, localToPhp: Ratio): bigint {
  // PHP → XLM is 2/13 XLM, and one XLM is 10,000,000 stroops.
  const numerator =
    value.numerator * localToPhp.numerator * STROOPS_PER_XLM * 2n;
  const denominator = value.denominator * localToPhp.denominator * 13n;
  return roundHalfUp(numerator, denominator);
}

/** Convert a PHP peso decimal string to integer stroops exactly. */
export function pesosToStroopsExact(pesos: string): bigint | null {
  const value = decimalRatio(pesos);
  return value ? ratioToStroops(value, { numerator: 1n, denominator: 1n }) : null;
}

/** Convert a localized user amount directly to integer stroops exactly. */
export function localToStroops(
  amount: string,
  currency: MoneyCurrency
): bigint | null {
  const value = decimalRatio(amount);
  if (!value || !isMoneyCurrency(currency)) return null;
  return ratioToStroops(value, LOCAL_TO_PHP[currency]);
}

/** Convert Horizon's decimal XLM balance to integer stroops exactly. */
export function nativeBalanceToStroops(balance: string): bigint | null {
  const value = decimalRatio(balance);
  return value
    ? roundHalfUp(value.numerator * STROOPS_PER_XLM, value.denominator)
    : null;
}

/** Validate a server-action money payload and return integer token units. */
export function moneyInputToStroops(input: unknown): bigint | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.amount !== "string" || !isMoneyCurrency(value.currency))
    return null;
  return localToStroops(value.amount, value.currency);
}

