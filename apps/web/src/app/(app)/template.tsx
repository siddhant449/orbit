import { RouteView } from "@/components/shell/route-view";

/** Mounts once per navigation, so the new screen can fade in (see `RouteView`). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <RouteView>{children}</RouteView>;
}
