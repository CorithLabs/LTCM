import { useSearchParams, useNavigate } from 'react-router-dom'
import { FileText, Layers, FolderOpen, Play, AlertCircle, Loader2 } from 'lucide-react'
import { useSearch, SearchCase, SearchSuite, SearchProject, SearchRun } from '../api'
import { PriorityBadge, StatusBadge } from '../components'

// ---- helpers ----
const priorityColor = { high: 'text-fail', medium: 'text-progress', low: 'text-text-muted' } as const

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-mono text-text-muted/60 bg-surface-2 px-1.5 py-0.5 rounded shrink-0">
      {children}
    </span>
  )
}

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-2 mt-6 first:mt-0">
      <span className="text-text-muted">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">{label}</span>
      <span className="text-xs text-text-muted/50 ml-auto">{count}</span>
    </div>
  )
}

// ---- result cards ----
function CaseCard({ c, onClick }: { c: SearchCase; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left card p-3 hover:border-accent/40 transition-colors flex items-start gap-3"
    >
      <FileText size={14} className="text-text-muted shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {c.case_number != null && <Tag>TC-{c.case_number}</Tag>}
          <span className="text-sm text-text-primary font-medium truncate">{c.title}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <PriorityBadge priority={c.priority} />
          <span className="text-xs text-text-muted">
            {c.suite_number != null ? `TS-${c.suite_number} · ` : ''}{c.suite_name}
          </span>
          <span className="text-xs text-text-muted/40">·</span>
          <span className="text-xs text-text-muted">{c.project_name}</span>
          {c.last_run_status && (
            <>
              <span className="text-xs text-text-muted/40">·</span>
              <StatusBadge status={c.last_run_status} />
            </>
          )}
        </div>
      </div>
    </button>
  )
}

function SuiteCard({ s, onClick }: { s: SearchSuite; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left card p-3 hover:border-accent/40 transition-colors flex items-start gap-3"
    >
      <Layers size={14} className="text-text-muted shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {s.suite_number != null && <Tag>TS-{s.suite_number}</Tag>}
          <span className="text-sm text-text-primary font-medium truncate">{s.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-text-muted">{s.project_name}</span>
          <span className="text-xs text-text-muted/40">·</span>
          <span className="text-xs text-text-muted">{s.case_count} case{s.case_count !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </button>
  )
}

function ProjectCard({ p, onClick }: { p: SearchProject; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left card p-3 hover:border-accent/40 transition-colors flex items-start gap-3"
    >
      <FolderOpen size={14} className="text-text-muted shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-text-primary font-medium">{p.name}</span>
        {p.description && <p className="text-xs text-text-muted mt-0.5 truncate">{p.description}</p>}
      </div>
      {p.last_run_status && <StatusBadge status={p.last_run_status} />}
    </button>
  )
}

function RunCard({ r, onClick }: { r: SearchRun; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left card p-3 hover:border-accent/40 transition-colors flex items-start gap-3"
    >
      <Play size={14} className="text-text-muted shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {r.run_number != null && <Tag>RUN-{r.run_number}</Tag>}
          <span className="text-sm text-text-primary font-medium truncate">{r.name}</span>
          <StatusBadge status={r.status} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-text-muted">{r.project_name}</span>
          <span className="text-xs text-text-muted/40">·</span>
          <span className="text-xs text-text-muted">{r.created_at.slice(0, 10)}</span>
          {r.environment && (
            <>
              <span className="text-xs text-text-muted/40">·</span>
              <span className="text-xs text-text-muted">{r.environment}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ---- JQL hint ----
function JqlHint() {
  return (
    <div className="card p-4 text-xs text-text-muted space-y-2">
      <p className="font-semibold text-text-primary">Query syntax</p>
      <div className="space-y-1 font-mono">
        <p><span className="text-accent">project</span> = <span className="text-pass">"My App"</span></p>
        <p><span className="text-accent">ts</span> = <span className="text-pass">"TS-3"</span> AND <span className="text-accent">priority</span> = <span className="text-pass">high</span></p>
        <p><span className="text-accent">status</span> = <span className="text-pass">fail</span></p>
        <p><span className="text-accent">tc</span> = <span className="text-pass">"TC-42"</span></p>
        <p><span className="text-accent">run</span> = <span className="text-pass">"RUN-7"</span> AND <span className="text-accent">status</span> = <span className="text-pass">pass</span></p>
      </div>
      <p className="pt-1 text-text-muted/60">Fields: <code>project · suite/ts · tc/case · priority · status/runstatus · run</code></p>
      <p className="text-text-muted/60">Or just type words to search everywhere.</p>
    </div>
  )
}

// ---- main ----
export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = searchParams.get('q') || ''

  const { data, isLoading, error } = useSearch(q)

  const noResults = data && data.total === 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-text-primary">
            {q ? <>Results for <span className="font-mono text-accent">"{q}"</span></> : 'Search'}
          </h1>
          {data && !noResults && (
            <p className="text-xs text-text-muted mt-0.5">
              {data.total} result{data.total !== 1 ? 's' : ''} · {data.mode === 'structured' ? 'structured query' : 'keyword search'}
            </p>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 size={14} className="animate-spin" /> Searching…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-fail/10 text-fail text-sm">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            {(error as Error).message}
          </div>
        )}

        {/* Empty query → show hint */}
        {!q && !isLoading && <JqlHint />}

        {/* No results */}
        {noResults && !isLoading && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">No results found.</p>
            <JqlHint />
          </div>
        )}

        {/* Results */}
        {data && data.total > 0 && (
          <div className="space-y-1.5">
            {data.cases.length > 0 && (
              <>
                <SectionHeader icon={<FileText size={13} />} label="Test Cases" count={data.cases.length} />
                {data.cases.map(c => (
                  <CaseCard key={c.id} c={c} onClick={() => navigate(`/projects/${c.project_id}/suites/${c.suite_id}/cases/${c.id}`)} />
                ))}
              </>
            )}

            {data.suites.length > 0 && (
              <>
                <SectionHeader icon={<Layers size={13} />} label="Suites" count={data.suites.length} />
                {data.suites.map(s => (
                  <SuiteCard key={s.id} s={s} onClick={() => navigate(`/projects/${s.project_id}/suites/${s.id}`)} />
                ))}
              </>
            )}

            {data.projects.length > 0 && (
              <>
                <SectionHeader icon={<FolderOpen size={13} />} label="Projects" count={data.projects.length} />
                {data.projects.map(p => (
                  <ProjectCard key={p.id} p={p} onClick={() => navigate(`/projects/${p.id}`)} />
                ))}
              </>
            )}

            {data.runs.length > 0 && (
              <>
                <SectionHeader icon={<Play size={13} />} label="Runs" count={data.runs.length} />
                {data.runs.map(r => (
                  <RunCard key={r.id} r={r} onClick={() => navigate(`/projects/${r.project_id}/runs/${r.id}/summary`)} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
