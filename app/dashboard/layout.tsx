// Layout shell — DashboardNav is rendered with client data inside page.tsx
// because we need server-fetched client name
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background dashboard-bg">
      <div className="relative z-10">{children}</div>
    </div>
  )
}
