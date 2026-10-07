export type ReceiveDestination = {
  kind: "username" | "address";
  value: string;
  display: string;
};

/** Public addresses are checksum-validated by the accountDetails server read. */
export function receiveDestination(address: string | null, username: string | null, base: string): ReceiveDestination | null {
  if (!address || !/^G[A-Z2-7]{55}$/.test(address)) return null;
  if (username && /^[a-z0-9_]{3,32}$/.test(username)) {
    try {
      const origin = new URL(base);
      if (origin.protocol !== "https:" && origin.protocol !== "http:") return null;
      const url = new URL("/send", origin.origin);
      url.searchParams.set("to", username);
      return { kind: "username", value: url.href, display: `@${username}` };
    } catch { return null; }
  }
  return { kind: "address", value: address, display: address };
}

/** A wallet address must be text, never a Web Share URL relative to this site. */
export function receiveShareData(destination: ReceiveDestination, caption: string): ShareData {
  return destination.kind === "username"
    ? { title: "Salapi", text: caption, url: destination.value }
    : { title: "Salapi", text: `${caption}\n${destination.value}` };
}
