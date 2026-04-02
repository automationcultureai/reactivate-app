'use client'

import { Download } from 'lucide-react'

interface ClickReportExportButtonProps {
  leads: Array<{
    name: string
    email: string | null
    phone: string | null
    status: string
    clicked_at: string | null
  }>
  campaignName: string
}

export function ClickReportExportButton({ leads, campaignName }: ClickReportExportButtonProps) {
  function handleExport() {
    const headers = ['Name', 'Email', 'Phone', 'Status', 'Clicked At']
    const rows = leads.map((lead) => [
      lead.name,
      lead.email ?? '',
      lead.phone ?? '',
      lead.status,
      lead.clicked_at ? new Date(lead.clicked_at).toLocaleString('en-AU') : '',
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `${campaignName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}-click-report.csv`
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <Download className="w-3.5 h-3.5" />
      Export CSV
    </button>
  )
}
