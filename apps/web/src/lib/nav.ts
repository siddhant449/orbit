import type { ComponentType } from "react";
import {
  ActivitiesIcon,
  AnalyticsIcon,
  BulbIcon,
  EngageIcon,
  HomeIcon,
  IdeasIcon,
  PencilIcon,
  PostsIcon,
  TasksIcon,
  type IconProps,
} from "@brandloop/ui/icons";
import {
  Bookmark,
  Compass,
  Image,
  LayoutTemplate,
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

/** Orbit icons and the few lucide icons Orbit does not draw both fit (className, size, aria-hidden). */
export type NavIcon = ComponentType<IconProps>;
export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  external?: boolean;
  /** Keyboard hint shown at the row's end (decorative; the link carries `aria-keyshortcuts`). */
  shortcut?: string;
  /** Rendered only when a real number exists (posts total, tasks left, queue size). None are built yet. */
  count?: number;
};
export type NavGroup = { label?: string; items: NavItem[] };
export type Section = { id: "ideas" | "settings"; title: string; groups: NavGroup[]; matches: string[] };

export const primaryNav: NavItem[] = [
  { label: "New draft", href: "/", icon: PencilIcon, shortcut: "⌘J" },
  { label: "Posts", href: "/posts", icon: PostsIcon },
  { label: "Ideas", href: "/ideas", icon: IdeasIcon },
  { label: "Activities", href: "/activities", icon: ActivitiesIcon },
  { label: "Engage", href: "/engage", icon: EngageIcon },
  { label: "Analytics", href: "/analytics", icon: AnalyticsIcon },
];

/** Mobile bottom tab bar (system §9): icon-only links named by `aria-label`. */
export const mobileTabs: NavItem[] = [
  { label: "Home", href: "/", icon: HomeIcon },
  { label: "Posts", href: "/posts", icon: PostsIcon },
  { label: "Ideas", href: "/ideas", icon: BulbIcon },
  { label: "Activities", href: "/activities", icon: TasksIcon },
  { label: "Analytics", href: "/analytics", icon: AnalyticsIcon },
];

export const sections: Section[] = [
  {
    id: "ideas",
    title: "Ideas",
    matches: ["/ideas", "/strategy", "/inspiration", "/following", "/templates", "/images", "/saves"],
    groups: [
      {
        label: "Discover",
        items: [
          { label: "Strategy", href: "/strategy", icon: Compass },
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
  if (href === "/") return pathname === "/";
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}
