import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { accountCopy } from "../lib/i18n/revamp-account.ts";
import { LOCALES } from "../lib/i18n/config.ts";

const source = readFileSync(new URL("../components/screens/SettingsScreen.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("SettingsScreen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions: ts.FunctionDeclaration[] = [];
const buttons: ts.JsxElement[] = [];
const alerts: ts.JsxElement[] = [];
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "signOut") functions.push(node);
  if (ts.isJsxElement(node)) {
    if (node.openingElement.tagName.getText(ast) === "button") buttons.push(node);
    if (node.openingElement.attributes.properties.some(attribute =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "role"
      && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "alert")) alerts.push(node);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(functions.length, 1, "Extract the unique actual signOut handler, not a copied implementation");
const handlerSource = functions[0].getText(ast);

type AuthResult = { error: unknown };
type AuthCall = (...args: unknown[]) => Promise<AuthResult>;

// Execute the exact Settings handler with isolated closure dependencies. These
// tests do not access browser credentials, provider APIs, or network sessions.
function setup(authCall: AuthCall, options: { preview?: boolean; factoryThrows?: boolean; navigationThrows?: boolean } = {}) {
  const state = { pending: false, error: false };
  const signOutInFlight = { current: false };
  const calls = { factories: 0, auth: [] as unknown[][], redirects: [] as string[], pushes: [] as string[] };
  const location = { origin: "https://salapi.example" };
  Object.defineProperty(location, "href", {
    set(value: string) {
      if (options.navigationThrows) throw new Error("Isolated navigation failure");
      calls.redirects.push(value);
    },
  });
  const signOut = runInNewContext(`${handlerSource}; signOut;`, {
    isLocalPreview: options.preview ?? false,
    signOutInFlight,
    setSignOutPending(value: boolean) { state.pending = value; },
    setSignOutError(value: boolean) { state.error = value; },
    router: { push(value: string) { calls.pushes.push(value); } },
    window: { location },
    URL,
    createSupabaseBrowser() {
      calls.factories++;
      if (options.factoryThrows) throw new Error("Isolated client setup failure");
      return { auth: { signOut(...args: unknown[]) { calls.auth.push(args); return authCall(...args); } } };
    },
  }) as () => Promise<void>;
  return { signOut, state, signOutInFlight, calls };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("a resolved provider error stays on Settings and permits retry", async () => {
  const screen = setup(async () => ({ error: { status: 503 } }));
  await screen.signOut();
  assert.equal(screen.calls.auth.length, 1);
  assert.deepEqual(screen.calls.redirects, []);
  assert.deepEqual(screen.calls.pushes, []);
  assert.deepEqual(screen.state, { pending: false, error: true });
  assert.equal(screen.signOutInFlight.current, false);
});

test("a rejected provider request reports failure without navigation", async () => {
  const screen = setup(async () => { throw new Error("Isolated network failure"); });
  await screen.signOut();
  assert.equal(screen.calls.auth.length, 1);
  assert.deepEqual(screen.calls.redirects, []);
  assert.deepEqual(screen.state, { pending: false, error: true });
  assert.equal(screen.signOutInFlight.current, false);
});

test("client setup failure also leaves a retryable error", async () => {
  const screen = setup(async () => ({ error: null }), { factoryThrows: true });
  await screen.signOut();
  assert.equal(screen.calls.auth.length, 0);
  assert.deepEqual(screen.calls.redirects, []);
  assert.deepEqual(screen.state, { pending: false, error: true });
});

test("only successful global sign out redirects and holds the guard until unload", async () => {
  const screen = setup(async () => ({ error: null }));
  await screen.signOut();
  assert.deepEqual(screen.calls.auth, [[]], "Keep the existing SDK default global scope, without substituting local scope");
  assert.deepEqual(screen.calls.redirects, ["https://salapi.example/signin"]);
  assert.deepEqual(screen.calls.pushes, []);
  assert.deepEqual(screen.state, { pending: true, error: false });
  await screen.signOut();
  assert.equal(screen.calls.auth.length, 1, "Navigation has not unloaded the component yet; another click must not send again");
  assert.deepEqual(screen.calls.redirects, ["https://salapi.example/signin"]);
});

test("two synchronous clicks issue one request before React can rerender", async () => {
  const request = deferred<AuthResult>();
  const screen = setup(() => request.promise);
  const first = screen.signOut();
  const duplicate = screen.signOut();
  assert.equal(screen.calls.auth.length, 1);
  assert.equal(screen.signOutInFlight.current, true);
  assert.deepEqual(screen.state, { pending: true, error: false });
  assert.deepEqual(screen.calls.redirects, []);
  request.resolve({ error: { status: 503 } });
  await Promise.all([first, duplicate]);
  assert.deepEqual(screen.state, { pending: false, error: true });
});

test("retry clears the previous error, waits, and redirects only after confirmation", async () => {
  const retry = deferred<AuthResult>();
  let attempts = 0;
  const screen = setup(() => ++attempts === 1 ? Promise.resolve({ error: { status: 503 } }) : retry.promise);
  await screen.signOut();
  const pending = screen.signOut();
  assert.equal(screen.calls.auth.length, 2);
  assert.deepEqual(screen.state, { pending: true, error: false });
  assert.deepEqual(screen.calls.redirects, []);
  retry.resolve({ error: null });
  await pending;
  assert.deepEqual(screen.calls.redirects, ["https://salapi.example/signin"]);
  assert.equal(screen.state.error, false);
});

test("local preview retains router-only navigation without auth or session writes", async () => {
  const screen = setup(async () => { throw new Error("Local preview must not call auth"); }, { preview: true });
  await screen.signOut();
  assert.equal(screen.calls.factories, 0);
  assert.deepEqual(screen.calls.auth, []);
  assert.deepEqual(screen.calls.redirects, []);
  assert.deepEqual(screen.calls.pushes, ["/signin"]);
  assert.deepEqual(screen.state, { pending: false, error: false });
});

test("a blocked navigation does not leave the button permanently busy", async () => {
  const screen = setup(async () => ({ error: null }), { navigationThrows: true });
  await screen.signOut();
  assert.deepEqual(screen.calls.redirects, []);
  assert.deepEqual(screen.state, { pending: false, error: true });
  assert.equal(screen.signOutInFlight.current, false);
});

test("the account button is wired to this handler, busy state and localized retry alert", () => {
  function attribute(element: ts.JsxElement, name: string) {
    return element.openingElement.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(ast) === name) as ts.JsxAttribute | undefined;
  }
  const logout = buttons.filter(button => attribute(button, "onClick")?.initializer?.getText(ast) === "{signOut}");
  assert.equal(logout.length, 1);
  assert.equal(attribute(logout[0], "type")?.initializer?.getText(ast), '"button"');
  assert.equal(attribute(logout[0], "disabled")?.initializer?.getText(ast), "{signOutPending}");
  assert.equal(attribute(logout[0], "aria-busy")?.initializer?.getText(ast), "{signOutPending}");
  assert.ok(logout[0].children.some(child => ts.isJsxExpression(child)
    && child.expression?.getText(ast) === 'signOutPending ? c.signingOut : t("settings.signOut")'));
  const failure = alerts.find(alert => alert.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(ast) === "c.signOutError"));
  assert.ok(failure, "Expose the localized failure in an accessible inline alert");
  assert.equal(failure.parent.getText(ast), 'signOutError ? <p role="alert" className={styles.loadError}>{c.signOutError}</p> : null');
});

test("busy and retry copy are present and distinct in all four supported languages", () => {
  assert.equal(LOCALES.length, 4);
  for (const key of ["signingOut", "signOutError"] as const) {
    const values = LOCALES.map(locale => accountCopy(locale)[key]);
    assert.equal(new Set(values).size, 4, `${key} must not silently fall back to English`);
    for (const value of values) {
      assert.ok(value.trim());
      assert.doesNotMatch(value, /\{\w+\}|—/);
    }
  }
  assert.match(accountCopy("id").signOutError, /Silakan coba lagi/);
  assert.match(accountCopy("en").signOutError, /try again/);
  assert.match(accountCopy("tl").signOutError, /Subukan muli/);
  assert.match(accountCopy("vi").signOutError, /thử lại/);
});
