import TransparencyScreen from "@/components/screens/TransparencyScreen";
import { isLocalPreview } from "@/lib/local-preview";
import { PrototypeDisasterVaultContributeScreen } from "@/components/screens/PrototypeDisasterVaultScreen";

export const metadata = { title: "Contribute to Disaster Vault · Salapi" };

export default function DisasterVaultContributePage() {
  return isLocalPreview ? <PrototypeDisasterVaultContributeScreen /> : <TransparencyScreen initialPhase="amount" />;
}
