import PrototypeWithdrawScreen from "./PrototypeWithdrawScreen";
import TestnetWithdrawScreen from "./TestnetWithdrawScreen";
import { isLocalPreview } from "@/lib/local-preview";

export default function WithdrawScreen({ initialCurrency }: { initialCurrency?: "IDR" | "PHP" | "USDC" | "XLM" } = {}) {
  if (isLocalPreview && initialCurrency === "XLM") return <TestnetWithdrawScreen initialCurrency="XLM" localPreview />;
  if (isLocalPreview) return <PrototypeWithdrawScreen initialCurrency={initialCurrency === "XLM" ? "USDC" : initialCurrency} />;
  return <TestnetWithdrawScreen initialCurrency={initialCurrency === "USDC" ? "XLM" : initialCurrency} />;
}
