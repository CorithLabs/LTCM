import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { Loader2, KeyRound, CheckCircle2 } from 'lucide-react'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ProjectPage from './pages/ProjectPage'
import SuitePage from './pages/SuitePage'
import CaseEditorPage from './pages/CaseEditorPage'
import RunSetupPage from './pages/RunSetupPage'
import RunExecutePage from './pages/RunExecutePage'
import { RunHistoryPage, RunSummaryPage } from './pages/RunPages'
import SettingsPage from './pages/SettingsPage'
import SearchPage from './pages/SearchPage'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import { useAuth } from './context/AuthContext'

function JiraCredsRequiredPage() {
  const { refreshUser, logout } = useAuth()
  const [form, setForm] = useState({ email: '', apiToken: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/v1/jira/my-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      await refreshUser()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 mb-2">
            <KeyRound size={22} className="text-accent" />
          </div>
          <h1 className="text-lg font-semibold text-text-primary">Jira Credentials Required</h1>
          <p className="text-sm text-text-muted">
            Your admin requires a Jira API token before you can proceed.
            Enter your Atlassian email and API token to continue.
          </p>
        </div>
        <form onSubmit={handleSave} className="card p-5 space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Jira Email</label>
            <input
              className="input w-full text-sm"
              type="email"
              required
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">API Token</label>
            <input
              className="input w-full text-sm"
              type="password"
              required
              placeholder="Atlassian API token"
              value={form.apiToken}
              onChange={e => setForm(f => ({ ...f, apiToken: e.target.value }))}
            />
            <p className="text-[11px] text-text-muted mt-1">
              Generate one at <span className="font-mono">id.atlassian.com → Security → API tokens</span>
            </p>
          </div>
          {error && <p className="text-xs text-fail">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !form.email || !form.apiToken}
              className="btn-primary flex-1 text-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Save & Continue
            </button>
            <button
              type="button"
              className="btn-ghost text-sm border border-border"
              onClick={logout}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <span className="text-text-muted text-sm">Loading…</span>
    </div>
  )
  if (!user) return <LoginPage />
  if (user.mustChangePassword) return <ChangePasswordPage />
  if (user.jiraCredsRequired) return <JiraCredsRequiredPage />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="projects/:projectId" element={<ProjectPage />} />
          <Route path="projects/:projectId/suites/:suiteId" element={<SuitePage />} />
          <Route path="projects/:projectId/suites/:suiteId/cases/:caseId" element={<SuitePage />} />
          <Route path="projects/:projectId/cases/new" element={<CaseEditorPage />} />
          <Route path="projects/:projectId/cases/:caseId/edit" element={<CaseEditorPage />} />
          <Route path="projects/:projectId/runs" element={<RunHistoryPage />} />
          <Route path="projects/:projectId/runs/new" element={<RunSetupPage />} />
          <Route path="projects/:projectId/runs/:runId/execute" element={<RunExecutePage />} />
          <Route path="projects/:projectId/runs/:runId/summary" element={<RunSummaryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthGate>
  )
}