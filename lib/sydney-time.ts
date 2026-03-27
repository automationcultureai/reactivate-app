// Returns current hour (0-23) and day-of-week (0=Sun) in Australia/Sydney timezone.
// Uses en-US locale so Date constructor reliably parses the string.
export function getSydneyTime(): { hour: number; dayOfWeek: number } {
  const sydneyDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  return { hour: sydneyDate.getHours(), dayOfWeek: sydneyDate.getDay() }
}

// SMS is only allowed Mon–Sat, 9am–7pm AEST/AEDT.
// Outside this window the cron defers — timing thresholds are in days so a 24hr
// slip has no meaningful impact on conversion.
export function isSmsAllowedNow(): boolean {
  const { hour, dayOfWeek } = getSydneyTime()
  return dayOfWeek !== 0 && hour >= 9 && hour < 19
}

// Email 1 performs best Mon–Fri 9am–2pm AEST/AEDT.
// Only gates initial sends (pending leads); follow-up emails 2–4 are less timing-sensitive.
export function isEmailOptimalNow(): boolean {
  const { hour, dayOfWeek } = getSydneyTime()
  return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour < 14
}
