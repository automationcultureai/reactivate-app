import { clerkClient } from '@clerk/nextjs/server'

/**
 * Creates a Clerk organisation for a client.
 * Returns the Clerk org ID to store on the client record.
 */
export async function createClientOrganization(
  name: string,
  createdByUserId: string
): Promise<string> {
  const clerk = await clerkClient()
  const org = await clerk.organizations.createOrganization({
    name,
    createdBy: createdByUserId,
  })
  return org.id
}

/**
 * Invites a user to a Clerk organisation by email.
 * Used when onboarding a client contact to their dashboard.
 */
export async function inviteUserToOrganization(
  orgId: string,
  emailAddress: string,
  inviterUserId: string
): Promise<void> {
  const clerk = await clerkClient()
  await clerk.organizations.createOrganizationInvitation({
    organizationId: orgId,
    emailAddress,
    inviterUserId,
    role: 'org:member',
  })
}
