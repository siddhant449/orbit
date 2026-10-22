"use client";

import { usePathname } from "next/navigation";
import { skeletonFor } from "./route-view-logic";
import {
  ChatSkeleton,
  DashboardSkeleton,
  EditorSkeleton,
  GridSkeleton,
  HomeSkeleton,
  PageSkeleton,
  PostsSkeleton,
} from "./route-skeleton";

/** Every `loading.tsx` in the app: the skeleton shaped like the screen being opened (it reads the new address). */
export default function RouteLoading() {
  const kind = skeletonFor(usePathname());
  switch (kind) {
    case "home":
      return <HomeSkeleton />;
    case "chat":
      return <ChatSkeleton />;
    case "editor":
      return <EditorSkeleton />;
    case "posts":
      return <PostsSkeleton />;
    case "dashboard":
      return <DashboardSkeleton />;
    case "grid":
      return <GridSkeleton />;
    case "form":
      return <PageSkeleton max="max-w-[760px]" rows={2} />;
    default:
      return <PageSkeleton />;
  }
}
