import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Play, Loader2, AlertCircle, Tag } from 'lucide-react'
import { useProjects, useSuites, useRuns, useCreateRun, useJiraConfig, useJiraVersions } from '../api'
import { PageHeader, Toast } from '../components'

export default function RunSetupPage() {
  const { projectId } = useParams<{ projectId: string }>()!
  const [searchParams] = useSearchParams()
  const preselectedSuiteId = searchParams.get('suiteId') || ''
  const { data: projects = [] } = useProjects()
  const { data: suites = [] } = useSuites(projectId!)
  const { data: runs = [] } = useRuns(projectId!)
  const createRun = useCreateRun(projectId!)
  const navigate = useNavigate()

  const { data: jiraCfg } = useJiraConfig()
  const jiraConnected = jiraCfg?.connected === true
  const { data: jiraVersions = [] } = useJiraVersions(jiraConnected)

  const bannerRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState('')
  const [selectedSuites, setSelectedSuites] = useState<string[]>([])
  const [allSuites, setAllSuites] = useState(!preselectedSuiteId)

  useEffect(() => {
    if (preselectedSuiteId && suites.find(s => s.id === preselectedSuiteId)) {
      setSelectedSuites([preselectedSuiteId])
      setAllSuites(false)
    }
  }, [suites, preselectedSuiteId])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [environment, setEnvironment] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const project = projects.find(p => p.id === projectId)
  const inProgressRun = runs.find(r => r.status === 'in_progress')

  function toggleSuite(id: string) {
    setSelectedSuites(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function submit() {
    const suiteIds = allSuites ? [] : selectedSuites
    if (!allSuites && suiteIds.length === 0) {
      setToast('Select at least one suite to run.')
      return
    }
    const selectedVersion = jiraVersions.find(v => v.id === selectedVersionId)
    createRun.mutate(
      {
        name: name.trim() || undefined,
        suite_ids: suiteIds.length > 0 ? suiteIds : undefined,
        jiraVersionId: selectedVersion?.id || undefined,
        jiraVersionName: selectedVersion?.name || undefined,
        environment: environment.trim() || undefined,
      },
      {
        onSuccess: (run) => navigate(`/projects/${projectId}/runs/${run.id}/execute`),
        onError: (e: Error) => setToast((e as any).data?.error || e.message)
      }
    )
  }

  const totalCases = allSuites
    ? suites.reduce((n, s) => n + s.case_count, 0)
    : suites.filter(s => selectedSuites.includes(s.id)).reduce((n, s) => n + s.case_count, 0)

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-lg mx-auto">
      <PageHeader
        title="Start Test Run"
        subtitle={project?.name}
      />

      <div className="px-6 py-5 space-y-5">
        {/* In-progress warning */}
        {inProgressRun && (
          <div ref={bannerRef} className="flex items-start gap-3 p-4 rounded-xl bg-progress/10 border border-progress/20 text-sm">
            <AlertCircle size={16} className="text-progress mt-0.5 shrink-0" />
            <div>
              <p className="text-progress font-medium">Run in progress</p>
              <p className="text-text-muted text-xs mt-1">
                <strong>{inProgressRun.name}</strong> is still in progress.
                {' '}<button className="text-accent underline" onClick={() => navigate(`/projects/${projectId}/runs/${inProgressRun.id}/execute`)}>Resume it</button>{' '}
                before starting a new one.
              </p>
            </div>
          </div>
        )}

        {/* Run name */}
        <div>
          <label className="label">Run Name <span className="text-text-muted">(optional)</span></label>
          <input
            className="input"
            placeholder={`Run ${new Date().toISOString().slice(0, 10)}`}
            value={name} onChange={e => setName(e.target.value)}
            disabled={!!inProgressRun}
          />
          <p className="text-xs text-text-muted mt-1.5">Leave blank to use the date as the name.</p>
        </div>

        {/* Suite selection */}
        <div>
          <label className="label">Scope</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
              hover:border-accent/50 border-border has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input type="radio" name="scope" checked={allSuites} onChange={() => setAllSuites(true)} className="accent-accent" />
              <div>
                <div className="text-sm font-medium text-text-primary">All suites</div>
                <div className="text-xs text-text-muted">{suites.reduce((n, s) => n + s.case_count, 0)} cases across {suites.length} suites</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
              hover:border-accent/50 border-border has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input type="radio" name="scope" checked={!allSuites} onChange={() => setAllSuites(false)} className="accent-accent" />
              <div className="text-sm font-medium text-text-primary">Selected suites</div>
            </label>
          </div>

          {!allSuites && (
            <div className="mt-3 space-y-1.5 ml-2">
              {suites.map(s => (
                <label key={s.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedSuites.includes(s.id)}
                    onChange={() => toggleSuite(s.id)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-text-primary flex-1">{s.name}</span>
                  <span className="text-xs text-text-muted">{s.case_count} cases</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Environment */}
        <div>
          <label className="label">Environment <span className="text-text-muted">(optional)</span></label>
          <input
            className="input"
            list="env-suggestions"
            placeholder="e.g. Staging, Production, QA…"
            value={environment}
            onChange={e => setEnvironment(e.target.value)}
            maxLength={100}
            disabled={!!inProgressRun}
          />
          <datalist id="env-suggestions">
            {['Staging', 'Production', 'QA', 'Mobile', 'Desktop'].map(e => <option key={e} value={e} />)}
          </datalist>
        </div>

        {/* Jira Fix Version (only when connected) */}
        {jiraConnected && jiraVersions.length > 0 && (
          <div>
            <label className="label flex items-center gap-1.5"><Tag size={12} /> Jira Fix Version <span className="text-text-muted">(optional)</span></label>
            <select
              className="input"
              value={selectedVersionId}
              onChange={e => setSelectedVersionId(e.target.value)}
              disabled={!!inProgressRun}
            >
              <option value="">— None —</option>
              {jiraVersions.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.released ? ' (released)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1.5">Link this run to a Jira release for tracking.</p>
          </div>
        )}

        {/* Summary */}
        {totalCases > 0 && (
          <div className="p-3 rounded-lg bg-surface-2 border border-border text-sm text-text-muted">
            Ready to run <strong className="text-text-primary">{totalCases} test case{totalCases !== 1 ? 's' : ''}</strong>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2 border-t border-border">
          <button className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
          <div onClick={() => { if (inProgressRun) bannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>
            <button
              className="btn-primary"
              onClick={submit}
              disabled={!!inProgressRun || createRun.isPending || totalCases === 0}
            >
              {createRun.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Start Run
            </button>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
    </div>
  )
}
