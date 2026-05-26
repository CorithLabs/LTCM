import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, Upload, Database, Info, Loader2, Link2, FileCode2, CheckCircle2, XCircle, AlertCircle, Wrench, Pencil, FileSpreadsheet, Map, Server, Users, Plus, ShieldCheck, UserX, UserCheck, KeyRound, Sparkles, Palette, ImageIcon, Type, RotateCcw, ArrowRight, GitMerge, ScrollText, RefreshCw } from 'lucide-react'
import { PageHeader, ConfirmModal, Toast } from '../components'
import { useJiraConfig, useSaveJiraConfig, useEditJiraConfig, useDeleteJiraConfig, useTestJira, useMyJiraCredentials, useSaveMyJiraCredentials, useDeleteMyJiraCredentials, useJiraStatuses, useJiraStatusMapping, useSaveJiraStatusMapping, useDbConfig, useSaveDbConfig, useTestDbConnection, useLayoutSettings, useUpdateLayoutSettings, useUploadFavicon, useDeleteFavicon } from '../api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { ICON_MAP, ICON_OPTIONS } from '../components/AppIcon'

type Tab = 'info' | 'system' | 'jira' | 'utilities' | 'layout' | 'apidocs' | 'users' | 'logs'

// ---- API Docs data ----
// ---- API Docs data ----
type AuthLevel = 'none' | 'auth' | 'admin'
interface Endpoint {
  method: string; path: string; desc: string; auth: AuthLevel
  body?: string; response?: string; note?: string
}
interface ApiSection { title: string; endpoints: Endpoint[] }

const BASE = 'http://localhost:3000'

