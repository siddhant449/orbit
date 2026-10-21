import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// The /design style guide is public outside production only; in production the page itself returns notFound().
const publicRoutes = ["/sign-in(.*)", "/sign-up(.*)"];
if (process.env.NODE_ENV !== "production") publicRoutes.push("/design(.*)");

const isPublicRoute = createRouteMatcher(publicRoutes);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
