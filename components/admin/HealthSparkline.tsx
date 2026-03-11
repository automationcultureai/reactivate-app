'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts'

interface SparklinePoint {
  date: string
  score: number
}

interface Props {
  data: SparklinePoint[]
}

function dotColour(score: number) {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

export function HealthSparkline({ data }: Props) {
  if (data.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">Not enough data for trend (requires 2+ days).</p>
    )
  }

  const latest = data[data.length - 1]?.score ?? 100

  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={[0, 100]} hide />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as SparklinePoint
              return (
                <div className="rounded border border-border bg-popover px-2 py-1 text-xs shadow-md">
                  <p className="text-muted-foreground">{point.date}</p>
                  <p className="font-semibold">Score: {point.score}</p>
                </div>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={dotColour(latest)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