const API_SECTIONS: ApiSection[] = [
  {
    title: 'Authentication',
    endpoints: [
      {
        method: 'POST', path: '/api/v1/auth/login', auth: 'none',
        desc: 'Log in and receive a session cookie. Pass the cookie on all subsequent requests.',
        body: `{ "username": "sham", "password": "secret123" }`,
        response: `{ "id": "usr_abc", "username": "sham", "role": "tester", "mustChangePassword": false, "jiraCredsRequired": false }`,
      },
      {
        method: 'GET', path: '/api/v1/auth/me', auth: 'auth',
        desc: 'Returns the current session user. Use to verify authentication status.',
        response: `{ "id": "usr_abc", "username": "sham", "role": "tester", "mustChangePassword": false, "jiraCredsRequired": false }`,
      },
      {
        method: 'POST', path: '/api/v1/auth/logout', auth: 'auth',
        desc: 'Destroy the session and clear the cookie.',
        response: `{ "ok": true }`,
      },
      {
        method: 'POST', path: '/api/v1/auth/change-password', auth: 'auth',
        desc: 'Change password. On first login, currentPassword may be omitted.',
        body: `{ "currentPassword": "old", "newPassword": "newSecret123" }`,
        response: `{ "ok": true }`,
      },
    ],
  },
  {
    title: 'Projects',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/projects', auth: 'auth',
        desc: 'List all projects accessible to the current user.',
        response: `[{ "id": "prj_1", "name": "E-Commerce", "description": null, "last_run_status": "completed", "case_count": 24 }]`,
      },
      {
        method: 'POST', path: '/api/v1/projects', auth: 'admin',
        desc: 'Create a project.',
        body: `{ "name": "Mobile App", "description": "iOS and Android regression suite" }`,
        response: `{ "id": "prj_2", "name": "Mobile App", "description": "iOS and Android regression suite", "created_at": "2026-05-26T10:00:00Z" }`,
      },
      {
        method: 'PATCH', path: '/api/v1/projects/:id', auth: 'admin',
        desc: 'Update project name or description.',
        body: `{ "name": "Mobile App v2" }`,
        response: `{ "id": "prj_2", "name": "Mobile App v2" }`,
      },
      {
        method: 'DELETE', path: '/api/v1/projects/:id', auth: 'admin',
        desc: 'Delete a project. Blocked if an in-progress run exists.',
        response: `(204 No Content)`,
      },
    ],
  },
  {
    title: 'Suites',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/projects/:projectId/suites', auth: 'auth',
        desc: 'List all suites for a project, ordered by sort_order.',
        response: `[{ "id": "sui_1", "name": "Authentication", "description": null, "case_count": 8, "sort_order": 0 }]`,
      },
      {
        method: 'POST', path: '/api/v1/projects/:projectId/suites', auth: 'auth',
        desc: 'Create a suite inside a project.',
        body: `{ "name": "Checkout Flow", "description": "End-to-end checkout tests" }`,
        response: `{ "id": "sui_2", "name": "Checkout Flow", "sort_order": 1 }`,
      },
      {
        method: 'PATCH', path: '/api/v1/suites/:id', auth: 'auth',
        desc: 'Update suite name, description, or sort order.',
        body: `{ "name": "Checkout", "sort_order": 0 }`,
        response: `{ "id": "sui_2", "name": "Checkout", "sort_order": 0 }`,
      },
      {
        method: 'DELETE', path: '/api/v1/suites/:id', auth: 'admin',
        desc: 'Delete a suite and all its test cases.',
        response: `(204 No Content)`,
      },
    ],
  },
  {
    title: 'Test Cases',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/suites/:suiteId/cases', auth: 'auth',
        desc: 'List all test cases in a suite, ordered by sort_order.',
        response: `[{ "id": "tc_1", "case_number": 1, "title": "Login with valid credentials", "priority": "high", "steps": ["Open /login", "Enter credentials", "Click Submit"], "expected_result": "Dashboard shown", "last_run_status": "pass" }]`,
      },
      {
        method: 'POST', path: '/api/v1/suites/:suiteId/cases', auth: 'auth',
        desc: 'Create a test case.',
        body: `{ "title": "Login with invalid password", "steps": ["Open /login", "Enter wrong password", "Click Submit"], "expected_result": "Error message shown", "priority": "high", "preconditions": "User registered" }`,
        response: `{ "id": "tc_2", "case_number": 2, "title": "Login with invalid password", "priority": "high" }`,
      },
      {
        method: 'PATCH', path: '/api/v1/cases/:id', auth: 'auth',
        desc: 'Update any case field (title, steps, expected_result, preconditions, priority).',
        body: `{ "priority": "medium", "title": "Login — invalid password" }`,
        response: `{ "id": "tc_2", "title": "Login — invalid password", "priority": "medium" }`,
      },
      {
        method: 'DELETE', path: '/api/v1/cases/:id', auth: 'auth',
        desc: 'Delete a test case.',
        response: `(204 No Content)`,
      },
      {
        method: 'POST', path: '/api/v1/cases/:id/duplicate', auth: 'auth',
        desc: 'Duplicate a case. The copy is appended to the same suite with title prefixed "Copy of …".',
        response: `{ "id": "tc_3", "title": "Copy of Login — invalid password" }`,
      },
      {
        method: 'PATCH', path: '/api/v1/cases/:id/move', auth: 'auth',
        desc: 'Move a case to a different suite.',
        body: `{ "suite_id": "sui_2" }`,
        response: `{ "id": "tc_2", "suite_id": "sui_2" }`,
      },
    ],
  },
  {
    title: 'Test Runs',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/projects/:projectId/runs', auth: 'auth',
        desc: 'List all runs for a project, newest first.',
        response: `[{ "id": "run_1", "run_number": 5, "name": "Sprint 12 — Regression", "status": "completed", "passed": 18, "failed": 2, "skipped": 1, "case_count": 21, "created_at": "2026-05-26T09:00:00Z" }]`,
      },
      {
        method: 'POST', path: '/api/v1/projects/:projectId/runs', auth: 'auth',
        desc: 'Start a new run. Optionally filter to specific suite IDs. Only one in-progress run per project is allowed.',
        body: `{ "name": "CI Run #42", "environment": "staging", "suite_ids": ["sui_1", "sui_2"] }`,
        response: `{ "id": "run_2", "run_number": 6, "name": "CI Run #42", "status": "in_progress", "case_count": 16 }`,
        note: 'Returns 409 if an in-progress run already exists.',
      },
      {
        method: 'GET', path: '/api/v1/runs/:runId/cases', auth: 'auth',
        desc: 'List all cases in a run (snapshot taken at run creation time).',
        response: `[{ "id": "rc_1", "case_id": "tc_1", "case_number": 1, "title": "Login with valid credentials", "status": null, "note": null, "suite_name": "Authentication", "priority": "high" }]`,
      },
      {
        method: 'PATCH', path: '/api/v1/runs/:runId/cases/:caseId', auth: 'auth',
        desc: 'Set a result on a run case. status must be one of: pass, fail, skip, blocked, na. Note is auto-saved (debounced 500ms in UI but instant via API).',
        body: `{ "status": "fail", "note": "Redirect loop on Safari 17" }`,
        response: `{ "id": "rc_1", "status": "fail", "note": "Redirect loop on Safari 17", "case_id": "tc_1" }`,
      },
      {
        method: 'PATCH', path: '/api/v1/runs/:runId', auth: 'auth',
        desc: 'Complete a run. Set force_complete: true to auto-skip any unresolved cases.',
        body: `{ "status": "completed", "force_complete": true }`,
        response: `{ "id": "run_2", "status": "completed", "completed_at": "2026-05-26T10:30:00Z" }`,
      },
      {
        method: 'GET', path: '/api/v1/runs/:runId/summary', auth: 'auth',
        desc: 'Full run summary including per-case results, pass rate, vs-last-run diff, and linked Jira defects.',
        response: `{ "id": "run_2", "name": "CI Run #42", "total": 16, "passed": 14, "failed": 2, "skipped": 0, "diff": { "regressions": [], "fixes": [{ "caseId": "tc_3", "title": "Cart total", "suiteName": "Checkout" }], "newCases": [] }, "cases": [] }`,
      },
    ],
  },
  {
    title: 'Export',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/runs/:runId/export?format=csv', auth: 'auth',
        desc: 'Download run results as a CSV file.',
        response: `(CSV file download)`,
      },
      {
        method: 'GET', path: '/api/v1/runs/:runId/export?format=pdf', auth: 'auth',
        desc: 'Download run results as a printable HTML report.',
        response: `(HTML file download)`,
      },
    ],
  },
  {
    title: 'Jira Integration',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/jira/config', auth: 'auth',
        desc: 'Get Jira connection status. API token is never returned.',
        response: `{ "connected": true, "baseUrl": "https://acme.atlassian.net" }`,
      },
      {
        method: 'POST', path: '/api/v1/jira/config', auth: 'admin',
        desc: 'Save the global Jira base URL.',
        body: `{ "baseUrl": "https://acme.atlassian.net" }`,
        response: `{ "connected": true, "baseUrl": "https://acme.atlassian.net" }`,
      },
      {
        method: 'DELETE', path: '/api/v1/jira/config', auth: 'admin',
        desc: 'Remove the Jira connection.',
        response: `(204 No Content)`,
      },
      {
        method: 'POST', path: '/api/v1/jira/my-credentials', auth: 'auth',
        desc: 'Save your personal Jira email and API token (stored AES-256-GCM encrypted).',
        body: `{ "email": "sham@acme.com", "apiToken": "ATATT3x..." }`,
        response: `{ "hasCredentials": true, "email": "sham@acme.com" }`,
      },
      {
        method: 'POST', path: '/api/v1/jira/test', auth: 'auth',
        desc: 'Test Jira connectivity using your saved credentials.',
        response: `{ "ok": true, "displayName": "Sham Kumar" }`,
      },
      {
        method: 'GET', path: '/api/v1/jira/issues?key=PROJ-123', auth: 'auth',
        desc: 'Look up a Jira issue by key.',
        response: `{ "key": "PROJ-123", "summary": "Login fails on Safari", "status": "In Progress", "type": "Bug" }`,
      },
      {
        method: 'GET', path: '/api/v1/jira/cases/:id/jira-links', auth: 'auth',
        desc: 'Get all Jira issues linked to a test case.',
        response: `[{ "id": "lnk_1", "jira_issue_key": "PROJ-123", "jira_issue_summary": "Login fails on Safari", "link_type": "manual" }]`,
      },
      {
        method: 'POST', path: '/api/v1/jira/cases/:id/jira-links', auth: 'auth',
        desc: 'Link a Jira issue to a test case.',
        body: `{ "jiraIssueKey": "PROJ-456" }`,
        response: `{ "id": "lnk_2", "jira_issue_key": "PROJ-456", "link_type": "manual" }`,
      },
      {
        method: 'DELETE', path: '/api/v1/jira/cases/:id/jira-links/:linkId', auth: 'auth',
        desc: 'Unlink a Jira issue from a test case.',
        response: `(204 No Content)`,
      },
      {
        method: 'GET', path: '/api/v1/jira/status-mapping', auth: 'admin',
        desc: 'Get the current LTCM → Jira status transition mapping.',
        response: `{ "pass": "Done", "fail": "In Progress", "in_progress": "In Progress" }`,
      },
      {
        method: 'PUT', path: '/api/v1/jira/status-mapping', auth: 'admin',
        desc: 'Update the status mapping. Pass null to clear a mapping.',
        body: `{ "pass": "Done", "fail": "In Progress", "in_progress": "In Progress" }`,
        response: `{ "pass": "Done", "fail": "In Progress", "in_progress": "In Progress" }`,
      },
    ],
  },
  {
    title: 'Backup & Restore',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/backup', auth: 'admin',
        desc: 'Download a full JSON backup of all projects, suites, cases, and run history.',
        response: `{ "schemaVersion": 1, "appVersion": "1.0.0", "exportedAt": "2026-05-26T10:00:00Z", "projects": [], "suites": [], "test_cases": [], "runs": [], "run_cases": [] }`,
      },
      {
        method: 'POST', path: '/api/v1/restore', auth: 'admin',
        desc: 'Restore from a JSON backup. Overwrites all existing data. Body: multipart/form-data, field: file.',
        note: '⚠️ Destructive — all existing data is deleted before restore.',
        response: `{ "restored": true }`,
      },
    ],
  },
  {
    title: 'Health',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/health', auth: 'none',
        desc: 'Returns app version and database connection info. No authentication required.',
        response: `{ "status": "ok", "version": "1.0.0", "dbHost": "localhost", "dbName": "ltcm" }`,
      },
    ],
  },
]

