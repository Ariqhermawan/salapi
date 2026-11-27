import { redirect } from "next/navigation";

export default function ManageCausesPage() {
  redirect("/campaigns?mode=testnet&mine=1");
}
