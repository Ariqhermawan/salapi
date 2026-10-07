import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = (path: string) => ts.transpileModule(source(path), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}

test("shared Stellar attribution uses the same small scale despite legacy size props", () => {
  const exports = {} as { PoweredByStellarV2(props: { size?: number; c?: string }): Element };
  runInNewContext(compile("../components/ui/brand.tsx"), {
    exports, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/ui/tokens") return { T: { slate: "#5B6472", fontSans: "sans-serif" } };
      throw Error(`Unexpected brand dependency: ${name}`);
    },
  });
  for (const size of [undefined, 8, 11, 20, 32]) for (const c of [undefined, "#fff", "rgba(255,255,255,.7)"]) {
    const tree = exports.PoweredByStellarV2({ size, c });
    const style = tree.props.style as { fontSize: number; lineHeight: string; padding: string; gap: number };
    assert.equal(tree.props["data-brand-attribution"], "stellar");
    assert.equal(style.fontSize, 11); assert.equal(style.lineHeight, "16px");
    assert.equal(style.padding, "2px 8px"); assert.equal(style.gap, 6);
    const logo = nodes(tree).find(element => element.type === "img")!;
    assert.equal(logo.props.height, 16); assert.equal(logo.props.alt, "Stellar");
    assert.equal(logo.props.src, c === undefined ? "/stellar.png" : "/stellar-white.png");
    assert.equal((logo.props.style as { height: number; width: string }).height, 16);
    assert.equal((logo.props.style as { height: number; width: string }).width, "auto");
  }
});

test("desktop marketing footer reuses shared Stellar attribution instead of enlarging or filtering its logo", () => {
  const exports = {} as { default(): Element };
  runInNewContext(compile("../components/MarketingAside.tsx"), {
    exports, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name === "@/components/ui/kit") return { Wordmark: "Wordmark", MakerLockup: "MakerLockup", PoweredByStellar: "PoweredByStellar" };
      throw Error(`Unexpected marketing dependency: ${name}`);
    },
  });
  const tree = exports.default();
  const footer = nodes(tree).find(element => element.type === "footer")!;
  const brand = nodes(footer).find(element => element.type === "PoweredByStellar")!;
  assert.equal(brand.props.c, "#fff");
  assert.equal(nodes(footer).some(element => element.type === "Image"), false);
  assert.doesNotMatch(source("../app/globals.css"), /\.sl-marketing-footer\s+img\s*\{/);
  assert.equal((source("../components/MarketingAside.tsx").match(/Powered by/g) ?? []).length, 0);
});

test("CoinGecko local assets are the unchanged official light and dark SVG lockups", () => {
  for (const [name, hash] of [
    ["coingecko.svg", "220be75f27b083773b90458592690e86fb295c1e3d4b7e35ca523ff6b18de80a"],
    ["coingecko-white.svg", "246e1693254aa048dbd691c374ce017ae687b00e9cd1888a59243c4542ae7ecf"],
  ]) {
    const svg = source(`../public/brands/${name}`);
    assert.equal(createHash("sha256").update(svg).digest("hex"), hash);
    assert.match(svg, /^<svg width="1000" height="219" viewBox="0 0 1000 219"/);
    assert.doesNotMatch(svg, /<(?:script|foreignObject|image|use)\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=|javascript:/i);
  }
  // The Brand Kit variants have different foregrounds. Check the actual first
  // wordmark paths, not a filename assumption, to prevent invisible attribution.
  assert.match(source("../public/brands/coingecko.svg"), /fill="white"/);
  assert.match(source("../public/brands/coingecko-white.svg"), /fill="#0D1217"/);
});
