import { useState, FormEvent } from 'react'
import { FlaskConical, Eye, EyeOff, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function ChangePasswordPage() {
  const { user, refreshUser } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword !== confirm) { setError('Passwords do not match'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      await refreshUser()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/15 border border-accent/20 mb-4 shadow-lg shadow-accent/10">
            <FlaskConical size={26} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">LTCM</h1>
        </div>

        {/* Card */}
        <div className="card card-elevated p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-progress/15 border border-progress/20 shrink-0">
              <KeyRound size={16} className="text-progress" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Set your password</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Hey <span className="font-semibold text-text-secondary">{user?.username}</span> — choose a new password to continue.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPw ? 'text' : 'password'}
                  autoFocus
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={8}
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
            <div>
              <label className="label">Confirm password</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-fail bg-fail/8 border border-fail/20 rounded-lg px-3 py-2">
                <span className="shrink-0">⚠</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !newPassword || !confirm}
              className="btn-primary w-full justify-center py-2.5 text-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </span>
              ) : 'Set password & continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
