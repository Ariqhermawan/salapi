import test from "node:test";
import assert from "node:assert/strict";
import { drawReceivePoster } from "../lib/receive-poster.ts";
import { receiveCopy } from "../lib/i18n/receive.ts";

const address = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";

function browserCanvas(context: CanvasRenderingContext2D | null) {
  const calls: { name: string; args: unknown[] }[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback: BlobCallback, type?: string) { callback(new Blob(["poster"], { type })); },
  } as unknown as HTMLCanvasElement;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset: { theme: "light" } }, createElement: () => canvas },
  });
  return {
    canvas,
    calls,
    restore() {
      if (previous) Object.defineProperty(globalThis, "document", previous);
      else Reflect.deleteProperty(globalThis, "document");
    },
  };
}

test("receive poster draws the verified QR, full address and Testnet-only warning", async () => {
  const calls: { name: string; args: unknown[] }[] = [];
  const context = new Proxy({}, {
    get(_target, key) {
      if (key === "createLinearGradient") return () => ({ addColorStop() {} });
      if (key === "measureText") return (value: string) => ({ width: value.length * 16 });
      return (...args: unknown[]) => calls.push({ name: String(key), args });
    },
    set(target, key, value) { Reflect.set(target, key, value); return true; },
  }) as CanvasRenderingContext2D;
  const env = browserCanvas(context);
  try {
    const qr = {} as HTMLCanvasElement;
    const blob = await drawReceivePoster(qr, address, "fixture_user", false, receiveCopy("en"));
    assert.equal(blob?.type, "image/png");
    assert.equal(env.canvas.width, 1080);
    assert.equal(env.canvas.height, 1920);
    const image = calls.find(call => call.name === "drawImage");
    assert.equal(image?.args[0], qr);
    const labels = calls.filter(call => call.name === "fillText").map(call => call.args[0]);
    assert.ok(labels.includes("@fixture_user"));
    assert.ok(labels.includes(address.slice(0, 28)));
    assert.ok(labels.includes(address.slice(28)));
    assert.ok(labels.some(label => String(label).includes("Stellar Testnet")));
  } finally { env.restore(); }
});

test("local preview poster clearly warns that its address is only an example", async () => {
  const calls: { name: string; args: unknown[] }[] = [];
  const context = new Proxy({}, {
    get(_target, key) {
      if (key === "createLinearGradient") return () => ({ addColorStop() {} });
      if (key === "measureText") return (value: string) => ({ width: value.length * 16 });
      return (...args: unknown[]) => calls.push({ name: String(key), args });
    },
    set(target, key, value) { Reflect.set(target, key, value); return true; },
  }) as CanvasRenderingContext2D;
  const env = browserCanvas(context);
  try {
    await drawReceivePoster({} as HTMLCanvasElement, address, null, true, receiveCopy("id"));
    const labels = calls.filter(call => call.name === "fillText").map(call => String(call.args[0]));
    assert.ok(labels.join(" ").includes(receiveCopy("id").previewPosterWarning));
    assert.ok(!labels.join(" ").includes(receiveCopy("id").posterNetworkNote));
  } finally { env.restore(); }
});

test("poster creation reports an unavailable canvas instead of claiming a download", async () => {
  const env = browserCanvas(null);
  try {
    assert.equal(await drawReceivePoster({} as HTMLCanvasElement, address, null, false, receiveCopy("en")), null);
  } finally { env.restore(); }
});
