import { useParams, useNavigate } from 'react-router-dom'
import { Play, FileDown, Loader2, BarChart2, TrendingDown, TrendingUp, Sparkles, Tag, Globe, Bug, ExternalLink, RefreshCw, ChevronLeft } from 'lucide-react'
import { useRuns, useRunSummary, useProjects, useRerunFailures, useCloneRun, RunDefect, StepResult, RunCaseStatus } from '../api'
import { StatusBadge, PriorityBadge, EmptyState, PageHeader, ProgressBar, Toast } from '../components'
import { useState } from 'react'

// ---- Run History ----
export function RunHistoryPage() {
  const { projectId } = useParams<{ projectId: string }>()!
  const { data: runs = [], isLoading } = useRuns(projectId!)
  const { data: projects = [] } = useProjects()
  const navigate = useNavigate()
  const project = projects.find(p => p.id === projectId)

  function fmt(ms: number) {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Run History"
        subtitle={project?.name}
        actions={
          <button className="btn-primary text-sm" onClick={() => navigate(`/projects/${projectId}/runs/new`)}>
            <Play size={13} /> New Run
          </button>
        }
      />
      <div className="px-6 py-5 space-y-3">
        {isLoading && <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-text-muted" /></div>}

        {!isLoading && runs.length === 0 && (
          <EmptyState
            icon={<BarChart2 size={40} />}
            title="No runs yet"
            description="Start a test run to log results against your test cases."
            action={<button className="btn-primary" onClick={() => navigate(`/projects/${projectId}/runs/new`)}><Play size={14} />Start Run</button>}
          />
        )}

        {runs.map(r => {
          const duration = r.completed_at
            ? fmt(new Date(r.completed_at).getTime() - new Date(r.created_at).getTime())
            : null

          return (
            <div key={r.id} className="card hover:border-border-2 transition-colors p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {r.run_number != null && (
                      <span className="text-xs font-mono text-text-muted/60 bg-surface-2 px-1.5 py-0.5 rounded shrink-0">RUN-{r.run_number}</span>
                    )}
                    <span className="font-semibold text-sm text-text-primary truncate">{r.name}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-text-muted flex items-center gap-1 flex-wrap">
                    <span>{r.created_at.slice(0, 16).replace('T', ' ')}</span>
                    {duration && <span>· {duration}</span>}
                    <span>· {r.case_count} cases</span>
                    {r.created_by_username && <span>· by <span className="font-medium text-text-primary/70">{r.created_by_username}</span></span>}
                    {r.environment && (
                      <span className="inline-flex items-center gap-0.5 ml-1 text-accent font-medium">
                        <Globe size={10} />{r.environment}
                      </span>
                    )}
                    {r.jira_version_name && (
                      <span className="inline-flex items-center gap-0.5 ml-1 text-accent font-medium">
                        <Tag size={10} />{r.jira_version_name}
                      </span>
                    )}
                  </div>
                  {r.status === 'completed' && r.case_count > 0 && (
                    <div className="mt-2 w-48">
                      <ProgressBar
                        passed={r.passed} failed={r.failed} skipped={r.skipped}
                        blocked={r.blocked ?? 0} na={r.na ?? 0}
                        total={r.case_count}
                      />
                      <div className="flex gap-3 mt-1 text-xs text-text-muted flex-wrap">
                        <span className="text-pass">{r.passed}P</span>
                        <span className="text-fail">{r.failed}F</span>
                        <span className="text-skip">{r.skipped}S</span>
                        {(r.blocked ?? 0) > 0 && <span className="text-orange-400">{r.blocked}B</span>}
                        {(r.na ?? 0) > 0 && <span className="text-slate-400">{r.na}N/A</span>}
                      </div>
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {r.status === 'in_progress' ? (
                    <button className="btn-primary text-xs" onClick={() => navigate(`/projects/${projectId}/runs/${r.id}/execute`)}>
                      <Play size={12} /> Resume
                    </button>
                  ) : (
                    <button className="btn-ghost text-xs" onClick={() => navigate(`/projects/${projectId}/runs/${r.id}/summary`)}>
                      View Summary
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
    </div>
  )
}

// ---- Step results display ----
function StepResultsList({ stepResults }: { stepResults: StepResult[] }) {
  if (!stepResults || stepResults.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {stepResults.map(sr => (
        <li key={sr.stepIndex} className="flex items-start gap-2 text-xs">
          <span className={`font-mono shrink-0 ${sr.status === 'pass' ? 'text-pass' : 'text-fail'}`}>
            {sr.status === 'pass' ? '✓' : '✗'} Step {sr.stepIndex + 1}
          </span>
          {sr.actualResult && (
            <span className="text-text-muted font-mono">{sr.actualResult}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

const PAGE_SIZE = 10

// ---- Run Summary ----
export function RunSummaryPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>()!
  const { data: summary, isLoading } = useRunSummary(runId!)
  const rerun = useRerunFailures(projectId!)
  const clone = useCloneRun(projectId!)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [filterStatus, setFilterStatus] = useState<RunCaseStatus | null>(null)
  const [page, setPage] = useState(1)
  const navigate = useNavigate()

  function exportCsv() { window.location.href = `/api/v1/runs/${runId}/export?format=csv` }
  function exportPdf() { window.open(`/api/v1/runs/${runId}/export?format=pdf`, '_blank') }

  async function handleClone() {
    try {
      const newRun = await clone.mutateAsync({ runId: runId! })
      navigate(`/projects/${projectId}/runs/${newRun.id}/execute`)
    } catch (e: any) {
      setToast({ msg: e.message || 'Clone failed', type: 'error' })
    }
  }

  async function handleRerun() {
    try {
      const newRun = await rerun.mutateAsync({ runId: runId! })
      navigate(`/projects/${projectId}/runs/${newRun.id}/execute`)
    } catch (e: any) {
      if (e.message?.includes('in-progress') || e.code === 'RUN_IN_PROGRESS') {
        setToast({ msg: 'An in-progress run already exists for this project.', type: 'error' })
      } else {
        setToast({ msg: e.message || 'Re-run failed', type: 'error' })
      }
    }
  }

  function fmt(ms: number) {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
  }

  function handleFilterClick(status: RunCaseStatus) {
    setFilterStatus(prev => prev === status ? null : status)
    setPage(1)
  }

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (!summary) return null

  const executedTotal = summary.total - (summary.na ?? 0) - (summary.blocked ?? 0)
  const passRate = executedTotal > 0 ? Math.round((summary.passed / executedTotal) * 100) : 0

  // Build sets for inline diff chips matched by case_id
  const regressionIds = new Set((summary.diff?.regressions ?? []).map(e => e.caseId))
  const fixIds = new Set((summary.diff?.fixes ?? []).map(e => e.caseId))
  const newCaseIds = new Set((summary.diff?.newCases ?? []).map(e => e.caseId))

  // Filter + paginate
  const filteredCases = filterStatus ? summary.cases.filter(c => c.status === filterStatus) : summary.cases
  const pageCount = Math.ceil(filteredCases.length / PAGE_SIZE)
  const pagedCases = filteredCases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Stat card config
  type StatCard = { status: RunCaseStatus; label: string; value: number; cls: string; activeBg: string; hoverBg: string }
  const stats: StatCard[] = [
    { status: 'pass', label: 'Passed', value: summary.passed, cls: 'text-pass', activeBg: 'bg-pass/15 border-pass/40', hoverBg: 'hover:bg-pass/10' },
    { status: 'fail', label: 'Failed', value: summary.failed, cls: 'text-fail', activeBg: 'bg-fail/15 border-fail/40', hoverBg: 'hover:bg-fail/10' },
    { status: 'skip', label: 'Skipped', value: summary.skipped, cls: 'text-skip', activeBg: 'bg-skip/15 border-skip/40', hoverBg: 'hover:bg-skip/10' },
    ...(summary.blocked > 0 ? [{ status: 'blocked' as RunCaseStatus, label: 'Blocked', value: summary.blocked, cls: 'text-orange-400', activeBg: 'bg-orange-500/15 border-orange-500/40', hoverBg: 'hover:bg-orange-500/10' }] : []),
    ...((summary.na ?? 0) > 0 ? [{ status: 'na' as RunCaseStatus, label: 'N/A', value: summary.na, cls: 'text-slate-400', activeBg: 'bg-slate-500/15 border-slate-500/40', hoverBg: 'hover:bg-slate-500/10' }] : []),
  ]

  const defects = summary.defects ?? []

  function statusColor(s: RunCaseStatus): string {
    if (s === 'pass') return 'var(--color-pass, #4ade80)'
    if (s === 'fail') return 'var(--color-fail, #f87171)'
    if (s === 'skip') return 'var(--color-skip, #facc15)'
    if (s === 'blocked') return 'rgb(251 146 60)'
    return 'rgb(148 163 184)'
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate(`/projects/${projectId}/runs`)}
              className="mt-1 shrink-0 flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronLeft size={14} /> Runs
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {summary.run_number != null && (
                  <span className="font-mono text-xs font-semibold text-text-muted/70 bg-surface-2 border border-border px-2 py-0.5 rounded shrink-0">
                    RUN-{summary.run_number}
                  </span>
                )}
                <h1 className="text-lg font-semibold text-text-primary leading-snug">{summary.name}</h1>
                <StatusBadge status={summary.status} />
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-text-muted">
                {summary.completed_at && <span>{summary.completed_at.slice(0, 16).replace('T', ' ')}</span>}
                {summary.duration_ms && <span>· {fmt(summary.duration_ms)}</span>}
                {summary.created_by_username && (
                  <span className="flex items-center gap-1">
                    ·
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px] font-bold shrink-0">
                      {summary.created_by_username[0].toUpperCase()}
                    </span>
                    {summary.created_by_username}
                  </span>
                )}
                {summary.environment && (
                  <span className="inline-flex items-center gap-0.5 bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full font-medium">
                    <Globe size={10} />{summary.environment}
                  </span>
                )}
                {summary.jira_version_name && (
                  <span className="inline-flex items-center gap-0.5 bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full font-medium">
                    <Tag size={10} />{summary.jira_version_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <button className="btn-ghost text-xs" onClick={exportCsv}><FileDown size={13} /> CSV</button>
              <button className="btn-ghost text-xs" onClick={exportPdf}><FileDown size={13} /> PDF</button>
              <button className="btn-ghost text-xs" onClick={handleClone} disabled={clone.isPending}>
                {clone.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Clone
              </button>
              {(summary.failed > 0 || summary.blocked > 0 || summary.skipped > 0) && (
                <button className="btn-primary text-xs" onClick={handleRerun} disabled={rerun.isPending}>
                  {rerun.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Re-run Failures
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-5">

          {/* Hero stats card */}
          <div className="card p-5">
            <div className="flex items-center gap-6">
              {/* Pass rate */}
              <div className="shrink-0 text-center min-w-[80px]">
                <div className={`text-5xl font-extrabold tabular-nums ${passRate >= 80 ? 'text-pass' : passRate >= 50 ? 'text-skip' : 'text-fail'}`}>
                  {passRate}%
                </div>
                <div className="text-xs text-text-muted mt-0.5">pass rate</div>
                {executedTotal < summary.total && (
                  <div className="text-[10px] text-text-muted/60 mt-0.5">{executedTotal} executed</div>
                )}
              </div>

              <div className="w-px h-14 bg-border shrink-0" />

              {/* Clickable stat cards */}
              <div className="flex gap-2 flex-1 flex-wrap">
                {stats.map(s => (
                  <button
                    key={s.status}
                    onClick={() => handleFilterClick(s.status)}
                    className={`flex-1 min-w-[68px] rounded-lg border p-3 text-center transition-all cursor-pointer ${
                      filterStatus === s.status
                        ? s.activeBg
                        : `border-border bg-surface ${s.hoverBg}`
                    }`}
                  >
                    <div className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <ProgressBar
                passed={summary.passed} failed={summary.failed} skipped={summary.skipped}
                blocked={summary.blocked ?? 0} na={summary.na ?? 0}
                total={summary.total}
              />
            </div>
          </div>

          {/* Two-column body */}
          <div className="flex gap-5 mt-5 items-start">

            {/* Results list */}
            <div className="flex-1 min-w-0">
              <div className="card overflow-hidden">
                {/* Results header */}
                <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center gap-2 min-h-[42px]">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Results</span>
                  {filterStatus ? (
                    <>
                      <span className="text-xs text-text-muted">—</span>
                      <span className="text-xs font-semibold capitalize" style={{ color: statusColor(filterStatus) }}>
                        {filterStatus === 'na' ? 'N/A' : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} only
                        <span className="text-text-muted font-normal ml-1">({filteredCases.length})</span>
                      </span>
                      <button
                        onClick={() => { setFilterStatus(null); setPage(1) }}
                        className="ml-auto text-xs text-text-muted hover:text-text-primary transition-colors underline"
                      >
                        Clear filter
                      </button>
                    </>
                  ) : (
                    <span className="ml-auto text-xs text-text-muted">{summary.total} cases</span>
                  )}
                </div>

                {/* Case rows */}
                <div className="divide-y divide-border/50">
                  {pagedCases.length === 0 && (
                    <div className="px-4 py-8 text-center text-xs text-text-muted">No cases match this filter.</div>
                  )}
                  {pagedCases.map(c => {
                    const isRegression = regressionIds.has(c.case_id)
                    const isFix = fixIds.has(c.case_id)
                    const isNew = newCaseIds.has(c.case_id)
                    return (
                      <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="shrink-0 mt-0.5">
                          <StatusBadge status={c.status} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.case_number != null && (
                              <span className="text-xs font-mono text-text-muted/50 shrink-0">TC-{c.case_number}</span>
                            )}
                            <span className="text-sm text-text-primary">{c.title}</span>
                            {isRegression && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-fail bg-fail/10 border border-fail/20 px-1.5 py-0.5 rounded-full shrink-0">
                                <TrendingDown size={9} /> Regressed
                              </span>
                            )}
                            {isFix && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-pass bg-pass/10 border border-pass/20 px-1.5 py-0.5 rounded-full shrink-0">
                                <TrendingUp size={9} /> Fixed
                              </span>
                            )}
                            {isNew && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full shrink-0">
                                <Sparkles size={9} /> New
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                            <span>{c.suite_name}</span>
                            <span>·</span>
                            <PriorityBadge priority={c.priority} />
                          </div>
                          {c.step_results && <StepResultsList stepResults={c.step_results} />}
                          {c.note && (
                            <blockquote className="mt-1.5 text-xs text-text-muted border-l-2 border-border pl-2 font-mono">
                              {c.note}
                            </blockquote>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Pagination */}
                {pageCount > 1 && (
                  <div className="px-4 py-3 border-t border-border bg-surface-2 flex items-center justify-between gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                      className="btn-ghost text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    <div className="flex items-center gap-1 flex-wrap justify-center">
                      {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
                        const pg = i + 1
                        return (
                          <button
                            key={pg}
                            onClick={() => setPage(pg)}
                            className={`w-7 h-7 text-xs rounded transition-colors ${
                              pg === page
                                ? 'bg-accent text-white font-semibold'
                                : 'text-text-muted hover:bg-surface-2'
                            }`}
                          >
                            {pg}
                          </button>
                        )
                      })}
                      {pageCount > 7 && (
                        <span className="text-xs text-text-muted px-1">…{pageCount}</span>
                      )}
                    </div>
                    <button
                      disabled={page === pageCount}
                      onClick={() => setPage(p => p + 1)}
                      className="btn-ghost text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Defects sidebar (sticky) */}
            {defects.length > 0 && (
              <div className="w-72 shrink-0 sticky top-4">
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center gap-2">
                    <Bug size={13} className="text-fail" />
                    <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Defects Raised</span>
                    <span className="ml-auto text-xs text-text-muted">{defects.length}</span>
                  </div>
                  <div className="divide-y divide-border/50 max-h-[calc(100vh-22rem)] overflow-y-auto">
                    {defects.map((d: RunDefect) => (
                      <div key={d.jira_issue_key} className="px-3 py-2.5">
                        {d.jira_issue_url ? (
                          <a
                            href={d.jira_issue_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-accent hover:underline"
                          >
                            {d.jira_issue_key} <ExternalLink size={9} />
                          </a>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-accent">{d.jira_issue_key}</span>
                        )}
                        {d.jira_issue_summary && (
                          <div className="text-xs text-text-primary mt-0.5 line-clamp-2">{d.jira_issue_summary}</div>
                        )}
                        <div className="text-[10px] text-text-muted mt-0.5 truncate">
                          {d.suite_name} › {d.case_title}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}
