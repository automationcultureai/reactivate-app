import Link from 'next/link'
import { CreateClientForm } from '@/components/admin/CreateClientForm'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/lib/button-variants'
import { ChevronLeft } from 'lucide-react'

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/clients"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Add client</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create a new client account and Clerk organisation.
          </p>
        </div>
      </div>

      <CreateClientForm />
    </div>
  )
}
