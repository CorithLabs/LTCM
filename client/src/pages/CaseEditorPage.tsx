import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Loader2, Save, Link2, X } from 'lucide-react'
import { useSuites, useCases, useCreateCase, useUpdateCase, useJiraConfig, useCaseJiraLinks, useLinkJiraIssue, useUnlinkJiraIssue } from '../api'
import { PageHeader, Toast } from '../components'

// ---- TagInput ----
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addTag(raw: string) {
    const val = raw.trim().toLowerCase().slice(0, 30)
    if (!val || tags.includes(val) || tags.length >= 20) return
    onChange([...tags, val])
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter(t => t !== tag))
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 p-2 min-h-[38px] rounded-lg border border-border bg-surface-2 cursor-text focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 bg-accent/15 text-accent text-xs px-2 py-0.5 rounded-full font-medium"
        >
          {tag}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); removeTag(tag) }}
            className="hover:text-fail transition-colors leading-none"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length === 0 ? 'Add tags…' : ''}
        className="flex-1 min-w-16 bg-transparent text-xs text-text-primary placeholder:text-text-muted/40 outline-none"
      />
    </div>
  )
}

export default function CaseEditorPage() {
  const { projectId, caseId } = useParams<{ projectId: string; caseId?: string }>()
  const [searchParams] = useSearchParams()
  const suiteIdParam = searchParams.get('suiteId') || ''
  const navigate = useNavigate()

  const { data: suites = [] } = useSuites(projectId!)
  const isEditing = !!caseId

  const firstSuiteId = suites[0]?.id || ''
  const effectiveSuiteId = suiteIdParam || firstSuiteId
  const { data: cases = [] } = useCases(effectiveSuiteId)
  const existingCase = isEditing ? cases.find(c => c.id === caseId) : undefined

  const createCase = useCreateCase(effectiveSuiteId, projectId!)
  const updateCase = useUpdateCase(effectiveSuiteId)

  // Jira
  const { data: jiraCfg } = useJiraConfig()
  const jiraConnected = jiraCfg?.connected === true
  const { data: jiraLinks = [] } = useCaseJiraLinks(caseId || '', isEditing && !!caseId)
  const linkIssue = useLinkJiraIssue(caseId || '')
  const unlinkIssue = useUnlinkJiraIssue(caseId || '')
  const [jiraKeyInput, setJiraKeyInput] = useState('')
  const [jiraError, setJiraError] = useState<string | null>(null)
  // Pending Jira keys for new (unsaved) cases — linked on save, discarded if not saved
  const [pendingJiraKeys, setPendingJiraKeys] = useState<string[]>([])

  const [suiteId, setSuiteId] = useState(suiteIdParam || '')
  const [title, setTitle] = useState('')
  const [preconditions, setPreconditions] = useState('')
  const [steps, setSteps] = useState<string[]>([''])
  const [expectedResult, setExpectedResult] = useState('')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [tags, setTags] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (suites.length > 0 && !suiteId) setSuiteId(suiteIdParam || suites[0].id)
  }, [suites])

  useEffect(() => {
    if (isEditing && existingCase && !loaded) {
      setTitle(existingCase.title)
      setPreconditions(existingCase.preconditions || '')
      setSteps(existingCase.steps.length > 0 ? existingCase.steps : [''])
      setExpectedResult(existingCase.expected_result)
      setPriority(existingCase.priority)
      setSuiteId(existingCase.suite_id)
      setTags(existingCase.tags || [])
      setLoaded(true)
    }
  }, [existingCase, isEditing, loaded])

  function validate() {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Title is required'
    if (title.trim().length > 100) e.title = 'Max 100 characters'
    if (!expectedResult.trim()) e.expectedResult = 'Expected result is required'
    const cleanSteps = steps.filter(s => s.trim())
    if (cleanSteps.length === 0) e.steps = 'At least one step is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function submit() {
    if (!validate()) return
    const cleanSteps = steps.filter(s => s.trim())
    const payload = { title: title.trim(), preconditions: preconditions.trim() || undefined, steps: cleanSteps, expected_result: expectedResult.trim(), priority, tags }

    if (isEditing && caseId) {
      updateCase.mutate({ id: caseId, ...payload }, {
        onSuccess: () => navigate(-1),
        onError: (e: Error) => setToast(e.message)
      })
    } else {
      createCase.mutate(payload as any, {
        onSuccess: async (newCase: any) => {
          if (pendingJiraKeys.length > 0) {
            await Promise.allSettled(
              pendingJiraKeys.map(key =>
                fetch(`/api/v1/jira/cases/${newCase.id}/jira-links`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ jiraIssueKey: key }),
                })
              )
            )
          }
          navigate(-1)
        },
        onError: (e: Error) => setToast(e.message)
      })
    }
  }

  function addStep() { setSteps(s => [...s, '']) }
  function removeStep(i: number) { setSteps(s => s.filter((_, idx) => idx !== i)) }
  function updateStep(i: number, val: string) { setSteps(s => s.map((v, idx) => idx === i ? val : v)) }

  async function handleLinkIssue() {
    // Support comma or space-separated keys: "PROJ-1, PROJ-2 PROJ-3"
    const keys = jiraKeyInput
      .toUpperCase()
      .split(/[\s,]+/)
      .map(k => k.trim())
      .filter(k => /^[A-Z][A-Z0-9_]+-\d+$/.test(k))
    if (!keys.length) { setJiraError('Enter a valid issue key, e.g. PROJ-123'); return }
    setJiraError(null)

    if (!isEditing) {
      const newKeys = keys.filter(k => !pendingJiraKeys.includes(k))
      if (newKeys.length) setPendingJiraKeys(ks => [...ks, ...newKeys])
      setJiraKeyInput('')
      return
    }
    // Editing — link each key, skip duplicates silently
    const existing = new Set(jiraLinks.map(l => l.jira_issue_key))
    const toAdd = keys.filter(k => !existing.has(k))
    if (!toAdd.length) { setJiraKeyInput(''); return }
    try {
      await Promise.all(toAdd.map(k => linkIssue.mutateAsync(k)))
      setJiraKeyInput('')
    } catch (e: any) {
      setJiraError(e.message || 'Failed to link one or more issues')
    }
  }

  const isPending = createCase.isPending || updateCase.isPending

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={isEditing ? 'Edit Test Case' : 'New Test Case'}
        subtitle={isEditing ? 'Update the test case details' : 'Add a test case to a suite'}
        actions={
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={() => navigate(-1)}>Cancel</button>
            <button className="btn-primary text-sm" onClick={submit} disabled={isPending}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEditing ? 'Save Changes' : 'Create Test Case'}
            </button>
          </div>
        }
      />

      <div className="flex gap-0 h-[calc(100%-65px)]">
        {/* ---- Main form ---- */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-w-0">
          {/* Suite selector */}
          <div>
            <label className="label">Suite <span className="text-fail">*</span></label>
            <select className="input" value={suiteId} onChange={e => setSuiteId(e.target.value)} disabled={isEditing}>
              {suites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="label">Title <span className="text-fail">*</span></label>
            <input
              className={`input ${errors.title ? 'border-fail' : ''}`}
              placeholder="As a user I can..."
              value={title} onChange={e => setTitle(e.target.value)}
              maxLength={100} autoFocus
            />
            {errors.title && <p className="text-fail text-xs mt-1">{errors.title}</p>}
          </div>

          {/* Preconditions */}
          <div>
            <label className="label">Preconditions <span className="text-text-muted">(optional)</span></label>
            <textarea
              className="input resize-none h-20"
              placeholder="e.g. User must be logged in. Browser cache cleared."
              value={preconditions} onChange={e => setPreconditions(e.target.value)}
            />
          </div>

          {/* Steps */}
          <div>
            <label className="label">Steps <span className="text-fail">*</span></label>
            {errors.steps && <p className="text-fail text-xs mb-2">{errors.steps}</p>}
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-text-muted text-xs font-mono w-5 text-right shrink-0">{i + 1}.</span>
                  <input
                    className="input flex-1 font-mono text-sm"
                    placeholder={`Step ${i + 1}`}
                    value={step}
                    onChange={e => updateStep(i, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addStep() }
                      if (e.key === 'Backspace' && !step && steps.length > 1) { e.preventDefault(); removeStep(i) }
                    }}
                  />
                  {steps.length > 1 && (
                    <button className="btn-ghost px-2 py-1.5 text-text-muted hover:text-fail" onClick={() => removeStep(i)}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn-ghost text-xs py-1 px-2 mt-2" onClick={addStep}><Plus size={11} /> Add Step</button>
          </div>

          {/* Expected result */}
          <div>
            <label className="label">Expected Result <span className="text-fail">*</span></label>
            <textarea
              className={`input resize-none h-24 ${errors.expectedResult ? 'border-fail' : ''}`}
              placeholder="What should happen after completing all steps?"
              value={expectedResult} onChange={e => setExpectedResult(e.target.value)}
            />
            {errors.expectedResult && <p className="text-fail text-xs mt-1">{errors.expectedResult}</p>}
          </div>
        </div>

        {/* ---- Right sidebar ---- */}
        <div className="w-56 shrink-0 border-l border-border bg-surface px-4 py-5 space-y-6 overflow-y-auto">
          {/* Priority */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold mb-2 block">Priority</label>
            <div className="space-y-1.5">
              {(['high', 'medium', 'low'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium border transition-colors capitalize
                    ${priority === p
                      ? p === 'high'
                        ? 'bg-fail/12 text-fail border-fail/30'
                        : p === 'medium'
                        ? 'bg-progress/12 text-progress border-progress/30'
                        : 'bg-surface-2 text-text-primary border-border'
                      : 'text-text-muted border-transparent hover:border-border hover:text-text-primary hover:bg-surface-2'
                    }`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${
                    p === 'high' ? 'bg-fail' : p === 'medium' ? 'bg-progress' : 'bg-text-muted/40'
                  }`} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold mb-2 block">Tags <span className="normal-case text-text-muted/40">(optional)</span></label>
            <TagInput tags={tags} onChange={setTags} />
            <p className="text-[10px] text-text-muted/50 mt-1.5">Enter, comma or space to add. Max 20 tags.</p>
          </div>

          {/* Jira links */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-muted/60 font-semibold mb-2.5 flex items-center gap-1.5">
              <Link2 size={10} /> Linked Issues
              {(isEditing ? jiraLinks.length : pendingJiraKeys.length) > 0 && (
                <span className="ml-auto text-[10px] bg-accent/15 text-accent font-bold px-1.5 py-0.5 rounded-full">
                  {isEditing ? jiraLinks.length : pendingJiraKeys.length}
                </span>
              )}
            </label>

            {/* Chip list */}
            {isEditing && jiraLinks.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {jiraLinks.map(link => (
                  <div key={link.id} className="flex items-start gap-1.5 bg-surface-2 border border-border/60 rounded-xl px-2.5 py-2 group">
                    <div className="flex-1 min-w-0">
                      {link.jira_issue_url ? (
                        <a href={link.jira_issue_url} target="_blank" rel="noopener noreferrer"
                          className="font-mono text-xs text-accent font-bold hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {link.jira_issue_key}
                        </a>
                      ) : (
                        <div className="font-mono text-xs text-accent font-bold">{link.jira_issue_key}</div>
                      )}
                      {link.jira_issue_summary && (
                        <div className="text-[10px] text-text-muted truncate mt-0.5 leading-snug">{link.jira_issue_summary}</div>
                      )}
                    </div>
                    <button
                      className="text-text-muted/40 hover:text-fail shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => unlinkIssue.mutate(link.id)}
                      title="Unlink"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isEditing && pendingJiraKeys.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {pendingJiraKeys.map(key => (
                  <span key={key} className="inline-flex items-center gap-1 bg-accent/10 border border-accent/20 text-accent font-mono text-[11px] font-bold px-2 py-1 rounded-lg">
                    {key}
                    <button
                      className="hover:text-fail transition-colors"
                      onClick={() => setPendingJiraKeys(ks => ks.filter(k => k !== key))}
                      title="Remove"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  className="input flex-1 text-xs font-mono py-1.5 px-2.5"
                  placeholder="PROJ-123 or PROJ-1, PROJ-2"
                  value={jiraKeyInput}
                  onChange={e => setJiraKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLinkIssue()}
                />
                <button
                  className="btn-ghost border border-border px-2.5 py-1.5 text-xs rounded-xl"
                  onClick={handleLinkIssue}
                  disabled={linkIssue.isPending || !jiraKeyInput.trim()}
                  title="Link issue(s)"
                >
                  {linkIssue.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                </button>
              </div>
              {jiraError && <p className="text-fail text-[11px]">{jiraError}</p>}
              {!isEditing && (
                <p className="text-[10px] text-text-muted/50 italic">
                  {pendingJiraKeys.length > 0 ? 'Will be linked when you save.' : 'Tip: paste multiple keys, e.g. PROJ-1, PROJ-2'}
                </p>
              )}
              {!jiraConnected && (
                <p className="text-[10px] text-text-muted/40">
                  Keys saved without Jira summary. Configure Jira in Settings to enrich links.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
