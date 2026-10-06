export const XLM_DEPOSIT_NETWORK = "Stellar Testnet";
export const XLM_DEPOSIT_PASSPHRASE = "Test SDF Network ; September 2015";

export type XlmDepositDetails = {
  address: string;
  uri: string;
  explorer: string;
  network: typeof XLM_DEPOSIT_NETWORK;
};
