import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals · Salapi" };

export default function ReferralsPage() {
  redirect("/you/invite");
}
