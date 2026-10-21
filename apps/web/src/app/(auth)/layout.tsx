import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-10">
      <div className="flex flex-col items-center gap-8">
        <Logo />
        {children}
      </div>
    </main>
  );
}
