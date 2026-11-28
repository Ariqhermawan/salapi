import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const navigatorPath = path.join(webRoot, "components/PrototypePreviewAside.tsx");
const layoutPath = path.join(webRoot, "app/layout.tsx");

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? pageFiles(fullPath) : entry.name === "page.tsx" ? [fullPath] : [];
  });
}

function routePattern(route: string): RegExp {
  const segments = route.split("/").filter(Boolean);
  let pattern = "^";
  for (const segment of segments) {
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) pattern += "(?:/[^/]+)*";
    else if (/^\[\.\.\.[^\]]+\]$/.test(segment)) pattern += "/.+";
    else if (/^\[[^\]]+\]$/.test(segment)) pattern += "/[^/]+";
    else pattern += `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  }
  if (segments.length === 0) pattern += "/";
  return new RegExp(`${pattern}/?$`);
}

test("prototype route navigator is mounted only for local preview", () => {
  const layout = readFileSync(layoutPath, "utf8");
  assert.match(layout, /import PrototypePreviewAside from "@\/components\/PrototypePreviewAside"/);
  assert.match(layout, /isLocalPreview\s*\?\s*<PrototypePreviewAside\s*\/>\s*:\s*<MarketingAside\s*\/>/);
});

test("every prototype navigator URL maps to an implemented app route", () => {
  const navigator = readFileSync(navigatorPath, "utf8");
  const routes = [...navigator.matchAll(/href:\s*"([^"]+)"/g)]
    .map(([, href]) => new URL(href, "http://local.invalid").pathname);
  const uniqueRoutes = [...new Set(routes)];
  const patterns = pageFiles(path.join(webRoot, "app"))
    .map(file => path.relative(path.join(webRoot, "app"), file))
    .map(file => file === "page.tsx" ? "/" : `/${file.replace(/\/page\.tsx$/, "")}`)
    .map(routePattern);
  const missing = uniqueRoutes.filter(route => !patterns.some(pattern => pattern.test(route)));

  assert.ok(uniqueRoutes.length >= 50, `Expected a comprehensive screen list; found ${uniqueRoutes.length} routes.`);
  assert.deepEqual(missing, [], `Prototype routes without an app page: ${missing.join(", ")}`);
});
