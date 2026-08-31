import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This is the committed D1 inventory boundary. UI formatting may use numbers,
// but every value entering a contract must pass through this exact module.
const INVENTORIED_PATHS = ["lib/money.ts"];
const FORBIDDEN = [
  ["Number or Number.*", /\bNumber\s*(?:\.|\()/g],
  ["parseFloat", /\bparseFloat\s*\(/g],
  ["parseInt", /\bparseInt\s*\(/g],
  ["Math rounding", /\bMath\s*\.\s*(?:round|floor|ceil)\s*\(/g],
  ["toFixed", /\.toFixed\s*\(/g],
  ["decimal numeric literal", /\b\d+\.\d+(?:[eE][+-]?\d+)?\b/g],
];

function findViolations(source, label) {
  // Comments can explain forbidden APIs without executing them; scan code
  // tokens only so the guard remains useful as documentation evolves.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const violations = [];
  for (const [kind, pattern] of FORBIDDEN) {
    pattern.lastIndex = 0;
    if (pattern.test(code)) violations.push(`${label}: ${kind}`);
  }
  return violations;
}

if (process.argv.includes("--seeded-violation")) {
  const seeded = "const tokenUnits = Number(rawAmount);";
  const found = findViolations(seeded, "seeded violation");
  if (found.length === 0) {
    console.error("money-path guard failed: seeded violation was not detected");
    process.exit(1);
  }
  console.log("seeded violation detected (expected failure path)");
}

const violations = [];
for (const relative of INVENTORIED_PATHS) {
  const file = resolve(fileURLToPath(new URL("..", import.meta.url)), relative);
  violations.push(...findViolations(readFileSync(file, "utf8"), relative));
}

if (violations.length > 0) {
  console.error("floating-point construct found in inventoried money path:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`money-path guard passed (${INVENTORIED_PATHS.join(", ")})`);
