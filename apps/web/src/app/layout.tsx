import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { MotionProvider } from "@brandloop/ui/motion";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/components/theme/theme-choice";
import "./globals.css";

// One variable Bricolage file serves every display step: opsz 12-96, wdth 75-100, wght 200-800 (system §4).
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-display-face", display: "swap" });
const ui = Geist({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Orbit", template: "%s · Orbit" },
  description: "Write LinkedIn posts that sound like you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${ui.variable}`}>
      <body>
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#4F5FF5",
              colorPrimaryForeground: "#FFFFFF",
              colorForeground: "var(--text)",
              colorMutedForeground: "var(--text-2)",
              colorBackground: "var(--panel)",
              colorInput: "var(--ground)",
              colorInputForeground: "var(--text)",
              colorBorder: "var(--line-3)",
              colorDanger: "var(--danger)",
              borderRadius: "14px",
              fontFamily: "var(--font-ui)",
              fontFamilyButtons: "var(--font-ui)",
            },
            elements: {
              formButtonPrimary: { borderRadius: "999px" },
              socialButtonsBlockButton: { borderRadius: "999px" },
              socialButtonsIconButton: { borderRadius: "999px" },
            },
          }}
        >
          {/* Dark is the default and the no-JS paint (tokens on :root); `.light` / `.dark` on <html> after hydration. */}
          <ThemeProvider
            attribute="class"
            defaultTheme={DEFAULT_THEME}
            enableSystem
            themes={["light", "dark"]}
            storageKey={THEME_STORAGE_KEY}
            disableTransitionOnChange
          >
            <MotionProvider>{children}</MotionProvider>
            <Toaster
              position="bottom-right"
              toastOptions={{ className: "!rounded-[14px] !border-line-3 !bg-panel !text-text !text-[13px] !font-sans" }}
            />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
