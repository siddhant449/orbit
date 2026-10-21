import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  return <SignUp />;
}
