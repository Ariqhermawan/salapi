import { redirect } from "next/navigation";

export default async function UsernameAliasPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const destination = Array.isArray(next) ? next[0] : next;
  const safeNext = destination && /^\/[a-z0-9/_-]*$/.test(destination) ? destination : null;
  redirect(safeNext ? `/onboarding/username?next=${encodeURIComponent(safeNext)}` : "/onboarding/username");
}
