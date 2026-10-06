import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import { XLM_DEPOSIT_NETWORK, XLM_DEPOSIT_PASSPHRASE, type XlmDepositDetails } from "../xlm-deposit";

/** Only canonical, checksum-valid public accounts can become deposit targets. */
export function xlmDepositDetails(address: unknown): XlmDepositDetails | null {
  if (typeof address !== "string" || !StrKey.isValidEd25519PublicKey(address)) return null;
  return {
    address,
    network: XLM_DEPOSIT_NETWORK,
    // SEP-7 defaults to Mainnet without this explicit passphrase. Native XLM
    // has no asset issuer. Never add an amount, callback or invented memo.
    uri: `web+stellar:pay?destination=${encodeURIComponent(address)}&network_passphrase=${encodeURIComponent(XLM_DEPOSIT_PASSPHRASE)}`,
    explorer: `https://stellar.expert/explorer/testnet/account/${address}`,
  };
}
