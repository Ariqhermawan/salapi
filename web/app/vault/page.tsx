import TransparencyScreen from "@/components/screens/TransparencyScreen";
import { isLocalPreview } from "@/lib/local-preview";
import { PrototypeDisasterVaultScreen } from "@/components/screens/PrototypeDisasterVaultScreen";

export const metadata = {
  title: "Disaster Vault · Salapi",
  description: "A shared disaster relief pool with on-chain approvals and public activity.",
};

export default function DisasterVaultPage() {
  return isLocalPreview ? <PrototypeDisasterVaultScreen /> : <TransparencyScreen />;
}
