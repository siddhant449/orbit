import { SignIn } from "@clerk/nextjs";
import { AuthScreen } from "@/components/auth/auth-screen";
import { authAppearance } from "@/components/auth/clerk-appearance";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthScreen title="Welcome back." lead="Sign in to pick up your drafts where you left them.">
      <SignIn appearance={authAppearance} />
    </AuthScreen>
  );
}
