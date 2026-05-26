import { useState, FormEvent, useEffect } from 'react'
import { FlaskConical, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLayoutSettings } from '../api'
import { ICON_MAP } from '../components/AppIcon'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { data: layout } = useLayoutSettings()
  const appName = layout?.appName || 'LTCM'
  const AppIcon = ICON_MAP[layout?.iconName || 'FlaskConical'] ?? FlaskConical

  useEffect(() => { document.title = appName }, [appName])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-800/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/15 border border-accent/20 mb-4 shadow-lg shadow-accent/10">
            <AppIcon size={26} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">{appName}</h1>
          <p className="text-sm text-text-muted mt-1">Test Case Manager</p>
        </div>

        {/* Card */}
        <div className="card card-elevated p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Welcome back</h2>
            <p className="text-xs text-text-muted mt-0.5">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                type="text"
                autoFocus
                autoComplete="username"
                placeholder="your-username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-fail bg-fail/8 border border-fail/20 rounded-lg px-3 py-2">
                <span className="shrink-0">⚠</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-primary w-full justify-center py-2.5 text-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
