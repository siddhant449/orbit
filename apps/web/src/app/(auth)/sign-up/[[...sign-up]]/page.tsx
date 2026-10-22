import { SignUp } from "@clerk/nextjs";
import { AuthScreen } from "@/components/auth/auth-screen";
import { authAppearance } from "@/components/auth/clerk-appearance";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <AuthScreen title="Start your orbit." lead="Create an account, then teach Orbit how you write.">
      <SignUp appearance={authAppearance} />
    </AuthScreen>
  );
}
