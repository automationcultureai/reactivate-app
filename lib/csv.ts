import Papa from 'papaparse'
import { z } from 'zod'

export interface ParsedLead {
  name: string
  email?: string
  phone?: string
  // Optional enrichment columns — never cause a validation error if blank
  last_contact_date?: string
  service_type?: string
  purchase_value?: string
  notes?: string
  // RFM scoring inputs — optional, used for wave prioritisation
  last_purchase_date?: string
  purchase_count?: string
  lifetime_value?: string
}

export interface CsvParseResult {
  leads: ParsedLead[]
  errors: string[]
  duplicatesRemoved: number
  totalRows: number
  /** Which optional enrichment columns were detected in this CSV */
  detectedOptionalColumns: string[]
}

const MAX_ROWS = 1000

const emailSchema = z.string().email()
// Phone: 7–20 chars, digits + optional leading +
const phoneSchema = z.string().min(7).max(20).regex(/^\+?[\d\s\-().]+$/, 'Invalid phone format')

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, '_')
}

function normalizeValue(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Normalises date strings to YYYY-MM-DD for Supabase.
 * Handles: DD/MM/YYYY, D/M/YYYY, already-correct YYYY-MM-DD, null/empty.
 */
function normalizeDateField(value: string | undefined): string | undefined {
  if (!value) return undefined
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  // DD/MM/YYYY or D/M/YYYY
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, d, m, y] = match
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Unrecognised format — pass through and let Supabase reject it
  return value
}

/** Pick the first non-empty value from a list of column name variants */
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = (row[k] ?? '').trim()
    if (v) return v
  }
  return ''
}

// Optional column canonical name → accepted header variants
const OPTIONAL_COLUMN_VARIANTS: Record<string, string[]> = {
  last_contact_date: ['last_contact_date', 'last_contact', 'last_service_date', 'last_service'],
  service_type: ['service_type', 'service', 'type', 'job_type'],
  purchase_value: ['purchase_value', 'value', 'amount', 'job_value', 'price'],
  notes: ['notes', 'note', 'comments', 'additional_notes', 'description'],
  // RFM scoring inputs
  last_purchase_date: ['last_purchase_date', 'last_purchase', 'purchase_date'],
  purchase_count: ['purchase_count', 'purchases', 'num_purchases', 'purchase_frequency', 'total_purchases'],
  lifetime_value: ['lifetime_value', 'ltv', 'total_spend', 'total_value', 'lifetime_spend', 'customer_value'],
}

/**
 * Parses a CSV string into validated leads.
 * Works in both browser and Node.js (PapaParse supports both).
 *
 * Required: name, email (email channel), phone (SMS channel)
 * Optional (never error if blank): last_contact_date, service_type, purchase_value, notes
 */
export function parseLeadsCsv(
  csvContent: string,
  channel: 'email' | 'sms' | 'both'
): CsvParseResult {
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
    transform: normalizeValue,
  })

  const totalRows = result.data.length
  const errors: string[] = []
  const validLeads: ParsedLead[] = []

  // Track dedup keys: email for email/both, phone for sms/both
  const seenEmails = new Set<string>()
  const seenPhones = new Set<string>()
  let duplicatesRemoved = 0

  if (result.errors.length > 0) {
    errors.push(`CSV parse error on row ${result.errors[0].row ?? '?'}: ${result.errors[0].message}`)
  }

  if (totalRows > MAX_ROWS) {
    errors.push(`CSV contains ${totalRows} rows — capped at ${MAX_ROWS}. Last ${totalRows - MAX_ROWS} rows were skipped.`)
  }

  const rowsToProcess = result.data.slice(0, MAX_ROWS)

  // Detect which optional columns are present in the headers
  const headers = result.meta.fields ?? []
  const detectedOptionalColumns = Object.entries(OPTIONAL_COLUMN_VARIANTS)
    .filter(([, variants]) => variants.some((v) => headers.includes(v)))
    .map(([canonical]) => canonical)

  rowsToProcess.forEach((row, i) => {
    const rowNum = i + 2 // 1-indexed + header row

    // Accept common column name variants for required fields
    const name = pick(row, 'name', 'full_name', 'first_name')
    const email = pick(row, 'email', 'email_address').toLowerCase()
    const phone = pick(row, 'phone', 'phone_number', 'mobile', 'telephone')

    if (!name) {
      errors.push(`Row ${rowNum}: missing name`)
      return
    }

    // Validate email if required
    if (channel === 'email' || channel === 'both') {
      if (!email) {
        errors.push(`Row ${rowNum} (${name}): missing email`)
        return
      }
      if (!emailSchema.safeParse(email).success) {
        errors.push(`Row ${rowNum} (${name}): invalid email "${email}"`)
        return
      }
    }

    // Validate phone if required
    if (channel === 'sms' || channel === 'both') {
      if (!phone) {
        errors.push(`Row ${rowNum} (${name}): missing phone`)
        return
      }
      if (!phoneSchema.safeParse(phone).success) {
        errors.push(`Row ${rowNum} (${name}): invalid phone "${phone}"`)
        return
      }
    }

    // Dedup within the CSV itself
    let isDuplicate = false
    if (email && seenEmails.has(email)) {
      isDuplicate = true
    }
    if (phone && seenPhones.has(phone)) {
      isDuplicate = true
    }

    if (isDuplicate) {
      duplicatesRemoved++
      return
    }

    if (email) seenEmails.add(email)
    if (phone) seenPhones.add(phone)

    // Extract optional enrichment columns — never error if blank
    const last_contact_date = normalizeDateField(pick(row, 'last_contact_date', 'last_contact', 'last_service_date', 'last_service') || undefined)
    const service_type = pick(row, 'service_type', 'service', 'type', 'job_type') || undefined
    const purchase_value = pick(row, 'purchase_value', 'value', 'amount', 'job_value', 'price') || undefined
    const notes = pick(row, 'notes', 'note', 'comments', 'additional_notes', 'description') || undefined
    // RFM scoring inputs
    const last_purchase_date = normalizeDateField(pick(row, 'last_purchase_date', 'last_purchase', 'purchase_date') || undefined)
    const purchase_count = pick(row, 'purchase_count', 'purchases', 'num_purchases', 'purchase_frequency', 'total_purchases') || undefined
    const lifetime_value = pick(row, 'lifetime_value', 'ltv', 'total_spend', 'total_value', 'lifetime_spend', 'customer_value') || undefined

    validLeads.push({
      name,
      email: email || undefined,
      phone: phone || undefined,
      last_contact_date,
      service_type,
      purchase_value,
      notes,
      last_purchase_date,
      purchase_count,
      lifetime_value,
    })
  })

  return {
    leads: validLeads,
    errors,
    duplicatesRemoved,
    totalRows,
    detectedOptionalColumns,
  }
}
