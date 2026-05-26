import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, Copy, ArrowRight, GripVertical, FileUp,
  Loader2, X, CheckCircle2, FileText, Link2, Play, ExternalLink,
  ChevronUp, ChevronDown, Columns3, Radio, RefreshCw
} from 'lucide-react'
import {
  DndContext, DragEndEvent, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useSuites, useCases, useUpdateSuite, useUpdateCase, useDeleteSuite, useDeleteCase,
  useDuplicateCase, useMoveCase, useJiraConfig, useCaseJiraLinks, useImportCases,
  useSuiteStats, useCaseHistory, useSuiteBugs, useRuns,
  Suite, TestCase, ImportResult, SuiteBug, RunCase
} from '../api'
import { useQuery } from '@tanstack/react-query'
import { ConfirmModal, PriorityBadge, ProgressBar, Toast } from '../components'

const DETAIL_WIDTH_KEY = 'ltcm-detail-pane-width'
const DEFAULT_DETAIL_WIDTH = 380
const MIN_DETAIL_WIDTH = 260
const MAX_DETAIL_WIDTH = 640
const SUITE_COLS_KEY = 'ltcm-suite-grid-cols'
const SUITE_VIEW_KEY = 'ltcm-suite-view'

type PanelView = 'alltime' | 'lastrun'

// ---- Column definitions ----
type ColId = 'tc_id' | 'last_result' | 'bugs_created' | 'linked_tickets' | 'priority'
type SortKey = ColId

const TOGGLEABLE_COLS: { id: ColId; label: string; width: string }[] = [
  { id: 'tc_id',          label: 'TC ID',          width: '72px'  },
  { id: 'last_result',    label: 'Last Result',    width: '110px' },
  { id: 'bugs_created',   label: 'Bug Created',    width: '140px' },
  { id: 'linked_tickets', label: 'Linked Tickets', width: '140px' },
  { id: 'priority',       label: 'Priority',       width: '90px'  },
]
const DEFAULT_VISIBLE: ColId[] = ['tc_id', 'last_result', 'bugs_created', 'linked_tickets', 'priority']

function getGridTemplate(visible: ColId[]) {
  const parts = ['24px'] // drag
  if (visible.includes('tc_id')) parts.push('72px')
  parts.push('1fr')  // name (always after tc_id)
  if (visible.includes('last_result')) parts.push('110px')
  if (visible.includes('bugs_created')) parts.push('140px')
  if (visible.includes('linked_tickets')) parts.push('140px')
  if (visible.includes('priority')) parts.push('90px')
  parts.push('76px')  // actions
  return parts.join(' ')
}

// cell index for a column given visible set
function colIndex(id: ColId, visible: ColId[]) {
  // drag=0, then visible cols in TOGGLEABLE_COLS order, then name, then actions
  let idx = 1
  for (const col of TOGGLEABLE_COLS) {
    if (!visible.includes(col.id)) continue
    if (col.id === id) return idx
    idx++
  }
  return idx // shouldn't reach
}

// ---- Sort helpers ----
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
const STATUS_ORDER: Record<string, number> = { fail: 0, blocked: 1, pass: 2, skip: 3, na: 4 }

function sortCases(
  cases: TestCase[],
  bugMap: Record<string, { bugsCreated: SuiteBug[]; linkedTickets: SuiteBug[] }>,
  key: SortKey | null,
  dir: 'asc' | 'desc'
) {
  if (!key) return cases
  return [...cases].sort((a, b) => {
    let va = 0, vb = 0
    if (key === 'tc_id') {
      va = a.case_number ?? 99999
      vb = b.case_number ?? 99999
    } else if (key === 'last_result') {
      va = a.last_run_status ? (STATUS_ORDER[a.last_run_status] ?? 5) : 99
      vb = b.last_run_status ? (STATUS_ORDER[b.last_run_status] ?? 5) : 99
    } else if (key === 'bugs_created') {
      va = bugMap[a.id]?.bugsCreated.length ?? 0
      vb = bugMap[b.id]?.bugsCreated.length ?? 0
    } else if (key === 'linked_tickets') {
      va = bugMap[a.id]?.linkedTickets.length ?? 0
      vb = bugMap[b.id]?.linkedTickets.length ?? 0
    } else if (key === 'priority') {
      va = PRIORITY_ORDER[a.priority] ?? 1
      vb = PRIORITY_ORDER[b.priority] ?? 1
    }
    return dir === 'asc' ? va - vb : vb - va
  })
}

