import { redirect } from "next/navigation";

export default function CreateCauseAliasPage() {
  redirect("/campaigns?create=1");
}
