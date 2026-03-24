// Force all /admin/* pages to be server-rendered on every request.
// Without this, Next.js may pre-render and cache pages at build time,
// causing Supabase data changes to not appear until the next deployment.
export const dynamic = 'force-dynamic'

import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
