import type { ScanFinding, ScanSeverity, ScanLicense } from '#mongo'

// --- severity ---------------------------------------------------------------

const LABEL_TO_BUCKET: Record<string, ScanSeverity> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MODERATE: 'medium',
  MEDIUM: 'medium',
  LOW: 'low'
}

// osv-scanner exposes severity inconsistently: a textual label in
// vulnerabilities[].database_specific.severity, and/or a numeric CVSS score
// in groups[].max_severity. Prefer the label, fall back to CVSS banding.
export const severityBucket = (label?: string, cvss?: string): ScanSeverity => {
  if (label && LABEL_TO_BUCKET[label.toUpperCase()]) return LABEL_TO_BUCKET[label.toUpperCase()]
  const score = cvss !== undefined ? Number(cvss) : NaN
  if (!Number.isNaN(score)) {
    if (score >= 9) return 'critical'
    if (score >= 7) return 'high'
    if (score >= 4) return 'medium'
    if (score > 0) return 'low'
  }
  return 'unknown'
}

export type Summary = { critical: number, high: number, medium: number, low: number, unknown: number, total: number }

export const summarize = (findings: ScanFinding[]): Summary => {
  const s: Summary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 }
  for (const f of findings) { s[f.severity]++; s.total++ }
  return s
}

// --- osv json shape (subset we read) ---------------------------------------

type OsvVuln = {
  id: string
  summary?: string
  database_specific?: { severity?: string }
  references?: { type?: string, url?: string }[]
  affected?: { package?: { ecosystem?: string }, ranges?: { events?: { fixed?: string }[] }[] }[]
}
type OsvGroup = { ids?: string[], max_severity?: string }
type OsvPackage = {
  package: { name: string, version: string, ecosystem?: string }
  vulnerabilities?: OsvVuln[]
  groups?: OsvGroup[]
  licenses?: string[]
}
type OsvOutput = { results?: { packages?: OsvPackage[] }[] }

const firstFixedVersion = (vuln: OsvVuln): string | undefined => {
  for (const aff of vuln.affected ?? []) {
    for (const range of aff.ranges ?? []) {
      for (const ev of range.events ?? []) {
        if (ev.fixed) return ev.fixed
      }
    }
  }
  return undefined
}

const primaryUrl = (vuln: OsvVuln): string | undefined => {
  const ref = (vuln.references ?? []).find(r => r.type === 'ADVISORY') ?? (vuln.references ?? [])[0]
  return ref?.url
}

// Whether a (top-level) package.json declares an install lifecycle script.
// Install/preinstall/postinstall run automatically on `npm install` and are a
// primary supply-chain execution vector — surfaced as an advisory flag.
export const detectInstallScripts = (pkgJson: unknown): boolean => {
  if (!pkgJson || typeof pkgJson !== 'object') return false
  const scripts = (pkgJson as { scripts?: unknown }).scripts
  if (!scripts || typeof scripts !== 'object') return false
  for (const hook of ['install', 'preinstall', 'postinstall'] as const) {
    if (typeof (scripts as Record<string, unknown>)[hook] === 'string') return true
  }
  return false
}

export const mapOsvOutput = (raw: unknown): { vulnerabilities: ScanFinding[], licenses: ScanLicense[], summary: Summary } => {
  const out = (raw ?? {}) as OsvOutput
  const findings: ScanFinding[] = []
  const licenses: ScanLicense[] = []
  for (const result of out.results ?? []) {
    for (const pkg of result.packages ?? []) {
      // CVSS score for the package's worst group, used as fallback severity.
      const maxCvss = (pkg.groups ?? [])
        .map(g => g.max_severity)
        .filter((v): v is string => typeof v === 'string')
        .sort((a, b) => Number(b) - Number(a))[0]
      for (const vuln of pkg.vulnerabilities ?? []) {
        findings.push({
          id: vuln.id,
          pkgName: pkg.package.name,
          installedVersion: pkg.package.version,
          fixedVersion: firstFixedVersion(vuln),
          severity: severityBucket(vuln.database_specific?.severity, maxCvss),
          title: vuln.summary,
          primaryUrl: primaryUrl(vuln)
        })
      }
      for (const lic of pkg.licenses ?? []) {
        if (lic && lic !== 'UNKNOWN') licenses.push({ pkgName: pkg.package.name, license: lic })
      }
    }
  }
  return { vulnerabilities: findings, licenses, summary: summarize(findings) }
}
