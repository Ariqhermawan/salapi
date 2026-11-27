import PrototypeWithdrawScreen from "./PrototypeWithdrawScreen";

export default function WithdrawScreen({ initialCurrency }: { initialCurrency?: "IDR" | "PHP" | "USDC" } = {}) {
  return <PrototypeWithdrawScreen initialCurrency={initialCurrency} />;
}
