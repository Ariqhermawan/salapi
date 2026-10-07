import Link from "next/link";

export const metadata = { title: "Complete your account · Salapi" };
export default function UsernamePage() {
  return <section style={{ padding: 24 }}><h1>Complete your account</h1><p>Sign in to choose the username for your Salapi account.</p><Link href="/signin?next=%2Fonboarding%2Fusername">Sign in</Link><p><Link href="/">Home</Link></p></section>;
}
