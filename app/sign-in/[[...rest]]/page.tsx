import { SignIn } from '@clerk/nextjs'
import { BGPattern } from '@/components/ui/bg-pattern'

export default function SignInPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden">
      <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.06)" />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Automation Culture Client Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome, and have a great day!
          </p>
        </div>
        <SignIn />
      </div>
    </div>
  )
}
