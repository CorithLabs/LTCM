import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, MinusCircle, ChevronLeft, ChevronRight, Flag,
  Loader2, OctagonX, Ban, Bug, X, ExternalLink, Paperclip, Trash2, Download,
} from 'lucide-react'
import {
  useRuns, useRunCases, useUpdateRunCase, useCompleteRun, useCancelRun, useCreateDefect,
  usePostJiraComment, useCaseJiraLinks, useJiraConfig,
  useAttachments, useUploadAttachment, useDeleteAttachment,
  RunCase, StepResult, RunCaseStatus,
} from '../api'
import { ConfirmModal, ProgressBar, Toast } from '../components'

const RUN_PANEL_KEY = 'ltcm-run-panel-width'
const DEFAULT_RUN_PANEL = 220
const MIN_RUN_PANEL = 160
const MAX_RUN_PANEL = 360

// ---- Step-level execution ----
function StepRow({ step, index, result, onChange }: {
  step: string; index: number; result: StepResult | undefined; onChange: (r: StepResult) => void
}) {
  const [actualResult, setActualResult] = useState(result?.actualResult || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  function handleActual(val: string) {
    setActualResult(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange({ stepIndex: index, status: result?.status || 'fail', actualResult: val })
    }, 500)
  }

  const isFail = result?.status === 'fail'
  const isPass = result?.status === 'pass'

  return (
    <li className="space-y-1.5">
      <div className="flex gap-3 items-start">
        <span className="font-mono text-xs text-text-muted shrink-0 pt-0.5 w-5">{index + 1}.</span>
        <span className="text-sm text-text-primary flex-1">{step}</span>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onChange({ stepIndex: index, status: 'pass', actualResult: '' })}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isPass ? 'bg-pass text-white' : 'bg-surface-2 text-text-muted hover:text-pass hover:bg-pass/10'}`}
            title="Step pass"
          >
            <CheckCircle2 size={13} />
          </button>
          <button
            onClick={() => onChange({ stepIndex: index, status: 'fail', actualResult })}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isFail ? 'bg-fail text-white' : 'bg-surface-2 text-text-muted hover:text-fail hover:bg-fail/10'}`}
            title="Step fail"
          >
            <XCircle size={13} />
          </button>
        </div>
      </div>
      {isFail && (
        <div className="ml-8">
          <input
            className="input text-xs font-mono py-1"
            placeholder="Actual result…"
            value={actualResult}
            onChange={e => handleActual(e.target.value)}
          />
        </div>
      )}
    </li>
  )
}

