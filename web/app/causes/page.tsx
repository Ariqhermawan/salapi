import { redirect } from "next/navigation";

export default function CausesAliasPage() {
  redirect("/campaigns?mode=testnet");
}