// ---- Import result modal ----
function ImportResultModal({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card p-6 w-full max-w-sm shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Import Complete</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={15} /></button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-pass">
            <CheckCircle2 size={16} />
            <span className="text-sm font-medium">{result.imported} case{result.imported !== 1 ? 's' : ''} imported</span>
          </div>
          {result.skipped.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-text-muted font-medium">{result.skipped.length} row{result.skipped.length !== 1 ? 's' : ''} skipped:</p>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {result.skipped.map(s => (
                  <li key={s.row} className="text-xs text-text-muted font-mono">Row {s.row}: {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button className="btn-primary text-sm w-full" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

// ---- View toggle ----
function ViewToggle({ view, onChange }: { view: PanelView; onChange: (v: PanelView) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-border text-xs shrink-0">
      <button
        onClick={() => onChange('alltime')}
        className={`px-2.5 py-1 transition-colors ${view === 'alltime' ? 'bg-accent/15 text-accent font-medium' : 'text-text-muted hover:text-text-primary'}`}
      >
        All Time
      </button>
      <button
        onClick={() => onChange('lastrun')}
        className={`px-2.5 py-1 transition-colors border-l border-border ${view === 'lastrun' ? 'bg-accent/15 text-accent font-medium' : 'text-text-muted hover:text-text-primary'}`}
      >
        Last Run
      </button>
    </div>
  )
}

// ---- Last Run panel (suite-scoped) ----
function LastRunSuitePanel({ projectId, suiteName }: { projectId: string; suiteName: string }) {
  const navigate = useNavigate()
  const { data: runs = [], isLoading: runsLoading } = useRuns(projectId)
  const latestRun = runs[0] ?? null
  const isInProgress = latestRun?.status === 'in_progress'

  const { data: runCases = [], isLoading: casesLoading } = useQuery<RunCase[]>({
    queryKey: ['runCases', latestRun?.id],
    queryFn: () => fetch(`/api/v1/runs/${latestRun!.id}/cases`).then(r => r.json()),
    enabled: !!latestRun,
    refetchInterval: isInProgress ? 5000 : false,
  })

  const suiteCases = runCases.filter(c => c.suite_name === suiteName)

  if (runsLoading) return (
    <div className="flex items-center justify-center py-2">
      <Loader2 size={13} className="animate-spin text-text-muted" />
    </div>
  )

  if (!latestRun) return (
    <div className="text-xs text-text-muted text-center py-2">No runs yet</div>
  )

  const pass    = suiteCases.filter(c => c.status === 'pass').length
  const fail    = suiteCases.filter(c => c.status === 'fail').length
  const skip    = suiteCases.filter(c => c.status === 'skip').length
  const blocked = suiteCases.filter(c => c.status === 'blocked').length
  const na      = suiteCases.filter(c => c.status === 'na').length
  const pending = suiteCases.filter(c => !c.status).length
  const total   = suiteCases.length
  const done    = pass + fail + skip + blocked + na
  const passRate = total > 0 && done > 0 ? Math.round((pass / total) * 100) : null

  const statusCls = (s: string | null) =>
    s === 'pass'    ? 'bg-pass/15 text-pass' :
    s === 'fail'    ? 'bg-fail/15 text-fail' :
    s === 'blocked' ? 'bg-orange-500/15 text-orange-400' :
    s === 'skip'    ? 'bg-skip/15 text-skip' :
    s === 'na'      ? 'bg-slate-500/15 text-slate-400' :
                      'bg-surface-2 text-text-muted'

  return (
    <div className="flex flex-col gap-2">
      {/* Run header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {isInProgress ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-progress/15 text-progress border border-progress/20">
              <Radio size={9} className="animate-pulse" /> In Progress
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-pass/10 text-pass border border-pass/20">
              Completed
            </span>
          )}
          <span className="text-xs font-semibold text-text-primary truncate">
            {latestRun.run_number != null ? `RUN-${latestRun.run_number}` : latestRun.name}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {isInProgress && <RefreshCw size={11} className="text-progress animate-spin" />}
          <span className="text-[10px] text-text-muted">
            {new Date(latestRun.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => navigate(`/projects/${projectId}/runs/${latestRun.id}/summary`)}
            className="flex items-center gap-1 text-[10px] text-accent hover:underline font-medium"
          >
            Report <ExternalLink size={9} />
          </button>
        </div>
      </div>

      {/* Overall bar for this suite */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-2">
            {pass    > 0 && <div className="bg-pass"       style={{ width: `${(pass    / total) * 100}%` }} />}
            {fail    > 0 && <div className="bg-fail"       style={{ width: `${(fail    / total) * 100}%` }} />}
            {skip    > 0 && <div className="bg-skip"       style={{ width: `${(skip    / total) * 100}%` }} />}
            {blocked > 0 && <div className="bg-orange-500" style={{ width: `${(blocked / total) * 100}%` }} />}
            {pending > 0 && <div className="bg-border"     style={{ width: `${(pending / total) * 100}%` }} />}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-text-muted flex-wrap">
            {pass    > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-pass" />{pass}P</span>}
            {fail    > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-fail" />{fail}F</span>}
            {skip    > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-skip" />{skip}S</span>}
            {blocked > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />{blocked}B</span>}
            {pending > 0 && <span className="text-text-muted/50">{pending} pending</span>}
            {passRate !== null && <span className="ml-auto font-semibold text-text-primary">{passRate}% pass</span>}
          </div>
        </div>
      )}

      {/* Per-case status list */}
      {casesLoading ? (
        <div className="flex justify-center py-1"><Loader2 size={12} className="animate-spin text-text-muted" /></div>
      ) : suiteCases.length > 0 ? (
        <div className="space-y-0.5 max-h-28 overflow-y-auto">
          {suiteCases.map(c => (
            <div key={c.id} className="flex items-center gap-2">
              <span className={`inline-flex text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 min-w-[38px] justify-center ${statusCls(c.status)}`}>
                {c.status ? c.status.toUpperCase() : '—'}
              </span>
              <span className="text-[10px] text-text-primary truncate">{c.title}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ---- Suite stats / top bar (with All Time / Last Run toggle) ----
function SuiteTopBar({ suiteId, projectId, suiteName }: {
  suiteId: string; projectId: string; suiteName: string
}) {
  const { data: stats } = useSuiteStats(suiteId)
  const [view, setView] = useState<PanelView>(() =>
    (localStorage.getItem(`${SUITE_VIEW_KEY}-${suiteId}`) as PanelView) ?? 'alltime'
  )

  function changeView(v: PanelView) {
    setView(v)
    localStorage.setItem(`${SUITE_VIEW_KEY}-${suiteId}`, v)
  }

  if (!stats || stats.total_runs === 0) return null

  const { passed, failed, skipped, blocked, na, passRate, total_cases, total_runs } = stats
  const total = passed + failed + skipped + blocked + na

  if (view === 'lastrun') {
    return (
      <div className="px-4 py-2.5 border-b border-border/50 bg-surface-2/30 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Last Run</span>
          <div className="ml-auto"><ViewToggle view={view} onChange={changeView} /></div>
        </div>
        <LastRunSuitePanel projectId={projectId} suiteName={suiteName} />
      </div>
    )
  }

  return (
    <div className="px-4 py-2.5 border-b border-border/50 bg-surface-2/30 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">All Time</span>
        <span className="text-xs text-text-muted/60">· {total_runs} run{total_runs !== 1 ? 's' : ''} · {total_cases} case{total_cases !== 1 ? 's' : ''}</span>
        <div className="ml-auto"><ViewToggle view={view} onChange={changeView} /></div>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-24">
          <ProgressBar passed={passed} failed={failed} skipped={skipped} blocked={blocked} na={na} total={total || 1} />
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          {passed > 0 && <span className="text-pass">{passed}P</span>}
          {failed > 0 && <span className="text-fail">{failed}F</span>}
          {skipped > 0 && <span className="text-skip">{skipped}S</span>}
          {blocked > 0 && <span className="text-orange-400">{blocked}B</span>}
          {na > 0 && <span className="text-slate-400">{na}N/A</span>}
          {passRate !== null && <span className="font-semibold text-text-primary">{passRate}% pass</span>}
        </div>
      </div>
    </div>
  )
}

// ---- Case detail pane ----
function CaseDetailPane({ tc, projectId, suiteId, onClose }: {
  tc: TestCase; projectId: string; suiteId: string; onClose: () => void
}) {
  const navigate = useNavigate()
  const { data: jiraCfg } = useJiraConfig()
  const { data: jiraLinks = [] } = useCaseJiraLinks(tc.id, jiraCfg?.connected === true)
  const { data: history = [] } = useCaseHistory(tc.id)
  const [historyExpanded, setHistoryExpanded] = useState(true)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-start gap-2 px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {tc.case_number != null && (
              <span className="text-xs font-mono text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">TC-{tc.case_number}</span>
            )}
            <PriorityBadge priority={tc.priority} />
            {tc.last_run_status && tc.last_run_id && (
              <button
                onClick={() => navigate(`/projects/${tc.last_run_project_id}/runs/${tc.last_run_id}/summary`)}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-opacity hover:opacity-80 ${
                  tc.last_run_status === 'pass'    ? 'bg-pass/15 text-pass' :
                  tc.last_run_status === 'fail'    ? 'bg-fail/15 text-fail' :
                  tc.last_run_status === 'blocked' ? 'bg-orange-500/15 text-orange-400' :
                  tc.last_run_status === 'na'      ? 'bg-slate-500/15 text-slate-400' :
                                                     'bg-surface-2 text-text-muted'
                }`}
              >
                <Play size={9} />{tc.last_run_status.toUpperCase()}
              </button>
            )}
            {jiraLinks.map(link => (
              <span key={link.id} className="inline-flex items-center gap-0.5 text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                <Link2 size={9} />{link.jira_issue_key}
              </span>
            ))}
          </div>
          <h2 className="text-sm font-semibold text-text-primary mt-1.5 leading-snug">{tc.title}</h2>
        </div>
        <div className="flex gap-1 shrink-0">
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navigate(`/projects/${projectId}/cases/${tc.id}/edit`)} title="Edit case">
            <Pencil size={12} />
          </button>
          <button className="btn-ghost px-2 py-1" onClick={onClose} title="Close"><X size={14} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {tc.preconditions && (
          <section>
            <h3 className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold mb-1.5">Preconditions</h3>
            <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">{tc.preconditions}</p>
          </section>
        )}
        {tc.steps.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold mb-1.5">Steps</h3>
            <ol className="space-y-1.5">
              {tc.steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-xs text-text-muted shrink-0 w-4 text-right font-mono">{i + 1}.</span>
                  <span className="text-xs text-text-primary leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <section>
          <h3 className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold mb-1.5">Expected Result</h3>
          <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">{tc.expected_result}</p>
        </section>
        {(tc.created_by_username || tc.updated_by_username) && (
          <section className="space-y-1">
            {tc.created_by_username && (
              <p className="text-[11px] text-text-muted/60">
                Created by <span className="text-text-muted font-medium">{tc.created_by_username}</span>
                {tc.created_at && <> · {tc.created_at.slice(0, 10)}</>}
              </p>
            )}
            {tc.updated_by_username && (
              <p className="text-[11px] text-text-muted/60">
                Last edited by <span className="text-text-muted font-medium">{tc.updated_by_username}</span>
                {tc.updated_at && <> · {tc.updated_at.slice(0, 10)}</>}
              </p>
            )}
          </section>
        )}
        {history.length > 0 && (
          <section>
            <button
              className="w-full flex items-center gap-1.5 mb-1.5 group"
              onClick={() => setHistoryExpanded(v => !v)}
            >
              <h3 className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold">Run History</h3>
              <span className="text-[10px] text-text-muted/40">({history.length})</span>
              {historyExpanded
                ? <ChevronUp size={11} className="text-text-muted/40 group-hover:text-text-muted" />
                : <ChevronDown size={11} className="text-text-muted/40 group-hover:text-text-muted" />}
            </button>
            {historyExpanded && (
              <div className="space-y-1.5">
                {history.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => navigate(`/projects/${projectId}/runs/${entry.run_id}/summary`)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 hover:bg-surface border border-border/40 text-left transition-colors"
                  >
                    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                      entry.status === 'pass'    ? 'bg-pass/15 text-pass' :
                      entry.status === 'fail'    ? 'bg-fail/15 text-fail' :
                      entry.status === 'blocked' ? 'bg-orange-500/15 text-orange-400' :
                      entry.status === 'skip'    ? 'bg-skip/15 text-skip' :
                      entry.status === 'na'      ? 'bg-slate-500/15 text-slate-400' :
                                                   'bg-surface text-text-muted'
                    }`}>
                      {(entry.status || 'pending').toUpperCase()}
                    </span>
                    <span className="text-xs text-text-primary truncate flex-1">
                      {entry.run_number != null ? `RUN-${entry.run_number}` : entry.run_name}
                    </span>
                    <span className="text-[10px] text-text-muted/50 shrink-0">{entry.created_at?.slice(0, 10)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

// ---- Resize handle ----
function ResizeHandle({ onResize }: { onResize: (dx: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    lastX.current = e.clientX
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onResize(lastX.current - ev.clientX)
      lastX.current = ev.clientX
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-accent/40 transition-colors active:bg-accent/60 select-none"
    />
  )
}

// ---- Bug chips ----
function BugChips({ bugs, max = 2 }: { bugs: SuiteBug[]; max?: number }) {
  if (bugs.length === 0) return <span className="text-[10px] text-text-muted/30">—</span>
  const shown = bugs.slice(0, max)
  const rest = bugs.length - max
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map(b => (
        b.jira_issue_url ? (
          <a
            key={b.id}
            href={b.jira_issue_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold text-fail bg-fail/10 hover:bg-fail/20 px-1.5 py-0.5 rounded transition-colors"
            title={b.jira_issue_summary || b.jira_issue_key}
          >
            {b.jira_issue_key} <ExternalLink size={8} />
          </a>
        ) : (
          <span key={b.id} className="inline-flex items-center text-[10px] font-mono font-semibold text-fail bg-fail/10 px-1.5 py-0.5 rounded">
            {b.jira_issue_key}
          </span>
        )
      ))}
      {rest > 0 && <span className="text-[10px] text-text-muted">+{rest}</span>}
    </div>
  )
}

function TicketChips({ bugs, max = 2 }: { bugs: SuiteBug[]; max?: number }) {
  if (bugs.length === 0) return <span className="text-[10px] text-text-muted/30">—</span>
  const shown = bugs.slice(0, max)
  const rest = bugs.length - max
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map(b => (
        b.jira_issue_url ? (
          <a
            key={b.id}
            href={b.jira_issue_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-1.5 py-0.5 rounded transition-colors"
            title={b.jira_issue_summary || b.jira_issue_key}
          >
            {b.jira_issue_key} <ExternalLink size={8} />
          </a>
        ) : (
          <span key={b.id} className="inline-flex items-center text-[10px] font-mono font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
            {b.jira_issue_key}
          </span>
        )
      ))}
      {rest > 0 && <span className="text-[10px] text-text-muted">+{rest}</span>}
    </div>
  )
}

// ---- Grid header ----
function GridHeader({
  visible, sortKey, sortDir, onSort, jiraConnected
}: {
  visible: ColId[]
  sortKey: SortKey | null
  sortDir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  jiraConnected: boolean
}) {
  const gridTemplateColumns = getGridTemplate(visible)

  function SortBtn({ id, label }: { id: SortKey; label: string }) {
    const active = sortKey === id
    return (
      <button
        onClick={() => onSort(id)}
        className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider hover:text-text-primary transition-colors w-full ${
          active ? 'text-accent' : 'text-text-muted'
        }`}
      >
        {label}
        {active
          ? sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />
          : <ChevronUp size={9} className="opacity-20" />}
      </button>
    )
  }

  return (
    <div
      className="grid items-center border-b border-border bg-surface-2/50 shrink-0 min-w-0"
      style={{ gridTemplateColumns }}
    >
      <div /> {/* drag placeholder */}
      {visible.includes('tc_id') && (
        <div className="px-2 py-2"><SortBtn id="tc_id" label="TC ID" /></div>
      )}
      <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Name</div>
      {visible.includes('last_result') && (
        <div className="px-2 py-2"><SortBtn id="last_result" label="Last Result" /></div>
      )}
      {visible.includes('bugs_created') && (
        <div className="px-2 py-2"><SortBtn id="bugs_created" label="Bug Created" /></div>
      )}
      {visible.includes('linked_tickets') && (
        <div className="px-2 py-2"><SortBtn id="linked_tickets" label="Linked Tickets" /></div>
      )}
      {visible.includes('priority') && (
        <div className="px-2 py-2"><SortBtn id="priority" label="Priority" /></div>
      )}
      <div /> {/* actions placeholder */}
    </div>
  )
}

// ---- Case grid row ----
function CaseGridRow({ tc, projectId, suiteId, suites, isActive, onSelect, onDelete,
  bugsCreated, linkedTickets, visible, jiraConnected
}: {
  tc: TestCase; projectId: string; suiteId: string; suites: Suite[]
  isActive: boolean; onSelect: () => void; onDelete: (id: string) => void
  bugsCreated: SuiteBug[]; linkedTickets: SuiteBug[]
  visible: ColId[]; jiraConnected: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tc.id })
  const navigate = useNavigate()
  const [showMove, setShowMove] = useState(false)
  const duplicateMut = useDuplicateCase(suiteId, projectId)
  const moveMut = useMoveCase(projectId)
  const otherSuites = suites.filter(s => s.id !== suiteId)
  const gridTemplateColumns = getGridTemplate(visible)

  function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation()
    duplicateMut.mutate(tc.id, {
      onSuccess: (copy) => navigate(`/projects/${projectId}/cases/${copy.id}/edit`)
    })
  }
  function handleMove(destSuiteId: string) {
    moveMut.mutate({ id: tc.id, suite_id: destSuiteId }, { onSuccess: () => setShowMove(false) })
  }

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const statusCls = (s: string | null) =>
    s === 'pass'    ? 'bg-pass/15 text-pass' :
    s === 'fail'    ? 'bg-fail/15 text-fail' :
    s === 'blocked' ? 'bg-orange-500/15 text-orange-400' :
    s === 'na'      ? 'bg-slate-500/15 text-slate-400' :
                      'bg-surface-2 text-text-muted'

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, gridTemplateColumns }}
      className={`grid items-center border-b border-border/40 cursor-pointer group transition-colors min-w-0 ${
        isActive ? 'bg-accent/8 border-l-2 border-l-accent' : 'hover:bg-surface-2/60'
      }`}
      onClick={onSelect}
    >
      {/* drag */}
      <button
        className="flex justify-center text-text-muted/30 hover:text-text-muted/60 cursor-grab active:cursor-grabbing touch-none py-2.5"
        aria-label="Drag to reorder"
        onClick={e => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={12} />
      </button>

      {/* TC ID */}
      {visible.includes('tc_id') && (
        <div className="px-2 py-2.5">
          {tc.case_number != null
            ? <span className="text-[10px] font-mono text-text-muted">TC-{tc.case_number}</span>
            : <span className="text-[10px] text-text-muted/30">—</span>}
        </div>
      )}

      {/* Name */}
      <div className="px-2 py-2.5 min-w-0">
        <div className={`text-xs truncate ${isActive ? 'text-accent font-medium' : 'text-text-primary'}`}>
          {tc.title}
        </div>
        <div className="text-[10px] text-text-muted/50 mt-0.5">
          {tc.steps.length} step{tc.steps.length !== 1 ? 's' : ''}
        </div>
        {tc.tags && tc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tc.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium leading-none">
                {tag}
              </span>
            ))}
            {tc.tags.length > 3 && (
              <span className="text-[9px] text-text-muted leading-none">+{tc.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Last Result */}
      {visible.includes('last_result') && (
        <div className="px-2 py-2.5">
          {tc.last_run_status && tc.last_run_id ? (
            <button
              onClick={e => { e.stopPropagation(); navigate(`/projects/${tc.last_run_project_id}/runs/${tc.last_run_id}/summary`) }}
              className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusCls(tc.last_run_status)}`}
            >
              <Play size={8} />{tc.last_run_status.toUpperCase()}
            </button>
          ) : (
            <span className="text-[10px] text-text-muted/30">—</span>
          )}
        </div>
      )}

      {/* Bug Created */}
      {visible.includes('bugs_created') && (
        <div className="px-2 py-2.5">
          <BugChips bugs={bugsCreated} />
        </div>
      )}

      {/* Linked Tickets */}
      {visible.includes('linked_tickets') && (
        <div className="px-2 py-2.5">
          <TicketChips bugs={linkedTickets} />
        </div>
      )}

      {/* Priority */}
      {visible.includes('priority') && (
        <div className="px-2 py-2.5">
          <PriorityBadge priority={tc.priority} />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-0.5 justify-end px-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <button className="btn-ghost px-1.5 py-1" title="Edit" onClick={() => navigate(`/projects/${projectId}/cases/${tc.id}/edit`)}>
          <Pencil size={11} />
        </button>
        <button className="btn-ghost px-1.5 py-1" title="Duplicate" onClick={handleDuplicate} disabled={duplicateMut.isPending}>
          <Copy size={11} />
        </button>
        {otherSuites.length > 0 && (
          <div className="relative">
            <button className="btn-ghost px-1.5 py-1" title="Move to suite" onClick={() => setShowMove(v => !v)}>
              <ArrowRight size={11} />
            </button>
            {showMove && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-36">
                <div className="px-3 py-1 text-[10px] text-text-muted font-semibold uppercase tracking-wide">Move to</div>
                {otherSuites.map(s => (
                  <button key={s.id} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors" onClick={() => handleMove(s.id)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="btn-ghost px-1.5 py-1 hover:text-fail" title="Delete" onClick={() => onDelete(tc.id)}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

// ---- Column toggle popover ----
function ColumnsPopover({ visible, onChange, jiraConnected }: {
  visible: ColId[]; onChange: (v: ColId[]) => void; jiraConnected: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggleCol = (id: ColId) => {
    const next = visible.includes(id) ? visible.filter(c => c !== id) : [...visible, id]
    if (next.length === 0) return // keep at least one
    onChange(next)
  }

  const cols = TOGGLEABLE_COLS

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(v => !v)} title="Toggle columns">
        <Columns3 size={12} /> Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-surface border border-border rounded-lg shadow-xl py-2 min-w-44">
          <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Visible columns</div>
          {cols.map(col => (
            <label key={col.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 cursor-pointer text-xs transition-colors">
              <input
                type="checkbox"
                checked={visible.includes(col.id)}
                onChange={() => toggleCol(col.id)}
                className="accent-accent"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Suite Page ----
export default function SuitePage() {
  const { projectId, suiteId, caseId } = useParams<{ projectId: string; suiteId: string; caseId?: string }>()
  const navigate = useNavigate()

  const { data: suites = [] } = useSuites(projectId!)
  const suite = suites.find(s => s.id === suiteId)
  const { data: jiraCfg } = useJiraConfig()
  const jiraConnected = jiraCfg?.connected === true

  // Bugs data (always fetch — stored locally, no Jira connection required to display)
  const { data: suiteBugs = [] } = useSuiteBugs(suiteId!)

  // Bug map: case_id → { bugsCreated, linkedTickets }
  const bugMap = useMemo(() => {
    const map: Record<string, { bugsCreated: SuiteBug[]; linkedTickets: SuiteBug[] }> = {}
    for (const bug of suiteBugs) {
      if (!map[bug.case_id]) map[bug.case_id] = { bugsCreated: [], linkedTickets: [] }
      if (bug.link_type === 'created') map[bug.case_id].bugsCreated.push(bug)
      else if (bug.link_type === 'manual') map[bug.case_id].linkedTickets.push(bug)
    }
    return map
  }, [suiteBugs])

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<ColId[]>(() => {
    try {
      const saved = localStorage.getItem(SUITE_COLS_KEY)
      if (saved) return JSON.parse(saved) as ColId[]
    } catch {}
    return DEFAULT_VISIBLE
  })

  function updateVisibleCols(cols: ColId[]) {
    setVisibleCols(cols)
    localStorage.setItem(SUITE_COLS_KEY, JSON.stringify(cols))
  }

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const { data: fetchedCases = [], isLoading } = useCases(suiteId!)
  const [localCaseIds, setLocalCaseIds] = useState<string[] | null>(null)

  const orderedCases = localCaseIds
    ? fetchedCases.slice().sort((a, b) => localCaseIds.indexOf(a.id) - localCaseIds.indexOf(b.id))
    : fetchedCases

  const cases = useMemo(
    () => sortCases(orderedCases, bugMap, sortKey, sortDir),
    [orderedCases, bugMap, sortKey, sortDir]
  )

  const activeCase = fetchedCases.find(c => c.id === caseId) || null

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [epicEditing, setEpicEditing] = useState(false)
  const [epicInput, setEpicInput] = useState('')
  const updateSuite = useUpdateSuite(projectId!)
  const deleteSuiteMut = useDeleteSuite(projectId!)
  const [confirmDeleteSuite, setConfirmDeleteSuite] = useState(false)

  const updateCase = useUpdateCase(suiteId!)
  const deleteCaseMut = useDeleteCase(suiteId!, projectId!)
  const [deleteCase, setDeleteCase] = useState<string | null>(null)

  const importMut = useImportCases(suiteId!, projectId!)
  const importRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const [detailWidth, setDetailWidth] = useState<number>(() => {
    const saved = localStorage.getItem(DETAIL_WIDTH_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_DETAIL_WIDTH
  })

  const handleResize = useCallback((dx: number) => {
    setDetailWidth(w => {
      const next = Math.max(MIN_DETAIL_WIDTH, Math.min(MAX_DETAIL_WIDTH, w + dx))
      localStorage.setItem(DETAIL_WIDTH_KEY, String(next))
      return next
    })
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => { if (suite) setEditName(suite.name) }, [suite])

  function saveRename() {
    if (!editName.trim()) { setEditName(suite?.name || ''); setEditing(false); return }
    updateSuite.mutate({ id: suiteId!, name: editName.trim() }, { onSuccess: () => setEditing(false) })
  }

  function saveEpicKey() {
    const key = epicInput.trim().toUpperCase()
    if (!key) { setEpicEditing(false); return }
    updateSuite.mutate({ id: suiteId!, jiraEpicKey: key }, { onSuccess: () => setEpicEditing(false) })
  }

  function clearEpicKey() {
    updateSuite.mutate({ id: suiteId!, jiraEpicKey: null })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    // Use original (unsorted) case order for reordering
    const ids = orderedCases.map(c => c.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    const reordered = arrayMove(ids, oldIndex, newIndex)
    setLocalCaseIds(reordered)
    reordered.forEach((id, i) => updateCase.mutate({ id, order: i }))
    // Clear sort so the manual order is visible
    setSortKey(null)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    importMut.mutate(file, {
      onSuccess: (result) => setImportResult(result),
      onError: (err: any) => setImportError(err.message || 'Import failed'),
    })
  }

  function selectCase(tc: TestCase) {
    if (caseId === tc.id) navigate(`/projects/${projectId}/suites/${suiteId}`)
    else navigate(`/projects/${projectId}/suites/${suiteId}/cases/${tc.id}`)
  }

  function closeDetail() {
    navigate(`/projects/${projectId}/suites/${suiteId}`)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---- Center pane ---- */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">

        {/* Suite header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface shrink-0">
          {editing ? (
            <input
              className="input py-1 text-sm font-semibold flex-1"
              autoFocus value={editName}
              onChange={e => setEditName(e.target.value)}
              maxLength={100}
              onKeyDown={e => {
                if (e.key === 'Enter') saveRename()
                if (e.key === 'Escape') { setEditName(suite?.name || ''); setEditing(false) }
              }}
              onBlur={saveRename}
            />
          ) : (
            <h1
              className="flex-1 text-sm font-semibold text-text-primary truncate flex items-center gap-2 cursor-text hover:opacity-70 transition-opacity"
              onClick={() => setEditing(true)}
              title="Click to rename"
            >
              {suite?.suite_number != null && (
                <span className="text-xs font-mono font-normal text-text-muted/50 shrink-0">TS-{suite.suite_number}</span>
              )}
              {suite?.name || '…'}
            </h1>
          )}

          <span className="text-xs text-text-muted shrink-0 bg-surface-2 px-2 py-0.5 rounded-md">
            {cases.length} case{cases.length !== 1 ? 's' : ''}
          </span>

          {/* Epic badge */}
          {suite && (
            epicEditing ? (
              <input
                className="input py-0.5 text-xs font-mono w-32 shrink-0"
                autoFocus
                placeholder="e.g. PROJ-456"
                value={epicInput}
                onChange={e => setEpicInput(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEpicKey()
                  if (e.key === 'Escape') setEpicEditing(false)
                }}
                onBlur={() => setEpicEditing(false)}
              />
            ) : suite.jira_epic_key ? (
              <span className="flex items-center gap-1 shrink-0 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {suite.jira_epic_url ? (
                  <a href={suite.jira_epic_url} target="_blank" rel="noreferrer" className="hover:underline" title={suite.jira_epic_name || suite.jira_epic_key} onClick={e => e.stopPropagation()}>
                    {suite.jira_epic_key}
                  </a>
                ) : (
                  <span title={suite.jira_epic_name || undefined}>{suite.jira_epic_key}</span>
                )}
                {suite.jira_epic_name && (
                  <span className="font-normal text-purple-400/70 max-w-[120px] truncate" title={suite.jira_epic_name}>{suite.jira_epic_name}</span>
                )}
                <button
                  className="text-purple-400/50 hover:text-fail ml-0.5 leading-none"
                  title="Unlink epic"
                  onClick={clearEpicKey}
                  onMouseDown={e => e.preventDefault()}
                >
                  <X size={10} />
                </button>
              </span>
            ) : (
              <button
                className="btn-ghost px-1.5 py-0.5 text-[11px] text-text-muted/50 hover:text-purple-400 shrink-0"
                title="Link Jira Epic"
                onClick={() => { setEpicInput(''); setEpicEditing(true) }}
              >
                <Link2 size={11} /> Epic
              </button>
            )
          )}

          <div className="flex gap-1">
            <button className="btn-primary px-2 py-1 text-xs" onClick={() => navigate(`/projects/${projectId}/runs/new?suiteId=${suiteId}`)} disabled={cases.length === 0}>
              <Play size={12} /> Run
            </button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navigate(`/projects/${projectId}/cases/new?suiteId=${suiteId}`)}>
              <Plus size={12} /> Add
            </button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => importRef.current?.click()} disabled={importMut.isPending}>
              {importMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
              Import
            </button>
            <ColumnsPopover visible={visibleCols} onChange={updateVisibleCols} jiraConnected={jiraConnected} />
            <button className="btn-ghost px-2 py-1 hover:text-fail" title="Delete suite" onClick={() => setConfirmDeleteSuite(true)}>
              <Trash2 size={12} />
            </button>
          </div>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
        </div>

        {/* Stats bar */}
        <SuiteTopBar suiteId={suiteId!} projectId={projectId!} suiteName={suite?.name ?? ''} />

        {/* Grid header */}
        {cases.length > 0 && (
          <GridHeader
            visible={visibleCols}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            jiraConnected={jiraConnected}
          />
        )}

        {/* Case grid */}
        <div className="flex-1 overflow-y-auto overflow-x-auto">
          {isLoading && (
            <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
          )}

          {!isLoading && cases.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
              <FileText size={32} className="text-text-muted/30" />
              <p className="text-sm text-text-primary font-medium">No test cases yet</p>
              <p className="text-xs text-text-muted">Add your first test case to this suite.</p>
              <button className="btn-ghost text-xs mt-1" onClick={() => navigate(`/projects/${projectId}/cases/new?suiteId=${suiteId}`)}>
                <Plus size={11} /> Add first test case
              </button>
            </div>
          )}

          {cases.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={cases.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {cases.map(tc => (
                  <CaseGridRow
                    key={tc.id}
                    tc={tc}
                    projectId={projectId!}
                    suiteId={suiteId!}
                    suites={suites}
                    isActive={tc.id === caseId}
                    onSelect={() => selectCase(tc)}
                    onDelete={id => setDeleteCase(id)}
                    bugsCreated={bugMap[tc.id]?.bugsCreated ?? []}
                    linkedTickets={bugMap[tc.id]?.linkedTickets ?? []}
                    visible={visibleCols}
                    jiraConnected={jiraConnected}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* ---- Right detail pane ---- */}
      {activeCase && (
        <>
          <ResizeHandle onResize={handleResize} />
          <div className="flex flex-col shrink-0 overflow-hidden bg-surface" style={{ width: detailWidth }}>
            <CaseDetailPane tc={activeCase} projectId={projectId!} suiteId={suiteId!} onClose={closeDetail} />
          </div>
        </>
      )}

      {/* ---- Modals ---- */}
      {confirmDeleteSuite && (
        <ConfirmModal
          title="Delete suite?"
          message={<>Delete <strong>{suite?.name}</strong> and all {suite?.case_count ?? 0} test cases inside it? This cannot be undone.</>}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            deleteSuiteMut.mutate(suiteId!, { onSuccess: () => navigate(`/projects/${projectId}`) })
            setConfirmDeleteSuite(false)
          }}
          onCancel={() => setConfirmDeleteSuite(false)}
        />
      )}

      {deleteCase && (
        <ConfirmModal
          title="Delete test case?"
          message={<>Delete <strong>{fetchedCases.find(c => c.id === deleteCase)?.title}</strong>? Completed run history will be preserved.</>}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            if (caseId === deleteCase) closeDetail()
            deleteCaseMut.mutate(deleteCase)
            setDeleteCase(null)
          }}
          onCancel={() => setDeleteCase(null)}
        />
      )}

      {importResult && <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />}
      {importError && <Toast message={importError} type="error" onDismiss={() => setImportError(null)} />}
    </div>
  )
}
