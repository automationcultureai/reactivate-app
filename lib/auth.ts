import { auth } from '@clerk/nextjs/server'

/**
 * Returns the userId if the current request is from an admin, null otherwise.
 * Use this in every admin API route before executing any logic.
 */
export async function getAdminUserId(): Promise<string | null> {
  const { userId } = await auth()
  if (!userId) return null

  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  return adminIds.includes(userId) ? userId : null
}
