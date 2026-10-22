import type { SignIn } from "@clerk/nextjs";
import type { ComponentProps } from "react";

type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

// Clerk's own rules set border-width 0 and draw edges with layered box-shadows at higher specificity, so the Orbit edge
// is an inset shadow marked !important; focus keeps a visible accent ring on top of it.
const edge = (color: string) => `inset 0 0 0 1px ${color} !important`;
const focusRing = "inset 0 0 0 1px var(--accent-text), 0 0 0 3px color-mix(in srgb, var(--accent-text) 30%, transparent) !important";
const pill = { borderRadius: "999px", height: "44px !important", fontSize: "14px", fontWeight: 500 } as const;

/**
 * Sign-in / sign-up only, layered over the app-wide Clerk theme in app/layout.tsx (system §3): the form sits straight on
 * the left panel's ground, so Clerk's card, shadow and header go; our page heading replaces Clerk's. Inputs carry the
 * 3:1 control line (A17); every button is a pill.
 */
export const authAppearance: Appearance = {
  elements: {
    rootBox: { width: "100%" },
    // Clerk's start step carries a password field for password managers and reveals it when Chrome autofills it; that
    // value isn't used there, so people were asked for their password twice. Only the start step has a visible
    // identifier row (the password step keeps a zero-height username input for autofill, outside any field row), so
    // its password row is kept out of the page and the browser fills the real password step instead.
    form: { "&:has(.cl-formFieldRow__identifier) .cl-formFieldRow__password": { display: "none !important" } },
    cardBox: { width: "100%", maxWidth: "none", boxShadow: "none", border: "none", borderRadius: 0, background: "transparent", overflow: "visible" },
    card: { background: "transparent", boxShadow: "none", border: "none", borderRadius: 0, padding: 0, gap: "24px" },
    header: { display: "none" },
    footer: { background: "transparent", padding: 0, marginTop: "20px", borderTop: "none", alignItems: "flex-start" },
    footerAction: { justifyContent: "flex-start", padding: 0, fontSize: "13px" },
    footerActionText: { color: "var(--text-2)" },
    footerActionLink: { color: "var(--accent-text)", fontWeight: 500 },
    socialButtonsBlockButton: {
      ...pill,
      background: "transparent",
      color: "var(--text)",
      boxShadow: edge("var(--line-3)"),
      "&:hover": { background: "var(--line-soft)", boxShadow: edge("var(--line-hover)") },
      "&:focus-visible": { boxShadow: focusRing },
    },
    socialButtonsBlockButtonText: { fontWeight: 500 },
    socialButtonsIconButton: { ...pill, background: "transparent", boxShadow: edge("var(--line-3)") },
    dividerLine: { background: "var(--line)" },
    dividerText: { color: "var(--text-3)", fontSize: "12px" },
    formFieldLabel: { color: "var(--text-soft)", fontSize: "13px", fontWeight: 500 },
    formFieldInput: {
      borderRadius: "999px",
      minHeight: "44px",
      paddingInline: "18px !important",
      fontSize: "15px",
      background: "var(--ground)",
      color: "var(--text)",
      boxShadow: edge("var(--line-control)"),
      "&:hover": { boxShadow: edge("var(--line-control)") },
      "&:focus": { boxShadow: focusRing },
    },
    formButtonPrimary: {
      ...pill,
      background: "var(--accent)",
      color: "#FFFFFF",
      boxShadow: "none !important",
      "&:hover": { background: "var(--accent-hover)", boxShadow: "0 10px 28px rgba(79,95,245,0.28) !important" },
      "&:focus-visible": { boxShadow: "0 0 0 2px var(--ground), 0 0 0 4px var(--accent-text) !important" },
    },
    buttonArrowIcon: { display: "none" },
    formFieldAction: { color: "var(--accent-text)" },
    identityPreviewEditButton: { color: "var(--accent-text)" },
  },
};
