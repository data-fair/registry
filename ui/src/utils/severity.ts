export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

// Most-severe first; also the iteration order for "worst severity present".
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'unknown']

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'red-darken-2',
  high: 'red',
  medium: 'orange',
  low: 'grey',
  unknown: 'grey-lighten-1'
}

export const severityColor = (s: string): string => SEVERITY_COLORS[s as Severity] ?? 'grey'

export type ScanSummary = { critical?: number, high?: number, medium?: number, low?: number, unknown?: number, total?: number }

// The highest-severity bucket with a non-zero count, and that count.
// Returns null when there are no findings (or no summary at all).
export const worstSeverity = (summary?: ScanSummary): { severity: Severity, count: number } | null => {
  if (!summary) return null
  for (const severity of SEVERITY_ORDER) {
    const count = summary[severity] ?? 0
    if (count > 0) return { severity, count }
  }
  return null
}