const CI_CD_STEPS = [
  { label: 'Authenticate', method: 'POST', path: '/api/v1/auth/login' },
  { label: 'Find your project ID', method: 'GET', path: '/api/v1/projects' },
  { label: 'Start a run', method: 'POST', path: '/api/v1/projects/{projectId}/runs' },
  { label: 'Fetch run cases', method: 'GET', path: '/api/v1/runs/{runId}/cases' },
  { label: 'Mark each case (repeat per case)', method: 'PATCH', path: '/api/v1/runs/{runId}/cases/{caseId}' },
  { label: 'Complete the run', method: 'PATCH', path: '/api/v1/runs/{runId}' },
]

const METHOD_BADGE: Record<string, string> = {
  GET:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  POST:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  PATCH:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
  PUT:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
}
const AUTH_BADGE: Record<AuthLevel, string> = {
  none:  'bg-surface-2 text-text-muted border-border',
  auth:  'bg-surface-2 text-text-muted border-border',
  admin: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
}
const AUTH_LABEL: Record<AuthLevel, string> = {
  none: 'Public', auth: 'Auth', admin: 'Admin',
}

// ---- Searchable select ----
function SearchableSelect({ options, value, onChange, placeholder }: {
  options: string[]; value: string; onChange: (v: string) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))

  function select(v: string) {
    onChange(v)
    setOpen(false)
    setSearch('')
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch('') }}
        className="input w-full text-sm text-left flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-text-primary' : 'text-text-muted'}>{value || placeholder}</span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span onClick={clear} className="text-text-muted hover:text-text-primary transition-colors text-xs px-1">✕</span>
          )}
          <span className="text-text-muted text-xs">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              className="input w-full text-sm"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div
              className="px-3 py-2 text-xs text-text-muted hover:bg-surface-2 cursor-pointer"
              onClick={() => select('')}
            >
              (none — skip)
            </div>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-muted">No matches</div>
            )}
            {filtered.map(o => (
              <div
                key={o}
                onClick={() => select(o)}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-surface-2 transition-colors ${o === value ? 'text-accent font-medium' : 'text-text-primary'}`}
              >
                {o}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Jira Status Mapping card (admin only, Jira connected) ----
function JiraStatusMappingCard({ showToast }: { showToast: (msg: string, type: 'success' | 'error') => void }) {
  const jiraConnected = !!useJiraConfig().data?.connected
  const { data: statuses = [], isLoading: statusesLoading } = useJiraStatuses(jiraConnected)
  const { data: mapping, isLoading: mappingLoading } = useJiraStatusMapping(jiraConnected)
  const saveMapping = useSaveJiraStatusMapping()

  const [form, setForm] = useState<{ pass: string; fail: string; in_progress: string }>({ pass: '', fail: '', in_progress: '' })
  const [dirty, setDirty] = useState(false)

  // Sync form from loaded mapping
  useEffect(() => {
    if (mapping) {
      setForm({ pass: mapping.pass || '', fail: mapping.fail || '', in_progress: mapping.in_progress || '' })
      setDirty(false)
    }
  }, [mapping])

  async function handleSave() {
    try {
      await saveMapping.mutateAsync({
        pass: form.pass || null,
        fail: form.fail || null,
        in_progress: form.in_progress || null,
      })
      setDirty(false)
      showToast('Status mapping saved.', 'success')
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
  }

  if (!jiraConnected) return null
  if (statusesLoading || mappingLoading) return null

  const rows: { event: keyof typeof form; label: string; hint: string }[] = [
    { event: 'pass',        label: 'When Pass',        hint: 'e.g. Done' },
    { event: 'fail',        label: 'When Fail',        hint: 'e.g. In Progress' },
    { event: 'in_progress', label: 'When In Progress', hint: 'e.g. In Progress' },
  ]

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <GitMerge size={15} className="text-accent" />
        <span className="text-sm font-semibold text-text-primary">Status Mapping</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent uppercase tracking-wide">Admin</span>
      </div>
      <p className="text-xs text-text-muted">
        When a linked test case result is saved, LTCM will transition the Jira ticket to the mapped status.
        Leave blank to skip the transition for that result.
      </p>
      <div className="space-y-3">
        {rows.map(({ event, label }) => (
          <div key={event} className="flex items-center gap-3">
            <span className="text-xs text-text-muted w-36 shrink-0">{label}</span>
            <ArrowRight size={12} className="text-text-muted shrink-0" />
            <SearchableSelect
              options={statuses}
              value={form[event]}
              placeholder="(none — skip)"
              onChange={v => { setForm(f => ({ ...f, [event]: v })); setDirty(true) }}
            />
          </div>
        ))}
      </div>
      <button
        className="btn-primary text-sm"
        disabled={!dirty || saveMapping.isPending}
        onClick={handleSave}
      >
        {saveMapping.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
        Save Mapping
      </button>
    </div>
  )
}

// ---- Jira Tab ----
function JiraTab() {
  const { user: authUser } = useAuth()
  const isAdmin = authUser?.role === 'admin'

  // Global config (admin)
  const { data: cfg, isLoading: cfgLoading } = useJiraConfig()
  const save = useSaveJiraConfig()
  const edit = useEditJiraConfig()
  const remove = useDeleteJiraConfig()
  const [urlForm, setUrlForm] = useState('')
  const [urlEditMode, setUrlEditMode] = useState(false)
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)

  // Per-user credentials
  const { data: myCreds, isLoading: credsLoading } = useMyJiraCredentials()
  const saveCreds = useSaveMyJiraCredentials()
  const deleteCreds = useDeleteMyJiraCredentials()
  const test = useTestJira()
  const [credForm, setCredForm] = useState({ email: '', apiToken: '' })
  const [credEditMode, setCredEditMode] = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  function showToast(msg: string, type: 'success' | 'error') { setToast({ msg, type }) }

  // Admin: save/update base URL
  async function handleSaveUrl() {
    try {
      if (cfg?.connected) {
        await edit.mutateAsync({ baseUrl: urlForm })
        showToast('Jira base URL updated.', 'success')
      } else {
        await save.mutateAsync({ baseUrl: urlForm })
        showToast('Jira base URL saved.', 'success')
      }
      setUrlEditMode(false)
      setUrlForm('')
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
  }

  async function handleDisconnect() {
    try {
      await remove.mutateAsync()
      setDisconnectConfirm(false)
      setUrlEditMode(false)
      showToast('Jira disconnected.', 'success')
    } catch { showToast('Disconnect failed', 'error') }
  }

  // Per-user: save credentials
  async function handleSaveCreds() {
    try {
      await saveCreds.mutateAsync(credForm)
      showToast('Your Jira credentials saved.', 'success')
      setCredEditMode(false)
      setCredForm({ email: '', apiToken: '' })
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
  }

  async function handleDeleteCreds() {
    try {
      await deleteCreds.mutateAsync()
      showToast('Your Jira credentials removed.', 'success')
    } catch { showToast('Remove failed', 'error') }
  }

  async function handleTest() {
    try {
      const res = await test.mutateAsync()
      showToast(`Connected as ${res.displayName}`, 'success')
    } catch (e: any) { showToast(e.message || 'Connection test failed', 'error') }
  }

  function startCredEdit() {
    setCredForm({ email: myCreds?.email || '', apiToken: '' })
    setCredEditMode(true)
  }

  if (cfgLoading || credsLoading) return <div className="text-text-muted text-sm p-5">Loading…</div>

  return (
    <div className="space-y-4">
      {/* Admin — Global Jira Server */}
      {isAdmin && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-accent" />
              <span className="text-sm font-semibold text-text-primary">Jira Server (Admin)</span>
            </div>
            {cfg?.connected && !urlEditMode && (
              <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => { setUrlForm(cfg.baseUrl || ''); setUrlEditMode(true) }}>
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>

          {cfg?.connected && !urlEditMode ? (
            <div className="space-y-3">
              <div className="flex gap-2 text-sm">
                <span className="w-28 text-text-muted text-xs uppercase tracking-wide font-medium shrink-0">Base URL</span>
                <span className="font-mono text-text-primary text-xs break-all">{cfg.baseUrl}</span>
              </div>
              <button
                className="btn-ghost text-sm border border-border text-red-400 hover:text-red-300 inline-flex items-center gap-1.5"
                onClick={() => setDisconnectConfirm(true)}
              >
                <XCircle size={13} /> Remove
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {!cfg?.connected && (
                <p className="text-xs text-text-muted">
                  Set the global Jira base URL. Each user configures their own email and API token below.
                </p>
              )}
              <div>
                <label className="block text-xs text-text-muted mb-1">Jira Base URL</label>
                <input
                  className="input w-full text-sm"
                  placeholder="https://your-org.atlassian.net"
                  value={urlForm}
                  onChange={e => setUrlForm(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  className="btn-primary text-sm"
                  disabled={(save.isPending || edit.isPending) || !urlForm}
                  onClick={handleSaveUrl}
                >
                  {(save.isPending || edit.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  {cfg?.connected ? 'Update URL' : 'Save URL'}
                </button>
                {urlEditMode && (
                  <button className="btn-ghost text-sm" onClick={() => { setUrlEditMode(false); setUrlForm('') }}>Cancel</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All users — My Jira Credentials */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-accent" />
            <span className="text-sm font-semibold text-text-primary">My Jira Credentials</span>
          </div>
          {myCreds?.hasCredentials && !credEditMode && (
            <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={startCredEdit}>
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>

        {!cfg?.connected && (
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <AlertCircle size={13} /> Jira server not configured yet. Ask your admin to set the base URL first.
          </p>
        )}

        {myCreds?.hasCredentials && !credEditMode ? (
          <div className="space-y-3">
            <div className="flex gap-2 text-sm">
              <span className="w-20 text-text-muted text-xs uppercase tracking-wide font-medium shrink-0">Email</span>
              <span className="text-text-primary text-xs">{myCreds.email}</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="w-20 text-text-muted text-xs uppercase tracking-wide font-medium shrink-0">Token</span>
              <span className="text-text-muted text-xs">••••••••  (stored encrypted)</span>
            </div>
            <div className="flex gap-3">
              <button className="btn-primary text-sm" onClick={handleTest} disabled={test.isPending || !cfg?.connected}>
                {test.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Test Connection
              </button>
              <button
                className="btn-ghost text-sm border border-border text-red-400 hover:text-red-300 inline-flex items-center gap-1.5"
                onClick={handleDeleteCreds}
                disabled={deleteCreds.isPending}
              >
                <XCircle size={13} /> Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {!credEditMode && (
              <p className="text-xs text-text-muted">
                Your email and API token are stored encrypted and used only for your Jira requests.
              </p>
            )}
            <div>
              <label className="block text-xs text-text-muted mb-1">Jira Email</label>
              <input
                className="input w-full text-sm"
                type="email"
                placeholder="you@example.com"
                value={credForm.email}
                onChange={e => setCredForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                API Token {credEditMode && <span className="text-text-muted font-normal">(leave blank to keep existing)</span>}
              </label>
              <input
                className="input w-full text-sm"
                type="password"
                placeholder={credEditMode ? '••••••••  (unchanged)' : 'Atlassian API token'}
                value={credForm.apiToken}
                onChange={e => setCredForm(f => ({ ...f, apiToken: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <button
                className="btn-primary text-sm"
                disabled={saveCreds.isPending || !credForm.email || (!credForm.apiToken && !credEditMode)}
                onClick={handleSaveCreds}
              >
                {saveCreds.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Save Credentials
              </button>
              {credEditMode && (
                <button className="btn-ghost text-sm" onClick={() => { setCredEditMode(false); setCredForm({ email: '', apiToken: '' }) }}>Cancel</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Admin — Status Mapping */}
      {isAdmin && <JiraStatusMappingCard showToast={showToast} />}

      {disconnectConfirm && (
        <ConfirmModal
          title="Remove Jira server?"
          message="This will remove the global Jira base URL. Existing case links and run version references will remain in the database."
          confirmLabel="Remove"
          danger
          onConfirm={handleDisconnect}
          onCancel={() => setDisconnectConfirm(false)}
        />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ---- Database Tab ----
function DatabaseTab() {
  const { data: cfg, isLoading } = useDbConfig()
  const save = useSaveDbConfig()
  const testConn = useTestDbConnection()
  const [form, setForm] = useState({ host: '', port: '5432', user: '', password: '', database: '' })
  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error') { setToast({ msg, type }) }

  function startEdit() {
    setForm({
      host: cfg?.host || 'localhost',
      port: String(cfg?.port || 5432),
      user: cfg?.user || 'postgres',
      password: '',
      database: cfg?.database || 'ltcm',
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setForm({ host: '', port: '5432', user: '', password: '', database: '' })
  }

  async function handleTest() {
    try {
      await testConn.mutateAsync(form)
      showToast('Connection successful.', 'success')
    } catch (e: any) { showToast(e.message || 'Connection failed', 'error') }
  }

  async function handleSave() {
    try {
      await save.mutateAsync(form)
      showToast('Database settings saved and connected.', 'success')
      setEditing(false)
      setForm({ host: '', port: '5432', user: '', password: '', database: '' })
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
  }

  if (isLoading) return <div className="text-text-muted text-sm p-5">Loading…</div>

  return (
    <div className="space-y-4">
      {!editing && cfg && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span className="text-sm font-semibold text-text-primary">PostgreSQL</span>
            </div>
            <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={startEdit}>
              <Pencil size={12} /> Edit
            </button>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="w-24 text-text-muted text-xs uppercase tracking-wide font-medium">Host</span>
              <span className="font-mono text-text-primary text-xs">{cfg.host}:{cfg.port}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 text-text-muted text-xs uppercase tracking-wide font-medium">Database</span>
              <span className="font-mono text-text-primary text-xs">{cfg.database}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 text-text-muted text-xs uppercase tracking-wide font-medium">User</span>
              <span className="font-mono text-text-primary text-xs">{cfg.user}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 text-text-muted text-xs uppercase tracking-wide font-medium">Password</span>
              <span className="text-text-muted text-xs">{cfg.hasPassword ? '••••••••' : '(none)'}</span>
            </div>
          </div>
        </div>
      )}

      {(!cfg || editing) && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server size={16} className="text-accent" />
              <span className="text-sm font-semibold text-text-primary">
                {editing ? 'Edit Database Connection' : 'Database Connection'}
              </span>
            </div>
            {editing && (
              <button className="text-xs text-text-muted hover:text-text-primary" onClick={cancelEdit}>Cancel</button>
            )}
          </div>
          {!editing && (
            <p className="text-xs text-text-muted">
              Configure your PostgreSQL connection. Defaults to <code className="font-mono">localhost:5432/ltcm</code>.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-text-muted mb-1">Host</label>
              <input className="input w-full text-sm" placeholder="localhost"
                value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-text-muted mb-1">Port</label>
              <input className="input w-full text-sm" placeholder="5432" type="number"
                value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-text-muted mb-1">Database Name</label>
              <input className="input w-full text-sm" placeholder="ltcm"
                value={form.database} onChange={e => setForm(f => ({ ...f, database: e.target.value }))} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-text-muted mb-1">User</label>
              <input className="input w-full text-sm" placeholder="postgres"
                value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-text-muted mb-1">Password</label>
              <input className="input w-full text-sm" type="password"
                placeholder={editing ? '(leave blank to keep existing)' : '(optional)'}
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              className="btn-ghost text-sm border border-border flex-1"
              onClick={handleTest}
              disabled={testConn.isPending || !form.host || !form.database}
            >
              {testConn.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Test Connection
            </button>
            <button
              className="btn-primary text-sm flex-1"
              onClick={handleSave}
              disabled={save.isPending || !form.host || !form.database}
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              Save & Connect
            </button>
          </div>
          <p className="text-xs text-text-muted">
            ⚠️ Saving will reconnect the app to the new database and run any pending migrations.
            Existing data in the current database is not affected.
          </p>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ---- Utilities Tab ----
function UtilitiesTab({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate()
  const [restarting, setRestarting] = useState(false)
  const [restartMsg, setRestartMsg] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)

  async function handleDemo() {
    setDemoLoading(true)
    setDemoError(null)
    try {
      const res = await fetch('/api/v1/admin/demo', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Demo creation failed')
      navigate(`/projects/${data.projectId}`)
    } catch (e: any) {
      setDemoError(e.message || 'Failed to load demo')
      setDemoLoading(false)
    }
  }

  async function handleRestart() {
    setRestarting(true)
    setRestartMsg(null)
    try {
      const res = await fetch('/api/v1/admin/restart', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setRestartMsg('Server is restarting. The page will reload in a few seconds…')
        setTimeout(() => window.location.reload(), 4000)
      } else {
        setRestartMsg(data.error || 'Restart failed')
        setRestarting(false)
      }
    } catch {
      setRestartMsg('Could not reach the server.')
      setRestarting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Demo Mode — admin only */}
      {isAdmin && (
        <div className="card p-5 space-y-3 border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <span className="text-sm font-semibold text-text-primary">Demo Mode</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent uppercase tracking-wide">Admin</span>
          </div>
          <p className="text-xs text-text-muted">
            Load a sample project — <strong className="text-text-primary">E-Commerce Platform</strong> — with realistic test suites,
            two completed runs, pass/fail/skip results, and linked Jira issues. Use it to explore LTCM features before adding real data.
          </p>
          {demoError && (
            <p className="text-xs text-fail px-3 py-2 rounded-lg bg-fail/8 border border-fail/20">{demoError}</p>
          )}
          <button
            className="btn-primary text-sm gap-2 bg-accent hover:bg-accent/90 shadow-md shadow-accent/25"
            onClick={handleDemo}
            disabled={demoLoading}
          >
            {demoLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <Sparkles size={14} />}
            {demoLoading ? 'Setting up…' : 'Load Demo Project'}
          </button>
        </div>
      )}

      {/* Sutra */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map size={16} className="text-accent" />
            <span className="text-sm font-semibold text-text-primary">Sutra Story Map</span>
          </div>
          <a
            href="https://sutrasdd.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-400 hover:to-indigo-400
              transition-all shadow-sm hover:shadow-md"
          >
            ✦ Built with Sutra
          </a>
        </div>
        <p className="text-xs text-text-muted">
          This app was planned and specced using Sutra — a story map tool for AI agents.
          Download the story map to open it in Sutra and continue planning future releases.
        </p>
        <a
          href="/ltcm-story-map.json"
          download="ltcm-story-map.json"
          className="btn-ghost text-sm inline-flex items-center gap-2 border border-border"
        >
          <Download size={14} /> Download Story Map
        </a>
      </div>

      {/* Excel Import Template */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet size={16} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Excel Import Template</span>
        </div>
        <p className="text-xs text-text-muted">
          Download the Excel template to bulk-import test cases into any suite.
          Fill in your cases (one per row) and upload via the <strong>Import</strong> button on any test suite.
        </p>
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs font-mono text-text-muted space-y-1">
          <div className="flex gap-4 text-text-primary font-semibold">
            <span className="w-36">Title</span>
            <span className="w-28">Preconditions</span>
            <span className="w-40">Steps (one per line)</span>
            <span className="w-32">Expected Result</span>
            <span>Priority</span>
          </div>
          <div className="flex gap-4 text-text-muted">
            <span className="w-36 truncate">Login with valid…</span>
            <span className="w-28 truncate">User registered</span>
            <span className="w-40 truncate">Open page↵Enter…</span>
            <span className="w-32 truncate">Dashboard shown</span>
            <span>high</span>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Steps: use <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-xs">Alt + Enter</kbd> in Excel to add a new line within a cell.
          Priority values: <code className="font-mono">high</code> · <code className="font-mono">medium</code> · <code className="font-mono">low</code> (defaults to medium if blank).
        </p>
        <a
          href="/api/v1/cases/import-template"
          download="ltcm-import-template.xlsx"
          className="btn-primary text-sm inline-flex items-center gap-2"
        >
          <Download size={14} /> Download Template
        </a>
      </div>

      {/* Restart Server */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Server size={16} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Restart Server</span>
        </div>
        <p className="text-xs text-text-muted">
          Restarts the backend Node.js process. Useful after changing environment variables or database config files.
          The page will reload automatically once the server is back up.
        </p>
        {restartMsg && (
          <p className={`text-xs px-3 py-2 rounded-lg border ${restarting ? 'text-progress border-progress/30 bg-progress/10' : 'text-fail border-fail/30 bg-fail/10'}`}>
            {restartMsg}
          </p>
        )}
        <button
          className="btn-ghost text-sm border border-border flex items-center gap-2 disabled:opacity-50"
          onClick={handleRestart}
          disabled={restarting}
        >
          {restarting ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />}
          {restarting ? 'Restarting…' : 'Restart Server'}
        </button>
      </div>
    </div>
  )
}

// ---- API Docs Tab ----
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={copy}
      className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-border text-text-muted hover:text-text-primary hover:border-border-2 transition-colors font-mono"
    >
      {copied ? '✓ copied' : 'copy'}
    </button>
  )
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-lg border transition-colors ${open ? 'border-border-2 bg-surface' : 'border-border bg-surface hover:border-border-2'}`}>
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border w-14 text-center shrink-0 ${METHOD_BADGE[ep.method] || ''}`}>
          {ep.method}
        </span>
        <span className="font-mono text-xs text-text-primary flex-1 truncate">{ep.path}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${AUTH_BADGE[ep.auth]}`}>
          {AUTH_LABEL[ep.auth]}
        </span>
        <span className="text-text-muted text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <p className="text-xs text-text-muted">{ep.desc}</p>
          {ep.note && (
            <p className="text-xs text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded px-2 py-1.5">{ep.note}</p>
          )}
          {ep.body && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-text-muted">Request body</span>
                <CopyButton text={ep.body} />
              </div>
              <pre className="text-xs font-mono bg-surface-2 border border-border rounded p-2.5 overflow-x-auto text-text-primary whitespace-pre-wrap">{ep.body}</pre>
            </div>
          )}
          {ep.response && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-text-muted">Response</span>
                <CopyButton text={ep.response} />
              </div>
              <pre className="text-xs font-mono bg-surface-2 border border-border rounded p-2.5 overflow-x-auto text-emerald-400/80 whitespace-pre-wrap">{ep.response}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ApiDocsTab() {
  const [cicdOpen, setCicdOpen] = useState(false)
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs text-text-muted">
          All endpoints return <span className="font-mono text-text-primary">application/json</span>.
          Errors: <span className="font-mono text-text-primary">{'{ "error": "string", "code": "string" }'}</span>.
          Authentication uses session cookies — login first and pass the cookie on each subsequent request.
        </p>
      </div>

      {/* CI/CD Quick Start */}
      <div className={`rounded-lg border transition-colors ${cicdOpen ? 'border-accent/30 bg-accent/5' : 'border-accent/20 bg-accent/5 hover:border-accent/40'}`}>
        <button
          className="w-full text-left px-4 py-3 flex items-center gap-3"
          onClick={() => setCicdOpen(o => !o)}
        >
          <span className="text-xs font-semibold text-accent uppercase tracking-wide flex-1">CI/CD Quick Start</span>
          <span className="text-text-muted text-xs shrink-0">{cicdOpen ? '▲' : '▼'}</span>
        </button>

        {cicdOpen && (
          <div className="border-t border-accent/20 px-4 py-3 space-y-3">
            <p className="text-xs text-text-muted">Complete API flow — authenticate, start a run, post results, complete the run.</p>
            <div className="space-y-2">
              {CI_CD_STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <span className="text-[10px] text-text-muted font-medium w-4 shrink-0">{i + 1}.</span>
                  <span className="text-xs text-text-primary flex-1">{s.label}</span>
                  <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border w-14 text-center shrink-0 ${METHOD_BADGE[s.method] || ''}`}>
                    {s.method}
                  </span>
                  <code className="font-mono text-xs text-text-muted">{s.path}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Endpoint sections */}
      {API_SECTIONS.map(section => (
        <div key={section.title} className="space-y-1.5">
          <div className="flex items-center gap-2 pb-1 border-b border-border">
            <span className="text-xs font-semibold text-text-primary uppercase tracking-wide">{section.title}</span>
            <span className="text-xs text-text-muted">{section.endpoints.length} endpoint{section.endpoints.length !== 1 ? 's' : ''}</span>
          </div>
          {section.endpoints.map(ep => (
            <EndpointCard key={ep.method + ep.path} ep={ep} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ---- Users Tab (admin only) ----
function UsersTab() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery<any[]>({ queryKey: ['users'], queryFn: () => fetch('/api/v1/users').then(r => r.json()) })
  const { data: projects = [] } = useQuery<any[]>({ queryKey: ['projects'], queryFn: () => fetch('/api/v1/projects').then(r => r.json()) })
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [assignUser, setAssignUser] = useState<any | null>(null)
  const [assignedIds, setAssignedIds] = useState<string[]>([])
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormErr('')
    setSaving(true)
    try {
      const res = await fetch('/api/v1/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { setFormErr(data.error || 'Failed to create user'); return }
      qc.invalidateQueries({ queryKey: ['users'] })
      setForm({ username: '', email: '', password: '' })
      setToast({ msg: `User '${data.username}' created.`, type: 'success' })
    } catch { setFormErr('Network error') } finally { setSaving(false) }
  }

  async function toggleActive(user: any) {
    await fetch(`/api/v1/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !user.is_active }) })
    qc.invalidateQueries({ queryKey: ['users'] })
  }

  async function toggleRequireJira(user: any) {
    const next = !user.require_jira_creds
    await fetch(`/api/v1/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ require_jira_creds: next }) })
    qc.invalidateQueries({ queryKey: ['users'] })
    setToast({ msg: next ? `Jira credentials now required for ${user.username}.` : `Jira credential requirement removed for ${user.username}.`, type: 'success' })
  }

  async function resetPassword(user: any) {
    const pw = prompt(`Set new password for '${user.username}':`)
    if (!pw) return
    const res = await fetch(`/api/v1/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
    const data = await res.json()
    if (res.ok) setToast({ msg: 'Password reset. User must change on next login.', type: 'success' })
    else setToast({ msg: data.error || 'Failed', type: 'error' })
  }

  async function openAssign(user: any) {
    const res = await fetch(`/api/v1/users/${user.id}/projects`)
    const assigned = await res.json()
    setAssignedIds(assigned.map((p: any) => p.id))
    setAssignUser(user)
  }

  async function saveAssign() {
    if (!assignUser) return
    await fetch(`/api/v1/users/${assignUser.id}/projects`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectIds: assignedIds }) })
    setAssignUser(null)
    setToast({ msg: 'Project assignments saved.', type: 'success' })
  }

  return (
    <div className="space-y-4">
      {/* Create user */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Plus size={15} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Create Tester Account</span>
        </div>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Username *</label>
              <input className="input w-full text-sm" required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Email</label>
              <input className="input w-full text-sm" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Temporary Password *</label>
            <input className="input w-full text-sm" type="password" required minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            <p className="text-[11px] text-text-muted mt-1">User will be prompted to change on first login.</p>
          </div>
          {formErr && <p className="text-xs text-fail">{formErr}</p>}
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create User
          </button>
        </form>
      </div>

      {/* User list */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Team Members</span>
        </div>
        {isLoading ? <p className="text-xs text-text-muted">Loading…</p> : (
          <div className="space-y-2">
            {users.map((u: any) => (
              <div key={u.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${u.is_active ? 'border-border bg-surface-1' : 'border-border/40 bg-surface-1/50 opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{u.username}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${u.role === 'admin' ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-muted'}`}>{u.role}</span>
                    {!u.is_active && <span className="text-[10px] text-fail font-medium">inactive</span>}
                    {u.must_change_password && <span className="text-[10px] text-warning font-medium">pw change required</span>}
                  </div>
                  {u.email && <p className="text-xs text-text-muted mt-0.5">{u.email}</p>}
                </div>
                {u.role !== 'admin' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      title={u.require_jira_creds ? 'Jira credentials enforced — click to remove requirement' : 'Jira credentials not enforced — click to require'}
                      onClick={() => toggleRequireJira(u)}
                      className={`btn-ghost p-1.5 ${u.require_jira_creds ? 'text-accent' : 'text-text-muted hover:text-accent'}`}
                    >
                      <Link2 size={13} />
                    </button>
                    <button title="Assign projects" onClick={() => openAssign(u)} className="btn-ghost p-1.5 text-text-muted hover:text-accent"><ShieldCheck size={13} /></button>
                    <button title="Reset password" onClick={() => resetPassword(u)} className="btn-ghost p-1.5 text-text-muted hover:text-warning"><KeyRound size={13} /></button>
                    <button title={u.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(u)} className={`btn-ghost p-1.5 ${u.is_active ? 'text-text-muted hover:text-fail' : 'text-text-muted hover:text-pass'}`}>
                      {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign projects modal */}
      {assignUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Assign projects — {assignUser.username}</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projects.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="checkbox" className="accent-accent" checked={assignedIds.includes(p.id)}
                    onChange={e => setAssignedIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(i => i !== p.id))} />
                  <span className="text-sm text-text-primary group-hover:text-accent">{p.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost text-sm border border-border" onClick={() => setAssignUser(null)}>Cancel</button>
              <button className="btn-primary text-sm" onClick={saveAssign}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ---- Layout Tab (admin only) ----
function LayoutTab() {
  const { data: layout, isLoading } = useLayoutSettings()
  const update = useUpdateLayoutSettings()
  const uploadFavicon = useUploadFavicon()
  const deleteFavicon = useDeleteFavicon()
  const faviconRef = useRef<HTMLInputElement>(null)

  const [appName, setAppName] = useState('')
  const [selectedIcon, setSelectedIcon] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (layout) {
      setAppName(layout.appName)
      setSelectedIcon(layout.iconName)
    }
  }, [layout])

  function showToast(msg: string, type: 'success' | 'error') { setToast({ msg, type }) }

  async function handleSave() {
    try {
      await update.mutateAsync({ appName: appName.trim() || 'LTCM', iconName: selectedIcon })
      setDirty(false)
      showToast('Layout settings saved.', 'success')
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadFavicon.mutateAsync(file)
      showToast('Favicon uploaded.', 'success')
    } catch (e: any) { showToast(e.message || 'Upload failed', 'error') }
    e.target.value = ''
  }

  async function handleDeleteFavicon() {
    try {
      await deleteFavicon.mutateAsync()
      showToast('Favicon removed.', 'success')
    } catch { showToast('Remove failed', 'error') }
  }

  if (isLoading) return <div className="text-text-muted text-sm p-5">Loading…</div>

  const PreviewIcon = ICON_MAP[selectedIcon] ?? ICON_MAP['FlaskConical']

  return (
    <div className="space-y-4">
      {/* App name + icon */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Palette size={15} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Branding</span>
        </div>

        {/* App name */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <Type size={12} /> App name
          </label>
          <input
            className="input w-full text-sm max-w-xs"
            value={appName}
            placeholder="LTCM"
            onChange={e => { setAppName(e.target.value); setDirty(true) }}
          />
        </div>

        {/* Icon picker */}
        <div className="space-y-2">
          <label className="text-xs text-text-muted font-medium">App icon</label>
          <div className="flex flex-wrap gap-2">
            {ICON_OPTIONS.map(name => {
              const Icon = ICON_MAP[name]
              const active = selectedIcon === name
              return (
                <button
                  key={name}
                  title={name}
                  onClick={() => { setSelectedIcon(name); setDirty(true) }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all
                    ${active
                      ? 'bg-accent/20 border-accent text-accent shadow-sm shadow-accent/20'
                      : 'bg-surface-2 border-border text-text-muted hover:text-text-primary hover:border-border-2'
                    }`}
                >
                  <Icon size={16} />
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-text-muted">Currently selected: <span className="font-mono text-text-primary">{selectedIcon}</span></p>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-2 border border-border w-fit">
          <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center text-accent">
            <PreviewIcon size={16} />
          </div>
          <span className="text-xs font-bold text-text-primary tracking-wide">{appName || 'LTCM'}</span>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-primary text-sm" onClick={handleSave} disabled={!dirty || update.isPending}>
            {update.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Save changes
          </button>
          {dirty && (
            <button className="btn-ghost text-sm text-text-muted flex items-center gap-1.5" onClick={() => {
              setAppName(layout?.appName || 'LTCM')
              setSelectedIcon(layout?.iconName || 'FlaskConical')
              setDirty(false)
            }}>
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Favicon */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon size={15} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Favicon</span>
        </div>
        <p className="text-xs text-text-muted">
          Upload a custom favicon shown in the browser tab. Accepts PNG, SVG, ICO, or WebP. Max 1 MB.
        </p>

        {layout?.hasFavicon && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-2 border border-border w-fit">
            <img src={`/api/v1/settings/layout/favicon?v=${Date.now()}`} alt="favicon" className="w-6 h-6 object-contain" />
            <span className="text-xs text-pass">Custom favicon active</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            className="btn-primary text-sm"
            onClick={() => faviconRef.current?.click()}
            disabled={uploadFavicon.isPending}
          >
            {uploadFavicon.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {layout?.hasFavicon ? 'Replace favicon' : 'Upload favicon'}
          </button>
          {layout?.hasFavicon && (
            <button
              className="btn-ghost text-sm border border-border text-red-400 hover:text-red-300 flex items-center gap-1.5"
              onClick={handleDeleteFavicon}
              disabled={deleteFavicon.isPending}
            >
              <XCircle size={13} /> Remove
            </button>
          )}
        </div>
        <input ref={faviconRef} type="file" accept=".png,.ico,.svg,.jpg,.jpeg,.webp" className="hidden" onChange={handleFaviconUpload} />
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ---- Logs Tab (admin only) ----
type LogKind = 'app' | 'access'

function LogsTab() {
  const [kind, setKind] = useState<LogKind>('app')
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchLogs = useCallback(async (k: LogKind = kind) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/v1/admin/logs/${k}?lines=500`)
      if (!res.ok) { setError('Failed to fetch logs'); return }
      const data = await res.json()
      setLines(data.lines ?? [])
    } catch { setError('Network error') } finally { setLoading(false) }
  }, [kind])

  useEffect(() => { fetchLogs(kind) }, [kind, fetchLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => fetchLogs(kind), 10000)
    return () => clearInterval(id)
  }, [autoRefresh, kind, fetchLogs])

  return (
    <div className="space-y-4">
      {/* Sub-tabs + controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 p-0.5 rounded-lg bg-surface-2 border border-border">
          {(['app', 'access'] as LogKind[]).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                kind === k ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {k === 'app' ? 'App Logs' : 'Access Logs'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-accent"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (10s)
          </label>
          <button
            className="btn-ghost text-xs border border-border flex items-center gap-1.5"
            onClick={() => fetchLogs(kind)}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-text-muted">
        {kind === 'app'
          ? 'Application events in syslog format. Last 500 entries, newest first. Logs are pruned every hour — entries older than 24h are removed.'
          : 'API requests. Format: timestamp · source IP · username · method · path. Last 500 entries, newest first.'}
      </p>

      {/* Log viewer */}
      <div className="rounded-lg border border-border bg-[#0d0d14] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wide">
            {kind === 'app' ? 'app.log' : 'access.log'}
          </span>
          <span className="text-[10px] text-text-muted font-mono">{lines.length} lines</span>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-3 font-mono text-[11px] leading-relaxed space-y-0.5">
          {error && <div className="text-fail">{error}</div>}
          {!error && lines.length === 0 && !loading && (
            <div className="text-text-muted italic">No log entries yet.</div>
          )}
          {lines.map((line, i) => {
            const isErr  = /\bERROR\b/.test(line)
            const isWarn = /\bWARN\b/.test(line)
            const cls = isErr ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-emerald-300/80'
            return (
              <div key={i} className={`whitespace-pre-wrap break-all ${cls}`}>{line}</div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- Main ----
export default function SettingsPage() {
  const { search } = useLocation()
  const rawTab = new URLSearchParams(search).get('tab')
  // 'database' and 'backup' legacy params now map to 'system'
  const initialTab = (rawTab === 'database' || rawTab === 'backup' ? 'system' : rawTab) as Tab | null
  const [tab, setTab] = useState<Tab>(initialTab ?? 'info')
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [health, setHealth] = useState<{ version: string; dbHost: string; dbName: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useState(() => {
    fetch('/api/v1/health').then(r => r.json()).then(setHealth)
  })

  function downloadBackup() { window.location.href = '/api/v1/backup' }
  function pickFile() { fileRef.current?.click() }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPendingFile(f)
    setRestoreConfirm(true)
    e.target.value = ''
  }

  async function doRestore() {
    if (!pendingFile) return
    setLoading(true)
    setRestoreConfirm(false)
    const fd = new FormData()
    fd.append('file', pendingFile)
    try {
      const res = await fetch('/api/v1/restore', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        setToast({ msg: 'Backup restored successfully. Reloading…', type: 'success' })
        setTimeout(() => window.location.href = '/', 1500)
      } else {
        setToast({ msg: data.error || 'Restore failed', type: 'error' })
      }
    } catch {
      setToast({ msg: 'Network error during restore', type: 'error' })
    } finally {
      setLoading(false)
      setPendingFile(null)
    }
  }

  const { user: authUser } = useAuth()

  const tabs = ([
    { id: 'info' as Tab,      label: 'Info',      icon: <Info size={14} /> },
    { id: 'system' as Tab,    label: 'System',    icon: <Server size={14} /> },
    { id: 'jira' as Tab,      label: 'Jira',      icon: <Link2 size={14} /> },
    { id: 'utilities' as Tab, label: 'Utilities', icon: <Wrench size={14} /> },
    { id: 'layout' as Tab,    label: 'Layout',    icon: <Palette size={14} />, adminOnly: true },
    { id: 'apidocs' as Tab,   label: 'API Docs',  icon: <FileCode2 size={14} /> },
    { id: 'logs' as Tab,      label: 'Logs',      icon: <ScrollText size={14} />, adminOnly: true },
    { id: 'users' as Tab,     label: 'Users',     icon: <Users size={14} />, adminOnly: true },
  ] as { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[])
    .filter(t => !t.adminOnly || authUser?.role === 'admin')

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Settings" />

      <div className="flex gap-0 px-6 pb-8">
        {/* Left tab sidebar */}
        <div className="w-40 shrink-0 pt-1 pr-4 space-y-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === t.id
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-2'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 max-w-2xl">
          {/* Info */}
          {tab === 'info' && (
            <div className="card p-5 space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-text-muted">
                  <span className="w-24 text-xs uppercase tracking-wide font-medium">Version</span>
                  <span className="font-mono text-text-primary">{health?.version || '—'}</span>
                </div>
                <div className="flex items-start gap-2 text-text-muted">
                  <span className="w-24 text-xs uppercase tracking-wide font-medium shrink-0">DB Host</span>
                  <span className="font-mono text-text-primary text-xs">{health?.dbHost || '—'}</span>
                </div>
                <div className="flex items-start gap-2 text-text-muted">
                  <span className="w-24 text-xs uppercase tracking-wide font-medium shrink-0">DB Name</span>
                  <span className="font-mono text-text-primary text-xs">{health?.dbName || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-text-muted">
                  <span className="w-24 text-xs uppercase tracking-wide font-medium shrink-0">Source</span>
                  <a
                    href="https://github.com/CorithLabs/LTCM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline font-mono"
                  >
                    github.com/CorithLabs/LTCM
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* System — Backup + Database */}
          {tab === 'system' && (
            <div className="space-y-4">
              {/* Backup */}
              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Download size={16} className="text-accent" />
                  <span className="text-sm font-semibold text-text-primary">Backup & Restore</span>
                </div>
                <p className="text-xs text-text-muted">
                  Export all your projects, suites, test cases, and run history as a JSON file.
                  Use this to back up your data or move to a new machine.
                </p>
                <div className="flex gap-3">
                  <button className="btn-primary text-sm flex-1" onClick={downloadBackup}>
                    <Download size={14} /> Export Backup
                  </button>
                  <button className="btn-ghost text-sm flex-1 border border-border" onClick={pickFile} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Import Backup
                  </button>
                </div>
                <p className="text-xs text-text-muted">
                  ⚠️ Importing a backup will <strong>overwrite all existing data</strong>.
                </p>
                <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={onFileChange} />
              </div>

              {/* Database */}
              <DatabaseTab />
            </div>
          )}

          {/* Jira */}
          {tab === 'jira' && <JiraTab />}

          {/* Utilities */}
          {tab === 'utilities' && <UtilitiesTab isAdmin={authUser?.role === 'admin'} />}

          {/* Layout — admin only */}
          {tab === 'layout' && authUser?.role === 'admin' && <LayoutTab />}

          {/* API Docs */}
          {tab === 'apidocs' && <ApiDocsTab />}

          {/* Logs — admin only */}
          {tab === 'logs' && authUser?.role === 'admin' && <LogsTab />}

          {/* Users — admin only */}
          {tab === 'users' && authUser?.role === 'admin' && <UsersTab />}
        </div>
      </div>

      {restoreConfirm && (
        <ConfirmModal
          title="Restore backup?"
          message={<>This will <strong>overwrite all existing data</strong> with the contents of <strong>{pendingFile?.name}</strong>. This cannot be undone.</>}
          confirmLabel="Restore"
          danger
          onConfirm={doRestore}
          onCancel={() => { setRestoreConfirm(false); setPendingFile(null) }}
        />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}
