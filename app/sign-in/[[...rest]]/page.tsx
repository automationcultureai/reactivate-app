import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Automation Culture Client Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            We automate the gruntwork. You take care of business.
          </p>
        </div>
        <SignIn />
      </div>
    </div>
  )
}
