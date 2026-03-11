import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// In-memory rate limiter (best-effort — does not share state across instances)
// ---------------------------------------------------------------------------
type RateLimitEntry = { count: number; resetAt: number }
const rateLimitMap = new Map<string, RateLimitEntry>()
let rateLimitCallCount = 0

const RATE_LIMITS: { prefix: string; max: number; windowMs: number }[] = [
  { prefix: '/book', max: 20, windowMs: 60_000 },
  { prefix: '/api/leads', max: 20, windowMs: 60_000 },
  { prefix: '/unsubscribe', max: 10, windowMs: 60_000 },
  { prefix: '/api/unsubscribe', max: 10, windowMs: 60_000 },
]

function checkRateLimit(ip: string, pathname: string): boolean {
  // Periodically clean up expired entries (every 100 calls)
  rateLimitCallCount++
  if (rateLimitCallCount % 100 === 0) {
    const now = Date.now()
    for (const [key, entry] of rateLimitMap.entries()) {
      if (entry.resetAt <= now) rateLimitMap.delete(key)
    }
  }

  const limit = RATE_LIMITS.find((l) => pathname.startsWith(l.prefix))
  if (!limit) return true // Not a rate-limited path — allow

  const key = `${ip}:${limit.prefix}`
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + limit.windowMs })
    return true
  }

  entry.count++
  if (entry.count > limit.max) return false // Over limit

  return true
}

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
  // Rate limit public booking and unsubscribe paths
  const pathname = req.nextUrl.pathname
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip, pathname)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

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
