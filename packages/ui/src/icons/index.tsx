import type { ReactNode, SVGProps } from "react";

/**
 * Orbit icon set (system §6.1): a 20-unit grid, stroke 1.6, round caps and joins, no fill. Drawn at 15-19 px; size
 * with `size` (default 18) or a class. Decorative by default (`aria-hidden`); pass `aria-label` (with `role="img"`) for
 * a standalone meaning, though icon buttons should name the button instead.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number | string };

function make(name: string, body: ReactNode, defaults: SVGProps<SVGSVGElement> = {}) {
  function Icon({ size = 18, ...props }: IconProps) {
    const labelled = props["aria-label"] !== undefined;
    return (
      <svg
        viewBox="0 0 20 20"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={labelled ? undefined : true}
        role={labelled ? "img" : undefined}
        focusable="false"
        data-icon={name}
        {...defaults}
        {...props}
      >
        {body}
      </svg>
    );
  }
  Icon.displayName = `Icon(${name})`;
  return Icon;
}

export const SendIcon = make(
  "send",
  <>
    <path d="M3 10 17 3l-4 14-3.5-5.5L3 10z" />
    <path d="M9.5 11.5 17 3" />
  </>,
);
export const PlusIcon = make("plus", <path d="M10 4v12M4 10h12" />, { strokeWidth: 1.7 });
export const CloseIcon = make("close", <path d="M5 5l10 10M15 5L5 15" />);
export const MoreIcon = make(
  "more",
  <>
    <circle cx="4.5" cy="10" r="1.4" />
    <circle cx="10" cy="10" r="1.4" />
    <circle cx="15.5" cy="10" r="1.4" />
  </>,
  { fill: "currentColor", stroke: "none" },
);
export const MicIcon = make(
  "mic",
  <>
    <rect x="7" y="3" width="6" height="10" rx="3" />
    <path d="M5 10a5 5 0 0 0 10 0M10 15v2" />
  </>,
);
export const PencilIcon = make("pencil", <path d="M4 16l1-4 8.5-8.5a1.6 1.6 0 0 1 2.3 2.3L7.3 14.3 4 16z" />);
export const PostsIcon = make(
  "posts",
  <>
    <rect x="4" y="3.5" width="12" height="13" rx="2" />
    <path d="M7 8h6M7 11h6M7 14h3" />
  </>,
);
export const IdeasIcon = make(
  "ideas",
  <path d="M10 3v2.5M10 14.5V17M3 10h2.5M14.5 10H17M5 5l1.8 1.8M13.2 13.2 15 15M5 15l1.8-1.8M13.2 6.8 15 5" />,
);
export const ActivitiesIcon = make(
  "activities",
  <>
    <circle cx="10" cy="10" r="7" />
    <path d="M6.8 10.3l2.2 2.2 4.4-4.8" />
  </>,
);
export const EngageIcon = make("engage", <path d="M3 10a7 7 0 1 1 3.2 5.9L3 17l1.1-3.2A7 7 0 0 1 3 10z" />);
export const AnalyticsIcon = make("analytics", <path d="M4.5 16V9.5M10 16V4M15.5 16v-6" />);
export const ChevronUpIcon = make("chevron-up", <path d="M6 12l4-4 4 4" />);
export const ChevronRightIcon = make("chevron-right", <path d="M8 5l5 5-5 5" />);
export const CheckIcon = make("check", <path d="M5 10.5l4 4 8-9" />);
export const SearchIcon = make(
  "search",
  <>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.2 13.2L17 17" />
  </>,
);
export const CopyIcon = make(
  "copy",
  <>
    <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
    <rect x="3" y="7" width="10" height="10" rx="2" />
  </>,
);
export const PlayIcon = make("play", <path d="M7 4.5l9.5 5.5L7 15.5z" />, { fill: "currentColor", stroke: "none" });

export const HomeIcon = make("home", <path d="M3 9l7-6 7 6v8a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z" />);
export const BulbIcon = make("bulb", <path d="M7 14.5h6M8 17h4M10 2.5a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" />);
export const TasksIcon = make(
  "tasks",
  <>
    <rect x="4" y="4" width="12" height="13" rx="2" />
    <path d="M7 3v2M13 3v2M7 11l2 2 4-4" />
  </>,
);
export const ChevronLeftIcon = make("chevron-left", <path d="M12 5l-5 5 5 5" />);
export const MenuIcon = make("menu", <path d="M4 6.5h12M4 10h12M4 13.5h8" />);
export const SidebarIcon = make(
  "sidebar",
  <>
    <rect x="3" y="4" width="14" height="12" rx="2.5" />
    <path d="M8 4v12" />
  </>,
);
export const SettingsIcon = make(
  "settings",
  <>
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" />
  </>,
);
export const SignOutIcon = make("sign-out", <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12 6.5 15.5 10 12 13.5M15.5 10H8" />);

/** Every icon, by name, for catalogues (the /design page). */
export const icons = {
  send: SendIcon,
  plus: PlusIcon,
  close: CloseIcon,
  more: MoreIcon,
  mic: MicIcon,
  pencil: PencilIcon,
  posts: PostsIcon,
  ideas: IdeasIcon,
  activities: ActivitiesIcon,
  engage: EngageIcon,
  analytics: AnalyticsIcon,
  "chevron-up": ChevronUpIcon,
  "chevron-right": ChevronRightIcon,
  check: CheckIcon,
  search: SearchIcon,
  copy: CopyIcon,
  play: PlayIcon,
  home: HomeIcon,
  bulb: BulbIcon,
  tasks: TasksIcon,
  "chevron-left": ChevronLeftIcon,
  menu: MenuIcon,
  sidebar: SidebarIcon,
  settings: SettingsIcon,
  "sign-out": SignOutIcon,
} as const;

export type IconName = keyof typeof icons;
