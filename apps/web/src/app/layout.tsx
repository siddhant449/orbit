import type { Metadata } from "next";
import { Archivo, Hanken_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { MotionProvider } from "@brandloop/ui/motion";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";

// One Archivo file serves display at width 125, section titles at 112 and the 20 px page title at 100.
const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display-face", display: "swap" });
const ui = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Brandloop", template: "%s · Brandloop" },
  description: "Write LinkedIn posts that sound like you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${ui.variable}`}>
      <body>
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "var(--ink)",
              colorPrimaryForeground: "var(--on-ink)",
              colorForeground: "var(--ink)",
              colorMutedForeground: "var(--ink-muted)",
              colorBackground: "var(--surface)",
              colorInput: "var(--surface)",
              colorInputForeground: "var(--ink)",
              colorDanger: "var(--signal-ink)",
              borderRadius: "2px",
              fontFamily: "var(--font-ui)",
              fontFamilyButtons: "var(--font-ui)",
              // No monospace anywhere, including Clerk's one-time-code inputs.
              fontFamilyMono: "var(--font-ui)",
            },
          }}
        >
          {/* `data-theme` mirrors the `dark` class so the device recipes can key on either. */}
          <ThemeProvider attribute={["class", "data-theme"]} defaultTheme="system" enableSystem disableTransitionOnChange>
            <MotionProvider>{children}</MotionProvider>
            <Toaster position="bottom-right" toastOptions={{ className: "!rounded-[2px] !border-line" }} />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
