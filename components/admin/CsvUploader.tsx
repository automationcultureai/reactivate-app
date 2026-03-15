'use client'

import { useRef, useState } from 'react'
import { parseLeadsCsv, CsvParseResult } from '@/lib/csv'
import { Button } from '@/components/ui/button'
import { Upload, CheckCircle, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CsvUploaderProps {
  channel: 'email' | 'sms' | 'both'
  onParsed: (result: CsvParseResult | null) => void
}

const DAILY_SEND_THRESHOLD = 150

export function CsvUploader({ channel, onParsed }: CsvUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<CsvParseResult | null>(null)
  const [parsing, setParsing] = useState(false)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a .csv file')
      return
    }

    setParsing(true)
    try {
      const text = await file.text()
      const parsed = parseLeadsCsv(text, channel)
      setFileName(file.name)
      setResult(parsed)
      onParsed(parsed)
    } catch (err) {
      console.error('CSV parse error:', err)
      setResult(null)
      onParsed(null)
    } finally {
      setParsing(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function clearFile() {
    setFileName(null)
    setResult(null)
    onParsed(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const showDeliverabilityWarning =
    result && result.leads.length > DAILY_SEND_THRESHOLD

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {!result ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-muted/10 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
          role="button"
          aria-label="Upload CSV"
        >
          <Upload className="w-6 h-6 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {parsing ? 'Parsing…' : 'Drop your CSV here or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Required columns:{' '}
              <span className="font-mono">name</span>
              {(channel === 'email' || channel === 'both') && (
                <>, <span className="font-mono">email</span></>
              )}
              {(channel === 'sms' || channel === 'both') && (
                <>, <span className="font-mono">phone</span></>
              )}
            </p>
          </div>
        </div>
      ) : (
        /* Results panel */
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-sm font-medium text-foreground">{fileName}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={clearFile}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 rounded-md bg-muted/30">
              <p className="text-xl font-semibold text-foreground">{result.totalRows}</p>
              <p className="text-xs text-muted-foreground">Total rows</p>
            </div>
            <div className="text-center p-2 rounded-md bg-green-500/10">
              <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                {result.leads.length}
              </p>
              <p className="text-xs text-muted-foreground">Valid leads</p>
            </div>
            <div className={cn(
              "text-center p-2 rounded-md",
              result.errors.length > 0 ? "bg-destructive/10" : "bg-muted/30"
            )}>
              <p className={cn(
                "text-xl font-semibold",
                result.errors.length > 0 ? "text-destructive" : "text-foreground"
              )}>
                {result.errors.length + result.duplicatesRemoved}
              </p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
          </div>

          {/* Deliverability warning */}
          {showDeliverabilityWarning && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>{result.leads.length} leads</strong> exceeds the daily send limit of{' '}
                {DAILY_SEND_THRESHOLD}. Remaining sends will be queued for the next day automatically.
              </p>
            </div>
          )}

          {/* Parse errors (show first 5) */}
          {result.errors.length > 0 && (
            <div className="space-y-1">
              {result.errors.slice(0, 5).map((err, i) => (
                <p key={i} className="text-xs text-destructive font-mono">{err}</p>
              ))}
              {result.errors.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  …and {result.errors.length - 5} more errors
                </p>
              )}
            </div>
          )}

          {result.duplicatesRemoved > 0 && (
            <p className="text-xs text-muted-foreground">
              {result.duplicatesRemoved} duplicate{result.duplicatesRemoved !== 1 ? 's' : ''} removed within CSV.
            </p>
          )}

          {/* Optional enrichment + RFM columns detected */}
          {result.detectedOptionalColumns.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">Enrichment columns detected:</span>
              {result.detectedOptionalColumns.map((col) => (
                <span
                  key={col}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono"
                >
                  {col}
                </span>
              ))}
            </div>
          )}

          {/* RFM wave note */}
          {(() => {
            const rfmCols = ['last_purchase_date', 'purchase_count', 'lifetime_value']
            const hasRfm = result.detectedOptionalColumns.some((c) => rfmCols.includes(c))
            return !hasRfm ? (
              <p className="text-xs text-muted-foreground">
                No RFM columns detected — all leads will be Wave 2 (sends Days 3–4 after activation). Add{' '}
                <span className="font-mono">last_purchase_date</span>,{' '}
                <span className="font-mono">purchase_count</span>, or{' '}
                <span className="font-mono">lifetime_value</span> to enable priority waves.
              </p>
            ) : null
          })()}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </div>
  )
}
