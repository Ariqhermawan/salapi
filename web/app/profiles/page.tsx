import { redirect } from "next/navigation";

export default async function ProfilesAliasPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  redirect(type === "ngo" ? "/vault?tab=activity" : "/causes");
}
