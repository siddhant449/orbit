import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// The /design style guide and the e2e database probe are public outside production only; in production the page
// returns notFound() and the probe 404s (it also needs AI_MOCK_MODEL=1).
const publicRoutes = ["/sign-in(.*)", "/sign-up(.*)"];
if (process.env.NODE_ENV !== "production") publicRoutes.push("/design(.*)", "/api/dev/db-name");

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
