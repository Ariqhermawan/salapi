import { Suspense } from "react";
import SignInScreen from "@/components/screens/SignInScreen";

export const metadata = { title: "Sign in · Salapi" };

// SignInScreen uses useSearchParams() to read ?error=oauth from the
// auth/callback bounce. Next 16 requires a Suspense boundary around any
// client component that reads search params during prerender.
export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInScreen />
    </Suspense>
  );
}
