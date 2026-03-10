import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Routes that never require authentication
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/book(.*)',
  '/unsubscribe(.*)',
  '/privacy',
  '/terms',
  // Public API routes (booking, tracking, webhooks)
  '/api/track/open/(.*)',
  '/api/unsubscribe/(.*)',
  '/api/leads/(.*)/book',
  '/api/webhooks/twilio',
  // Cron routes — protected by CRON_SECRET header, not Clerk auth
  '/api/cron/(.*)',
  '/api/jobs/auto-complete',
])

// Routes that require admin access (userId must be in ADMIN_USER_IDS)
const isAdminRoute = createRouteMatcher(['/admin(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // Always allow public routes through
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Get current auth state
  const authData = await auth()

  // Redirect unauthenticated users to sign-in
  if (!authData.userId) {
    return authData.redirectToSignIn({ returnBackUrl: req.url })
  }

  // Admin routes: verify userId is in ADMIN_USER_IDS
  if (isAdminRoute(req)) {
    const adminIds = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (!adminIds.includes(authData.userId)) {
      // Authenticated but not an admin — send to client dashboard
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
