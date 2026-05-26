import { useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Play, ClipboardList, Trash2, Pencil, Loader2, History,
  GripVertical, FileUp, CheckCircle2, X, Layers, Bug, ExternalLink, ExternalLink as LinkOut,
  Sun, CloudSun, CloudLightning, CloudOff, RefreshCw, Radio
} from 'lucide-react'
import {
  DndContext, DragEndEvent, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useProjects, useSuites, useCreateSuite, useUpdateSuite, useDeleteSuite, useImportCases,
  useProjectStats, useProjectBugs, useRuns,
  Suite, ImportResult, ProjectBug, SuiteStatEntry, RunCase
} from '../api'
import { useQuery } from '@tanstack/react-query'
import { ConfirmModal, EmptyState, PageHeader, ProgressBar, Toast } from '../components'

const PROJ_PANEL_WIDTH_KEY = 'ltcm-proj-panel-width'
const PROJ_VIEW_KEY = 'ltcm-proj-view'
const DEFAULT_PANEL_WIDTH = 260
const MIN_PANEL_WIDTH = 180
const MAX_PANEL_WIDTH = 500

// ---- Donut chart ----
function StatsDonut({ passed, failed, skipped, blocked, na, passRate }: {
  passed: number; failed: number; skipped: number; blocked: number; na: number; passRate: number | null
}) {
  const total = passed + failed + skipped + blocked + na
  if (total === 0) return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <CloudOff size={20} className="text-text-muted/30" />
      <span className="text-[10px] text-text-muted">No runs yet</span>
    </div>
  )

  const r = 34
  const C = 2 * Math.PI * r
  const data = [
    { value: passed,  color: '#22c55e' },
    { value: failed,  color: '#f43f5e' },
    { value: skipped, color: '#71717a' },
    { value: blocked, color: '#f97316' },
    { value: na,      color: '#64748b' },
  ].filter(d => d.value > 0)

  let acc = 0
  const GAP = total > 1 ? 0.02 * C : 0 // tiny gap between segments

  return (
    <div className="flex flex-col items-center gap-3 h-full justify-center py-3 px-4">
      <div className="relative" style={{ width: 96, height: 96 }}>
        <svg viewBox="0 0 96 96" width="96" height="96" style={{ transform: 'rotate(-90deg)' }}>
          {/* track */}
          <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="14" opacity="0.06" />
          {data.map((d, i) => {
            const len = Math.max(0, (d.value / total) * C - (data.length > 1 ? GAP : 0))
            const dashOffset = -acc
            acc += (d.value / total) * C
            return (
              <circle
                key={i}
                cx="48" cy="48" r={r}
                fill="none"
                stroke={d.color}
                strokeWidth="14"
                strokeDasharray={`${len} ${C}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {passRate !== null && (
            <>
              <span className="text-base font-bold text-text-primary leading-none">{passRate}%</span>
              <span className="text-[9px] text-text-muted mt-0.5">pass</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {passed  > 0 && <span className="flex items-center gap-1 text-[10px] text-text-muted"><span className="w-2 h-2 rounded-full bg-pass shrink-0" />{passed}P</span>}
        {failed  > 0 && <span className="flex items-center gap-1 text-[10px] text-text-muted"><span className="w-2 h-2 rounded-full bg-fail shrink-0" />{failed}F</span>}
        {skipped > 0 && <span className="flex items-center gap-1 text-[10px] text-text-muted"><span className="w-2 h-2 rounded-full bg-skip shrink-0" />{skipped}S</span>}
        {blocked > 0 && <span className="flex items-center gap-1 text-[10px] text-text-muted"><span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />{blocked}B</span>}
        {na      > 0 && <span className="flex items-center gap-1 text-[10px] text-text-muted"><span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />{na}N/A</span>}
      </div>
    </div>
  )
}

// ---- Defect overview (right panel) ----
function DefectOverview({ projectId, bugs }: { projectId: string; bugs: ProjectBug[] }) {
  const navigate = useNavigate()

  const created   = bugs.filter(b => b.link_type === 'created')
  const commented = bugs.filter(b => b.link_type === 'comment')
  const visibleBugs = bugs.filter(b => b.link_type === 'created' || b.link_type === 'comment')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <Bug size={13} className="text-text-muted/60" />
        <span className="text-xs font-semibold text-text-primary flex-1">Defect Overview</span>
        <div className="flex items-center gap-2 text-[10px]">
          {created.length > 0 && (
            <span className="bg-fail/10 text-fail px-1.5 py-0.5 rounded-full font-semibold">{created.length} filed</span>
          )}
          {commented.length > 0 && (
            <span className="bg-progress/10 text-progress px-1.5 py-0.5 rounded-full font-semibold">{commented.length} commented</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border/30 border-t border-border/50">
        {visibleBugs.map(bug => (
          <div key={bug.id} className="flex items-start gap-2 px-3 py-2 hover:bg-surface-2/30 transition-colors">
            <div className="shrink-0 pt-0.5">
              {bug.jira_issue_url ? (
                <a
                  href={bug.jira_issue_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className={`inline-flex items-center gap-0.5 font-mono text-[10px] font-bold hover:underline ${
                    bug.link_type === 'created' ? 'text-fail' : 'text-accent'
                  }`}
                >
                  {bug.jira_issue_key} <ExternalLink size={8} />
                </a>
              ) : (
                <span className={`font-mono text-[10px] font-bold ${bug.link_type === 'created' ? 'text-fail' : 'text-accent'}`}>
                  {bug.jira_issue_key}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {bug.jira_issue_summary && (
                <div className="text-[10px] text-text-primary truncate leading-tight">{bug.jira_issue_summary}</div>
              )}
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                <span className="text-[9px] text-text-muted/60 truncate max-w-24">{bug.suite_name}</span>
                <span className="text-text-muted/30 text-[9px]">›</span>
                <button
                  className="text-[9px] text-accent hover:underline truncate max-w-36 text-left"
                  onClick={() => navigate(`/projects/${projectId}/suites/${bug.suite_id}/cases/${bug.case_id}`)}
                >
                  {bug.case_number != null ? `TC-${bug.case_number} · ` : ''}{bug.case_title}
                </button>
                {bug.run_id && (
                  <>
                    <span className="text-text-muted/30 text-[9px]">›</span>
                    <button
                      className="text-[9px] text-text-muted hover:text-accent hover:underline"
                      onClick={() => navigate(`/projects/${projectId}/runs/${bug.run_id}/summary`)}
                    >
                      {bug.run_number != null ? `RUN-${bug.run_number}` : bug.run_name}
                    </button>
                  </>
                )}
              </div>
            </div>

            <span className={`shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded ${
              bug.link_type === 'created'  ? 'bg-fail/10 text-fail' :
              bug.link_type === 'comment'  ? 'bg-progress/10 text-progress' :
              'bg-surface-2 text-text-muted'
            }`}>
              {bug.link_type === 'created' ? 'Filed' : bug.link_type === 'comment' ? 'Commented' : 'Linked'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Resize handle (vertical bar between panels) ----
function PanelResizeHandle({ onResize }: { onResize: (dx: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    lastX.current = e.clientX
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onResize(ev.clientX - lastX.current)
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
      className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-accent/40 transition-colors active:bg-accent/60 select-none self-stretch"
    />
  )
}

// ---- View toggle pills ----
type PanelView = 'alltime' | 'lastrun'

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

// ---- Per-suite stats from a run's cases ----
interface SuiteRunStats {
  name: string; pass: number; fail: number; skip: number
  blocked: number; na: number; pending: number; total: number
}

function buildSuiteStats(cases: RunCase[]): SuiteRunStats[] {
  const map: Record<string, SuiteRunStats> = {}
  for (const c of cases) {
    if (!map[c.suite_name]) map[c.suite_name] = { name: c.suite_name, pass: 0, fail: 0, skip: 0, blocked: 0, na: 0, pending: 0, total: 0 }
    const s = map[c.suite_name]
    s.total++
    if (c.status === 'pass') s.pass++
    else if (c.status === 'fail') s.fail++
    else if (c.status === 'skip') s.skip++
    else if (c.status === 'blocked') s.blocked++
    else if (c.status === 'na') s.na++
    else s.pending++
  }
  return Object.values(map)
}

// ---- Last Run panel ----
function LastRunPanel({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { data: runs = [], isLoading: runsLoading } = useRuns(projectId)

  const latestRun = runs[0] ?? null
  const isInProgress = latestRun?.status === 'in_progress'

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['runSummary', latestRun?.id],
    queryFn: () => fetch(`/api/v1/runs/${latestRun!.id}/summary`).then(r => r.json()),
    enabled: !!latestRun,
    refetchInterval: isInProgress ? 5000 : false,
  })

  if (runsLoading) return (
    <div className="flex items-center justify-center h-32">
      <Loader2 size={16} className="animate-spin text-text-muted" />
    </div>
  )

  if (!latestRun) return (
    <div className="flex items-center justify-center h-32 text-xs text-text-muted">No runs yet</div>
  )

  const suiteStats = summary ? buildSuiteStats(summary.cases ?? []) : []
  const total = latestRun.passed + latestRun.failed + latestRun.skipped + latestRun.blocked + latestRun.na
  const passRate = total > 0 ? Math.round((latestRun.passed / total) * 100) : null

  return (
    <div className="flex flex-col gap-3">
      {/* Run header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {isInProgress ? (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-progress/15 text-progress border border-progress/20">
              <Radio size={9} className="animate-pulse" /> In Progress
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pass/10 text-pass border border-pass/20">
              Completed
            </span>
          )}
          <span className="text-sm font-semibold text-text-primary truncate">
            {latestRun.run_number != null ? `RUN-${latestRun.run_number}` : latestRun.name}
          </span>
          {latestRun.name && latestRun.run_number != null && (
            <span className="text-xs text-text-muted truncate">· {latestRun.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {isInProgress && <RefreshCw size={11} className="text-progress animate-spin" />}
          <span className="text-[10px] text-text-muted">
            {new Date(latestRun.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={() => navigate(`/projects/${projectId}/runs/${latestRun.id}/summary`)}
            className="flex items-center gap-1 text-[10px] text-accent hover:underline font-medium"
          >
            View Report <LinkOut size={9} />
          </button>
        </div>
      </div>

      {/* Overall bar */}
      <div className="space-y-1">
        <div className="flex h-2 rounded-full overflow-hidden bg-surface-2">
          {latestRun.passed  > 0 && <div className="bg-pass"          style={{ width: `${(latestRun.passed  / (latestRun.case_count || 1)) * 100}%` }} />}
          {latestRun.failed  > 0 && <div className="bg-fail"          style={{ width: `${(latestRun.failed  / (latestRun.case_count || 1)) * 100}%` }} />}
          {latestRun.skipped > 0 && <div className="bg-skip"          style={{ width: `${(latestRun.skipped / (latestRun.case_count || 1)) * 100}%` }} />}
          {latestRun.blocked > 0 && <div className="bg-orange-500"    style={{ width: `${(latestRun.blocked / (latestRun.case_count || 1)) * 100}%` }} />}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-text-muted flex-wrap">
          {latestRun.passed  > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-pass" />{latestRun.passed}P</span>}
          {latestRun.failed  > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-fail" />{latestRun.failed}F</span>}
          {latestRun.skipped > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-skip" />{latestRun.skipped}S</span>}
          {latestRun.blocked > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />{latestRun.blocked}B</span>}
          {passRate !== null && <span className="ml-auto font-semibold text-text-primary">{passRate}% pass</span>}
          <span className="text-text-muted/50">{latestRun.case_count} cases</span>
        </div>
      </div>

      {/* Per-suite breakdown */}
      {summaryLoading ? (
        <div className="flex justify-center py-2"><Loader2 size={13} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {suiteStats.map(s => {
            const done = s.pass + s.fail + s.skip + s.blocked + s.na
            const pct = s.total > 0 ? Math.round((s.pass / s.total) * 100) : 0
            return (
              <div key={s.name} className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted truncate w-36 shrink-0">{s.name}</span>
                <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-surface-2">
                  {s.pass    > 0 && <div className="bg-pass"       style={{ width: `${(s.pass    / s.total) * 100}%` }} />}
                  {s.fail    > 0 && <div className="bg-fail"       style={{ width: `${(s.fail    / s.total) * 100}%` }} />}
                  {s.skip    > 0 && <div className="bg-skip"       style={{ width: `${(s.skip    / s.total) * 100}%` }} />}
                  {s.blocked > 0 && <div className="bg-orange-500" style={{ width: `${(s.blocked / s.total) * 100}%` }} />}
                  {s.pending > 0 && <div className="bg-border"     style={{ width: `${(s.pending / s.total) * 100}%` }} />}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] shrink-0 w-24 justify-end">
                  {s.pass    > 0 && <span className="text-pass font-medium">{s.pass}P</span>}
                  {s.fail    > 0 && <span className="text-fail font-medium">{s.fail}F</span>}
                  {s.skip    > 0 && <span className="text-skip">{s.skip}S</span>}
                  {s.pending > 0 && <span className="text-text-muted/50">{s.pending}·</span>}
                  {done === 0    && <span className="text-text-muted/40">—</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---- Project top panel ----
// No bugs → compact progress bar card
// Has bugs → donut (left) + defect overview (right), resizable
function ProjectTopPanel({ projectId }: { projectId: string }) {
  const { data: stats } = useProjectStats(projectId)
  const { data: bugs = [], isLoading: bugsLoading } = useProjectBugs(projectId)

  const [view, setView] = useState<PanelView>(() =>
    (localStorage.getItem(`${PROJ_VIEW_KEY}-${projectId}`) as PanelView) ?? 'alltime'
  )

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem(PROJ_PANEL_WIDTH_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH
  })

  const handleResize = useCallback((dx: number) => {
    setPanelWidth(w => {
      const next = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, w + dx))
      localStorage.setItem(PROJ_PANEL_WIDTH_KEY, String(next))
      return next
    })
  }, [])

  function changeView(v: PanelView) {
    setView(v)
    localStorage.setItem(`${PROJ_VIEW_KEY}-${projectId}`, v)
  }

  if (!stats || stats.total_runs === 0) return null

  const { passed, failed, skipped, blocked, na, passRate, total_cases, total_runs } = stats
  const executed = passed + failed + skipped + blocked + na
  const hasBugs = !bugsLoading && bugs.some(b => b.link_type === 'created' || b.link_type === 'comment')

  // ---- Last Run view ----
  if (view === 'lastrun') {
    return (
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Last Run</span>
          <div className="ml-auto"><ViewToggle view={view} onChange={changeView} /></div>
        </div>
        <LastRunPanel projectId={projectId} />
      </div>
    )
  }

  // ---- All Time: no bugs → progress bar ----
  if (!hasBugs) {
    return (
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">All Time</span>
          <span className="text-xs text-text-muted/60">
            · {total_runs} run{total_runs !== 1 ? 's' : ''} · {total_cases} case{total_cases !== 1 ? 's' : ''}
          </span>
          <div className="ml-auto"><ViewToggle view={view} onChange={changeView} /></div>
        </div>
        <div className="mb-2">
          <ProgressBar passed={passed} failed={failed} skipped={skipped} blocked={blocked} na={na} total={executed || 1} />
        </div>
        <div className="flex items-center gap-4 flex-wrap mt-2">
          {passed  > 0 && <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pass" /><span className="text-xs text-text-muted">{passed} pass</span></div>}
          {failed  > 0 && <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-fail" /><span className="text-xs text-text-muted">{failed} fail</span></div>}
          {skipped > 0 && <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-skip" /><span className="text-xs text-text-muted">{skipped} skip</span></div>}
          {blocked > 0 && <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /><span className="text-xs text-text-muted">{blocked} blocked</span></div>}
          {na      > 0 && <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-500" /><span className="text-xs text-text-muted">{na} N/A</span></div>}
          {passRate !== null && <span className="ml-auto text-sm font-bold text-text-primary">{passRate}% pass rate</span>}
        </div>
      </div>
    )
  }

  // ---- All Time: has bugs → donut + defect overview ----
  return (
    <div className="card mb-4 flex overflow-hidden" style={{ height: 212 }}>
      {/* Left: donut */}
      <div className="shrink-0 flex flex-col" style={{ width: panelWidth }}>
        <div className="px-3 pt-2.5 shrink-0 flex items-center gap-2">
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">All Time</span>
          <span className="text-[10px] text-text-muted/50">
            {total_runs} run{total_runs !== 1 ? 's' : ''} · {total_cases} case{total_cases !== 1 ? 's' : ''}
          </span>
          <div className="ml-auto"><ViewToggle view={view} onChange={changeView} /></div>
        </div>
        <StatsDonut passed={passed} failed={failed} skipped={skipped} blocked={blocked} na={na} passRate={passRate} />
      </div>

      <PanelResizeHandle onResize={handleResize} />

      {/* Right: defect overview */}
      <div className="flex-1 min-w-0">
        <DefectOverview projectId={projectId} bugs={bugs} />
      </div>
    </div>
  )
}

// ---- Suite health icon ----
function SuiteHealthIcon({ stats }: { stats: SuiteStatEntry | undefined }) {
  if (!stats || stats.total_runs === 0) return null
  const total = stats.passed + stats.failed + stats.skipped + stats.blocked + stats.na
  if (total === 0) return null
  const failRate = stats.failed / total
  if (failRate === 0) return <span title="All tests passing"><Sun size={15} className="text-yellow-400 shrink-0" /></span>
  if (failRate <= 0.25) return <span title="Some failures"><CloudSun size={15} className="text-amber-400 shrink-0" /></span>
  return <span title="High failure rate"><CloudLightning size={15} className="text-red-400 shrink-0" /></span>
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

// ---- Sortable suite card ----
function SortableSuiteCard({ suite, projectId, suites, suiteStats, onDelete }: {
  suite: Suite; projectId: string; suites: Suite[]; suiteStats: SuiteStatEntry | undefined; onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: suite.id })
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(suite.name)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const updateSuite = useUpdateSuite(projectId)
  const importMut = useImportCases(suite.id, projectId)

  function saveRename() {
    if (!editName.trim()) { setEditName(suite.name); setEditing(false); return }
    updateSuite.mutate({ id: suite.id, name: editName.trim() }, { onSuccess: () => setEditing(false) })
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

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="card group flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors cursor-pointer"
        onClick={() => navigate(`/projects/${projectId}/suites/${suite.id}`)}
      >
        {suites.length > 1 && (
          <button
            className="text-text-muted/30 hover:text-text-muted/60 cursor-grab active:cursor-grabbing touch-none shrink-0"
            aria-label="Drag to reorder"
            onClick={e => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={13} />
          </button>
        )}

        {/* Weather icon */}
        <SuiteHealthIcon stats={suiteStats} />

        <Layers size={14} className="text-text-muted/50 shrink-0" />

        <div className="flex-1 min-w-0" onClick={e => editing && e.stopPropagation()}>
          {editing ? (
            <input
              className="input py-0.5 text-sm font-medium w-full"
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              maxLength={100}
              onKeyDown={e => {
                if (e.key === 'Enter') saveRename()
                if (e.key === 'Escape') { setEditName(suite.name); setEditing(false) }
              }}
              onBlur={saveRename}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm font-medium text-text-primary truncate flex items-center gap-2">
              {suite.suite_number != null && (
                <span className="text-xs font-mono font-normal text-text-muted/50 shrink-0">TS-{suite.suite_number}</span>
              )}
              {suite.name}
            </span>
          )}
        </div>

        {/* Suite stats mini-summary */}
        {suiteStats && suiteStats.total_runs > 0 && (() => {
          const t = suiteStats.passed + suiteStats.failed + suiteStats.skipped + suiteStats.blocked + suiteStats.na
          const pct = t > 0 ? Math.round((suiteStats.passed / t) * 100) : 0
          return (
            <div className="flex items-center gap-2 text-[10px] shrink-0">
              {suiteStats.failed > 0 && <span className="text-fail font-semibold">{suiteStats.failed}F</span>}
              <span className="text-text-muted">{pct}% pass</span>
            </div>
          )
        })()}

        <span className="text-xs text-text-muted shrink-0">
          {suite.case_count} case{suite.case_count !== 1 ? 's' : ''}
        </span>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            title="Add case"
            onClick={() => navigate(`/projects/${projectId}/cases/new?suiteId=${suite.id}`)}
          >
            <Plus size={11} /> Add
          </button>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            title="Import from Excel"
            disabled={importMut.isPending}
            onClick={() => importRef.current?.click()}
          >
            {importMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <FileUp size={11} />}
            Import
          </button>
          <button className="btn-ghost px-1.5 py-1" title="Rename" onClick={() => setEditing(true)}>
            <Pencil size={11} />
          </button>
          <button
            className="btn-ghost px-1.5 py-1 hover:text-fail"
            title="Delete"
            onClick={() => onDelete(suite.id)}
          >
            <Trash2 size={11} />
          </button>
        </div>

        <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
      </div>

      {importResult && <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />}
      {importError && <Toast message={importError} type="error" onDismiss={() => setImportError(null)} />}
    </>
  )
}

// ---- Project Page ----
export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()!
  const { data: projects = [] } = useProjects()
  const { data: fetchedSuites = [], isLoading } = useSuites(projectId!)
  const { data: stats } = useProjectStats(projectId!)
  const [localSuiteIds, setLocalSuiteIds] = useState<string[] | null>(null)
  const suites = localSuiteIds
    ? fetchedSuites.slice().sort((a, b) => localSuiteIds.indexOf(a.id) - localSuiteIds.indexOf(b.id))
    : fetchedSuites

  const createSuite = useCreateSuite(projectId!)
  const updateSuite = useUpdateSuite(projectId!)
  const deleteSuiteMut = useDeleteSuite(projectId!)
  const navigate = useNavigate()

  const [showNewSuite, setShowNewSuite] = useState(false)
  const [suiteName, setSuiteName] = useState('')
  const [suiteDesc, setSuiteDesc] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Suite | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const project = projects.find(p => p.id === projectId)
  const totalCases = suites.reduce((n, s) => n + s.case_count, 0)

  // Build suite → stats lookup
  const suiteStatsMap: Record<string, SuiteStatEntry> = {}
  for (const s of stats?.suiteStats ?? []) suiteStatsMap[s.id] = s

  function submitSuite() {
    if (!suiteName.trim()) return
    createSuite.mutate({ name: suiteName.trim(), description: suiteDesc.trim() || undefined }, {
      onSuccess: () => { setShowNewSuite(false); setSuiteName(''); setSuiteDesc('') },
      onError: (e: Error) => setToast(e.message)
    })
  }

  function handleSuiteDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = suites.map(s => s.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    const reordered = arrayMove(ids, oldIndex, newIndex)
    setLocalSuiteIds(reordered)
    reordered.forEach((id, i) => updateSuite.mutate({ id, order: i }))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={project?.name || '…'}
        subtitle={`${suites.length} suite${suites.length !== 1 ? 's' : ''} · ${totalCases} case${totalCases !== 1 ? 's' : ''}`}
        actions={
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={() => navigate(`/projects/${projectId}/runs`)}>
              <History size={14} /> Runs
            </button>
            <button className="btn-primary text-sm" onClick={() => navigate(`/projects/${projectId}/runs/new`)}>
              <Play size={14} /> Start Run
            </button>
            <button className="btn-ghost text-sm" onClick={() => setShowNewSuite(true)}>
              <Plus size={14} /> Suite
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Top panel: stats donut + defect overview */}
        <ProjectTopPanel projectId={projectId!} />

        {/* New suite form */}
        {showNewSuite && (
          <div className="card p-5 mb-4">
            <h3 className="text-sm font-semibold mb-3">New Suite</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Name <span className="text-fail">*</span></label>
                <input
                  className="input"
                  autoFocus
                  placeholder="e.g. Login Flow, Checkout"
                  value={suiteName}
                  onChange={e => setSuiteName(e.target.value)}
                  maxLength={100}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitSuite()
                    if (e.key === 'Escape') setShowNewSuite(false)
                  }}
                />
              </div>
              <div>
                <label className="label">Description <span className="text-text-muted">(optional)</span></label>
                <input
                  className="input"
                  placeholder="What does this suite cover?"
                  value={suiteDesc}
                  onChange={e => setSuiteDesc(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button className="btn-ghost" onClick={() => setShowNewSuite(false)}>Cancel</button>
                <button className="btn-primary" onClick={submitSuite} disabled={!suiteName.trim()}>
                  <Plus size={13} /> Create Suite
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        )}

        {!isLoading && suites.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={40} />}
            title="No suites yet"
            description="Organise your test cases into suites by feature or module."
            action={
              <button className="btn-primary" onClick={() => setShowNewSuite(true)}>
                <Plus size={14} /> Create Suite
              </button>
            }
          />
        )}

        {suites.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSuiteDragEnd}>
            <SortableContext items={suites.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {suites.map(suite => (
                  <SortableSuiteCard
                    key={suite.id}
                    suite={suite}
                    projectId={projectId!}
                    suites={suites}
                    suiteStats={suiteStatsMap[suite.id]}
                    onDelete={id => setDeleteTarget(suites.find(s => s.id === id) || null)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Delete suite?"
          message={
            <>This will delete <strong>{deleteTarget.name}</strong> and all {deleteTarget.case_count} test cases inside it.</>
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => { deleteSuiteMut.mutate(deleteTarget.id); setDeleteTarget(null) }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
