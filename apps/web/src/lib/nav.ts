import {
  BarChart3,
  Bookmark,
  CalendarCheck2,
  FileText,
  Image,
  LayoutTemplate,
  Lightbulb,
  type LucideIcon,
  MessageSquarePlus,
  Plug,
  Brain,
  Users,
  CreditCard,
  UserRound,
  LifeBuoy,
  MessagesSquare,
  Sparkles,
  UserPlus,
  Telescope,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon; external?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };
export type Section = { id: "ideas" | "settings"; title: string; groups: NavGroup[]; matches: string[] };

export const primaryNav: NavItem[] = [
  { label: "New chat", href: "/", icon: MessageSquarePlus },
  { label: "Posts", href: "/posts", icon: FileText },
  { label: "Ideas", href: "/ideas", icon: Lightbulb },
  { label: "Activities", href: "/activities", icon: CalendarCheck2 },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
];

export const sections: Section[] = [
  {
    id: "ideas",
    title: "Ideas",
    matches: ["/ideas", "/inspiration", "/following", "/templates", "/images", "/saves"],
    groups: [
      {
        label: "Discover",
        items: [
          { label: "For you", href: "/ideas", icon: Sparkles },
          { label: "Inspiration", href: "/inspiration", icon: Telescope },
          { label: "Following", href: "/following", icon: UserPlus },
          { label: "Templates", href: "/templates", icon: LayoutTemplate },
        ],
      },
      { label: "Images", items: [{ label: "Created by you", href: "/images", icon: Image }] },
      { label: "My library", items: [{ label: "All saves", href: "/saves", icon: Bookmark }] },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    matches: ["/settings"],
    groups: [
      {
        label: "Account",
        items: [
          { label: "Manage account", href: "/settings", icon: UserRound },
          { label: "Integrations", href: "/settings/integrations", icon: Plug },
          { label: "Memories", href: "/settings/memories", icon: Brain },
          { label: "Manage team", href: "/settings/team", icon: Users },
          { label: "Billing", href: "/settings/billing", icon: CreditCard },
        ],
      },
      {
        label: "Support",
        items: [
          { label: "Community", href: "/settings/community", icon: MessagesSquare },
          { label: "Talk to a person", href: "/settings/help", icon: LifeBuoy },
        ],
      },
    ],
  },
];

export function sectionFor(pathname: string): Section | null {
  return (
    sections.find((s) => s.matches.some((m) => pathname === m || pathname.startsWith(`${m}/`))) ??
    null
  );
}

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/chat/");
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}