// ---- Create Defect modal ----
function CreateDefectModal({ rc, runId, onClose, onCreated }: {
  rc: RunCase; runId: string; onClose: () => void; onCreated: (key: string, url: string) => void
}) {
  const steps = rc.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const defaultDesc = [
    `Steps:\n${steps}`,
    `Expected Result:\n${rc.expected_result}`,
    rc.note ? `Tester Note:\n${rc.note}` : null,
  ].filter(Boolean).join('\n\n')

  const [summary, setSummary] = useState(rc.title)
  const [description, setDescription] = useState(defaultDesc)
  const [files, setFiles] = useState<File[]>([])
  const [attError, setAttError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const createDefect = useCreateDefect(runId, rc.id)

  function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...picked.filter(f => !names.has(f.name))]
    })
    e.target.value = ''
  }

  function removeFile(name: string) { setFiles(prev => prev.filter(f => f.name !== name)) }

  function formatSize(b: number) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  function submit() {
    setAttError(null)
    createDefect.mutate({ summary, description, attachments: files }, {
      onSuccess: (res) => {
        const failed = res.attachments?.filter((a: any) => !a.ok)
        if (failed?.length) setAttError(`${failed.length} attachment(s) failed to upload to Jira.`)
        onCreated(res.jiraIssueKey, res.jiraIssueUrl)
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
            <Bug size={15} className="text-fail" /> Create Defect
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={15} /></button>
        </div>

        <div>
          <label className="label">Summary</label>
          <input className="input" value={summary} onChange={e => setSummary(e.target.value)} maxLength={255} autoFocus />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className="input resize-none h-36 text-xs font-mono" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        {/* Attachments */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0 flex items-center gap-1.5"><Paperclip size={12} /> Attachments</label>
            <button className="btn-ghost text-xs py-1 px-2 flex items-center gap-1" onClick={() => fileRef.current?.click()}>
              <Paperclip size={11} /> Add Files
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={addFiles} />
          </div>
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map(f => (
                <div key={f.name} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border/40">
                  <Paperclip size={10} className="text-text-muted/50 shrink-0" />
                  <span className="text-xs text-text-primary truncate flex-1">{f.name}</span>
                  <span className="text-[10px] text-text-muted/50 shrink-0">{formatSize(f.size)}</span>
                  <button className="text-text-muted/50 hover:text-fail shrink-0" onClick={() => removeFile(f.name)}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {attError && <p className="text-fail text-xs mt-1">{attError}</p>}
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary text-sm" onClick={submit} disabled={!summary.trim() || createDefect.isPending}>
            {createDefect.isPending ? <Loader2 size={13} className="animate-spin" /> : <Bug size={13} />}
            Create Defect{files.length > 0 ? ` + ${files.length} file${files.length > 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Resize handle (dragging leftward increases right-panel width) ----
function RunResizeHandle({ onResize }: { onResize: (dx: number) => void }) {
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
      className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-accent/40 active:bg-accent/60 transition-colors select-none"
    />
  )
}

// ---- Attachments section ----
function AttachmentsSection({ runCaseId }: { runCaseId: string }) {
  const { data: attachments = [] } = useAttachments(runCaseId)
  const upload = useUploadAttachment(runCaseId)
  const deleteAtt = useDeleteAttachment(runCaseId)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    upload.mutate(file)
    e.target.value = ''
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide flex items-center gap-1.5">
          <Paperclip size={11} /> Attachments {attachments.length > 0 && <span className="text-text-muted/50">({attachments.length})</span>}
        </div>
        <button
          className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
          Attach
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border/40 group">
              <Paperclip size={10} className="text-text-muted/50 shrink-0" />
              <span className="text-xs text-text-primary truncate flex-1" title={att.original_name}>{att.original_name}</span>
              {att.size && <span className="text-[10px] text-text-muted/50 shrink-0">{formatSize(att.size)}</span>}
              <a
                href={`/api/v1/attachments/${att.id}/file`}
                download={att.original_name}
                className="text-text-muted/50 hover:text-accent shrink-0"
                title="Download"
              >
                <Download size={11} />
              </a>
              <button
                className="text-text-muted/50 hover:text-fail shrink-0"
                onClick={() => deleteAtt.mutate(att.id)}
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Case panel — two-column layout ----
function CasePanel({ rc, runId, onMark, onNote, onStepChange, isSaving, jiraConnected, panelWidth, onPanelResize }: {
  rc: RunCase; runId: string
  onMark: (id: string, status: RunCaseStatus) => void
  onNote: (id: string, note: string) => void
  onStepChange: (id: string, stepResults: StepResult[]) => void
  isSaving: boolean; jiraConnected: boolean
  panelWidth: number; onPanelResize: (dx: number) => void
}) {
  const [note, setNote] = useState(rc.note || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const [saved, setSaved] = useState(false)
  const [stepResults, setStepResults] = useState<StepResult[]>(rc.step_results || [])
  const [showDefect, setShowDefect] = useState(false)
  const [defectKey, setDefectKey] = useState<string | null>(null)
  const [defectUrl, setDefectUrl] = useState<string | null>(null)
  const [showLinkExisting, setShowLinkExisting] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [updatedKeys, setUpdatedKeys] = useState<Set<string>>(new Set())

  const { data: existingLinks = [] } = useCaseJiraLinks(rc.case_id, jiraConnected)
  const postComment = usePostJiraComment(runId, rc.id)
  const priorityColor = { high: 'text-fail', medium: 'text-progress', low: 'text-text-muted' }

  function handleNote(val: string) {
    setNote(val); setSaved(false)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { onNote(rc.id, val); setSaved(true) }, 500)
  }

  function handleStepChange(result: StepResult) {
    const next = [...stepResults.filter(r => r.stepIndex !== result.stepIndex), result]
      .sort((a, b) => a.stepIndex - b.stepIndex)
    setStepResults(next)
    onStepChange(rc.id, next)
    if (next.length === rc.steps.length)
      onMark(rc.id, next.some(r => r.status === 'fail') ? 'fail' : 'pass')
  }

  function handleUpdate(issueKey: string) {
    postComment.mutate(issueKey, { onSuccess: () => setUpdatedKeys(s => new Set(s).add(issueKey)) })
  }

  // Compact status button: icon + label side-by-side
  const sBtn = (status: RunCaseStatus, icon: React.ReactNode, label: string, activeClass: string, hoverClass: string) => (
    <button
      onClick={() => onMark(rc.id, status)}
      className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-semibold transition-all flex-1 ${rc.status === status
        ? activeClass
        : `bg-surface-2 border-border text-text-muted ${hoverClass}`}`}
    >
      {icon}<span>{label}</span>
    </button>
  )

  return (
    <div className="flex h-full">
      {/* ---- Left: case details + steps + notes ---- */}
      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wide">{rc.suite_name}</span>
              {rc.case_number != null && (
                <span className="text-xs font-mono text-text-muted/50 bg-surface-2 px-1.5 py-0.5 rounded">TC-{rc.case_number}</span>
              )}
            </div>
            <h2 className="text-base font-semibold text-text-primary leading-snug">{rc.title}</h2>
          </div>
          <span className={`text-xs font-semibold uppercase shrink-0 ${priorityColor[rc.priority]}`}>{rc.priority}</span>
        </div>

        {/* Preconditions */}
        {rc.preconditions && (
          <div className="p-3 rounded-lg bg-surface-2 border border-border">
            <div className="text-xs font-medium text-text-muted mb-1 uppercase tracking-wide">Preconditions</div>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{rc.preconditions}</p>
          </div>
        )}

        {/* Steps */}
        {rc.steps.length > 0 && (
          <div>
            <div className="text-xs font-medium text-text-muted mb-2 uppercase tracking-wide">Steps</div>
            <ol className="space-y-3">
              {rc.steps.map((step, i) => (
                <StepRow key={i} step={step} index={i}
                  result={stepResults.find(r => r.stepIndex === i)}
                  onChange={handleStepChange}
                />
              ))}
            </ol>
          </div>
        )}

        {/* Expected result */}
        <div className="p-4 rounded-lg border border-border bg-surface-2/60">
          <div className="text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wide">Expected Result</div>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{rc.expected_result}</p>
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-medium text-text-muted uppercase tracking-wide">Notes</div>
            {saved && <span className="text-xs text-text-muted">Saved</span>}
            {isSaving && <Loader2 size={11} className="animate-spin text-text-muted" />}
          </div>
          <textarea
            className="input resize-none h-24 text-sm font-mono w-full"
            placeholder="Observations, bug details, repro steps…"
            value={note}
            onChange={e => handleNote(e.target.value)}
          />
        </div>

        {/* Attachments */}
        <AttachmentsSection runCaseId={rc.id} />
      </div>

      {/* ---- Resize handle ---- */}
      <RunResizeHandle onResize={onPanelResize} />

      {/* ---- Right: verdict + Jira ---- */}
      <div className="shrink-0 border-l border-border bg-surface flex flex-col overflow-y-auto" style={{ width: panelWidth }}>
        <div className="px-3 py-4 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold">Result</div>

          {/* Pass | Fail */}
          <div className="flex gap-1.5">
            {sBtn('pass', <CheckCircle2 size={13} />, 'Pass',
              'bg-pass/15 border-pass/40 text-pass',
              'hover:border-pass/40 hover:text-pass hover:bg-pass/5')}
            {sBtn('fail', <XCircle size={13} />, 'Fail',
              'bg-fail/15 border-fail/40 text-fail',
              'hover:border-fail/40 hover:text-fail hover:bg-fail/5')}
          </div>

          {/* Skip | Blocked */}
          <div className="flex gap-1.5">
            {sBtn('skip', <MinusCircle size={13} />, 'Skip',
              'bg-skip/15 border-skip/40 text-skip',
              'hover:border-skip/40 hover:text-skip hover:bg-skip/5')}
            {sBtn('blocked', <OctagonX size={13} />, 'Blocked',
              'bg-orange-500/15 border-orange-500/40 text-orange-400',
              'hover:border-orange-500/40 hover:text-orange-400 hover:bg-orange-500/5')}
          </div>

          {/* N/A full width */}
          <button
            onClick={() => onMark(rc.id, 'na')}
            className={`w-full text-xs flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border transition-colors font-semibold ${rc.status === 'na'
              ? 'bg-slate-500/15 border-slate-500/40 text-slate-400'
              : 'border-border text-text-muted hover:border-slate-500/40 hover:text-slate-400'}`}
          >
            <Ban size={12} /> Not Applicable
          </button>

          {/* Jira section */}
          {jiraConnected && (existingLinks.length > 0 || rc.status === 'fail' || rc.status === 'blocked') && (
            <div className="pt-2 border-t border-border/50 space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold">Jira</div>

              {existingLinks.map(link => (
                updatedKeys.has(link.jira_issue_key) ? (
                  <div key={link.id} className="w-full text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-pass/30 bg-pass/8 text-pass">
                    <CheckCircle2 size={11} /> {link.jira_issue_key} updated
                  </div>
                ) : (
                  <button
                    key={link.id}
                    onClick={() => handleUpdate(link.jira_issue_key)}
                    disabled={postComment.isPending}
                    className="w-full text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-border text-text-muted hover:border-accent/40 hover:text-accent transition-colors"
                  >
                    {postComment.isPending ? <Loader2 size={11} className="animate-spin" /> : <Bug size={11} />}
                    Update {link.jira_issue_key}
                  </button>
                )
              ))}

              {(rc.status === 'fail' || rc.status === 'blocked') && (
                defectKey && defectUrl ? (
                  <a href={defectUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-fail/30 bg-fail/8 text-fail hover:bg-fail/15 transition-colors"
                  >
                    <Bug size={11} /> {defectKey} <ExternalLink size={10} className="ml-auto" />
                  </a>
                ) : (
                  <>
                    {/* Update existing bug */}
                    {showLinkExisting ? (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <input
                            className="input flex-1 text-xs font-mono py-1.5"
                            placeholder="PROJ-123"
                            value={linkInput}
                            onChange={e => setLinkInput(e.target.value.toUpperCase())}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && linkInput.trim()) handleUpdate(linkInput.trim())
                              if (e.key === 'Escape') { setShowLinkExisting(false); setLinkInput('') }
                            }}
                            autoFocus
                          />
                          <button
                            className="btn-ghost border border-orange-500/40 text-orange-400 px-2 py-1.5 text-xs"
                            onClick={() => { if (linkInput.trim()) handleUpdate(linkInput.trim()) }}
                            disabled={postComment.isPending || !linkInput.trim()}
                          >
                            {postComment.isPending ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                          </button>
                          <button className="btn-ghost px-2 py-1.5 text-xs text-text-muted" onClick={() => { setShowLinkExisting(false); setLinkInput('') }}>
                            <X size={11} />
                          </button>
                        </div>
                        <p className="text-[10px] text-text-muted/60">Enter issue key and press Enter to post a comment.</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowLinkExisting(true)}
                        className="w-full text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition-colors"
                      >
                        <Bug size={11} /> Update Existing Bug
                      </button>
                    )}

                    {/* Create new bug */}
                    <button
                      onClick={() => setShowDefect(true)}
                      className="w-full text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-fail/40 text-fail hover:bg-fail/10 transition-colors"
                    >
                      <Bug size={11} /> Create New Bug
                    </button>
                  </>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {showDefect && (
        <CreateDefectModal rc={rc} runId={runId}
          onClose={() => setShowDefect(false)}
          onCreated={(key, url) => { setDefectKey(key); setDefectUrl(url); setShowDefect(false) }}
        />
      )}
    </div>
  )
}

// ---- Run Execute Page ----
export default function RunExecutePage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>()!
  const { data: runs = [] } = useRuns(projectId!)
  const { data: cases = [], isLoading } = useRunCases(runId!)
  const updateCase = useUpdateRunCase(runId!)
  const completeRun = useCompleteRun(projectId!)
  const cancelRun = useCancelRun(projectId!)
  const { data: jiraCfg } = useJiraConfig()
  const jiraConnected = jiraCfg?.connected === true
  const navigate = useNavigate()

  const [currentIdx, setCurrentIdx] = useState(0)
  const [showComplete, setShowComplete] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [allMarkedBanner, setAllMarkedBanner] = useState(false)
  const allMarkedShownRef = useRef(false)
  const [toast, setToast] = useState<{ msg: string; type?: 'success' | 'error' } | null>(null)
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(RUN_PANEL_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_RUN_PANEL
  })
  const handlePanelResize = useCallback((dx: number) => {
    setPanelWidth(w => {
      const next = Math.max(MIN_RUN_PANEL, Math.min(MAX_RUN_PANEL, w + dx))
      localStorage.setItem(RUN_PANEL_KEY, String(next))
      return next
    })
  }, [])

  const run = runs.find(r => r.id === runId)
  const current = cases[currentIdx]

  const allMarked = cases.length > 0 && cases.every(c => c.status !== null)
  const marked = cases.filter(c => c.status !== null).length
  const passed = cases.filter(c => c.status === 'pass').length
  const failed = cases.filter(c => c.status === 'fail').length
  const skipped = cases.filter(c => c.status === 'skip').length
  const blocked = cases.filter(c => c.status === 'blocked').length
  const na = cases.filter(c => c.status === 'na').length
  const unmarked = cases.filter(c => c.status === null).length

  useEffect(() => {
    if (allMarked && !allMarkedShownRef.current) {
      allMarkedShownRef.current = true
      setAllMarkedBanner(true)
    }
  }, [allMarked])

  function mark(id: string, status: RunCaseStatus) {
    updateCase.mutate({ id, status }, {
      onError: (e: Error) => setToast({ msg: e.message, type: 'error' }),
    })
  }

  function addNote(id: string, note: string) {
    updateCase.mutate({ id, note }, { onError: (e: Error) => setToast({ msg: e.message, type: 'error' }) })
  }

  function saveStepResults(id: string, stepResults: StepResult[]) {
    updateCase.mutate({ id, stepResults }, { onError: (e: Error) => setToast({ msg: e.message, type: 'error' }) })
  }

  function doComplete(force = false) {
    setAllMarkedBanner(false)
    completeRun.mutate({ runId: runId!, force }, {
      onSuccess: (result: any) => {
        const comments: Array<{ issueKey: string; ok: boolean }> = result?.jiraComments || []
        if (comments.length > 0) {
          const ok = comments.filter(c => c.ok).length
          const fail = comments.length - ok
          const msg = fail === 0
            ? `Run complete · ${ok} Jira ticket${ok !== 1 ? 's' : ''} updated`
            : `Run complete · ${ok} ticket${ok !== 1 ? 's' : ''} updated, ${fail} failed`
          setToast({ msg, type: fail === 0 ? 'success' : 'error' })
          setTimeout(() => navigate(`/projects/${projectId}/runs/${runId}/summary`), 2500)
        } else {
          navigate(`/projects/${projectId}/runs/${runId}/summary`)
        }
      },
      onError: (e: Error) => setToast({ msg: e.message, type: 'error' })
    })
    setShowComplete(false)
  }

  if (isLoading) return (
    <div className="flex justify-center items-center h-full">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (run?.status === 'completed') return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <CheckCircle2 size={40} className="text-pass" />
      <p className="text-text-primary font-medium">Run completed</p>
      <button className="btn-primary" onClick={() => navigate(`/projects/${projectId}/runs/${runId}/summary`)}>
        View Summary
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ---- Run header ---- */}
      <div className="px-6 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {run?.name || 'Run'}
              {run?.environment && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-accent/10 text-accent font-medium">{run.environment}</span>
              )}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {marked} of {cases.length} marked
              {failed > 0 && <span className="text-fail ml-2">· {failed} failed</span>}
              {blocked > 0 && <span className="text-orange-400 ml-2">· {blocked} blocked</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs text-text-muted hover:text-fail border border-border" onClick={() => setShowCancel(true)}>
              <X size={13} /> Cancel Run
            </button>
            <button className="btn-primary text-xs" onClick={() => setShowComplete(true)}>
              <Flag size={13} /> Complete Run
            </button>
          </div>
        </div>
        <ProgressBar passed={passed} failed={failed} skipped={skipped} blocked={blocked} na={na} total={cases.length} />
      </div>

      {/* ---- Case navigation pills ---- */}
      <div className="px-6 py-2.5 flex gap-1.5 overflow-x-auto border-b border-border shrink-0">
        {cases.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setCurrentIdx(i)}
            className={`shrink-0 w-7 h-7 rounded-md text-xs font-mono font-medium transition-colors
              ${i === currentIdx ? 'bg-accent text-white' :
                c.status === 'pass' ? 'bg-pass/20 text-pass' :
                c.status === 'fail' ? 'bg-fail/20 text-fail' :
                c.status === 'skip' ? 'bg-skip/20 text-skip' :
                c.status === 'blocked' ? 'bg-orange-500/20 text-orange-400' :
                c.status === 'na' ? 'bg-slate-500/20 text-slate-400' :
                'bg-surface-2 text-text-muted hover:bg-border'}`}
            title={c.title}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* ---- Current case (two-column, fills remaining height) ---- */}
      <div className="flex-1 overflow-hidden">
        {current && (
          <CasePanel
            key={current.id}
            rc={current}
            runId={runId!}
            onMark={mark}
            onNote={addNote}
            onStepChange={saveStepResults}
            isSaving={updateCase.isPending}
            jiraConnected={jiraConnected}
            panelWidth={panelWidth}
            onPanelResize={handlePanelResize}
          />
        )}
      </div>

      {/* ---- Prev / Next footer ---- */}
      <div className="flex items-center justify-between px-6 py-2.5 border-t border-border bg-surface shrink-0">
        <button
          className="rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-1.5 border transition-all bg-accent/10 text-accent border-accent/30 hover:bg-accent/20 disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
        >
          <ChevronLeft size={15} /> Prev
        </button>
        <span className="text-xs text-text-muted">{currentIdx + 1} / {cases.length}</span>
        <button
          className="rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-1.5 border transition-all bg-pass/10 text-pass border-pass/30 hover:bg-pass/20 disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => setCurrentIdx(i => Math.min(cases.length - 1, i + 1))}
          disabled={currentIdx === cases.length - 1}
        >
          Next <ChevronRight size={15} />
        </button>
      </div>

      {/* ---- Modals ---- */}
      {showComplete && (
        unmarked > 0 ? (
          <ConfirmModal
            title="Complete run?"
            message={<>{unmarked} case{unmarked !== 1 ? 's have' : ' has'} no result. They will be marked as <strong>Skipped</strong>.</>}
            confirmLabel="Complete Anyway"
            onConfirm={() => doComplete(true)}
            onCancel={() => setShowComplete(false)}
          />
        ) : (
          <ConfirmModal
            title="Complete run?"
            message="All cases have been marked. Ready to complete and lock the results?"
            confirmLabel="Complete Run"
            onConfirm={() => doComplete(false)}
            onCancel={() => setShowComplete(false)}
          />
        )
      )}

      {showCancel && (
        <ConfirmModal
          title="Cancel run?"
          message="This will permanently cancel the run. All recorded results will be discarded."
          confirmLabel="Cancel Run"
          danger
          onConfirm={() => {
            cancelRun.mutate(runId!, {
              onSuccess: () => navigate(`/projects/${projectId}`),
              onError: (e: Error) => setToast({ msg: e.message, type: 'error' }),
            })
            setShowCancel(false)
          }}
          onCancel={() => setShowCancel(false)}
        />
      )}

      {allMarkedBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-pass/30 shadow-2xl">
          <CheckCircle2 size={16} className="text-pass shrink-0" />
          <span className="text-sm text-text-primary font-medium">All test cases marked.</span>
          <button
            className="btn-primary text-xs py-1.5 px-3"
            onClick={() => { setAllMarkedBanner(false); setShowComplete(true) }}
          >
            Complete Run
          </button>
          <button className="text-text-muted hover:text-text-primary text-xs ml-1" onClick={() => setAllMarkedBanner(false)}>
            Dismiss
          </button>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}
