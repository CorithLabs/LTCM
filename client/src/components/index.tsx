import { useEffect, useRef, ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, MinusCircle, X } from 'lucide-react'

// ---- ConfirmModal ----
interface ConfirmProps {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}
export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: ConfirmProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/40 outline-none"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onConfirm() }}
      >
        <div className="flex items-start gap-3 mb-5">
          <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${danger ? 'bg-fail/12 text-fail' : 'bg-accent/12 text-accent'}`}>
            <AlertTriangle size={17} />
          </div>
          <div className="pt-0.5">
            <h3 className="font-semibold text-text-primary text-sm leading-snug">{title}</h3>
            <div className="text-text-muted text-sm mt-1.5 leading-relaxed">{message}</div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-sm px-4" onClick={onCancel}>Cancel</button>
          <button
            className={`btn text-sm px-4 ${danger ? 'bg-fail/12 text-fail hover:bg-fail/20' : 'btn-primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- StatusBadge ----
type Status = 'pass' | 'fail' | 'skip' | 'blocked' | 'na' | 'in_progress' | 'completed' | null | undefined
export function StatusBadge({ status }: { status: Status }) {
  if (!status) return <span className="text-text-muted text-xs">—</span>
  const map: Record<string, { cls: string; icon: ReactNode; label: string }> = {
    pass:        { cls: 'badge-pass',     icon: <CheckCircle2 size={11} />, label: 'Pass' },
    fail:        { cls: 'badge-fail',     icon: <XCircle size={11} />,      label: 'Fail' },
    skip:        { cls: 'badge-skip',     icon: <MinusCircle size={11} />,  label: 'Skip' },
    blocked:     { cls: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-400', icon: null, label: 'Blocked' },
    na:          { cls: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400',  icon: null, label: 'N/A' },
    in_progress: { cls: 'badge-progress', icon: null, label: 'In Progress' },
    completed:   { cls: 'badge-pass',    icon: <CheckCircle2 size={11} />, label: 'Completed' },
  }
  const s = map[status]
  if (!s) return null
  return <span className={s.cls}>{s.icon}{s.label}</span>
}

// ---- PriorityBadge ----
export function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const labels = { high: 'High', medium: 'Medium', low: 'Low' }
  const cls = { high: 'badge-high', medium: 'badge-medium', low: 'badge-low' }
  return <span className={cls[priority]}>{labels[priority]}</span>
}

// ---- EmptyState ----
export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-2">
      {icon && (
        <div className="mb-3 text-text-muted/25">{icon}</div>
      )}
      <p className="text-text-primary font-semibold text-sm">{title}</p>
      {description && <p className="text-text-muted text-xs max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---- PageHeader ----
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
      <div>
        <h1 className="text-base font-bold text-text-primary tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ---- Progress Bar ----
export function ProgressBar({ passed, failed, skipped, blocked = 0, na = 0, total }: {
  passed: number; failed: number; skipped: number; blocked?: number; na?: number; total: number
}) {
  if (total === 0) return null
  const pct = (n: number) => Math.round((n / total) * 100)
  return (
    <div className="flex rounded-full overflow-hidden h-1.5 bg-surface-2 w-full gap-px">
      <div className="bg-pass transition-all rounded-full" style={{ width: `${pct(passed)}%` }} />
      <div className="bg-fail transition-all" style={{ width: `${pct(failed)}%` }} />
      <div className="bg-skip/70 transition-all" style={{ width: `${pct(skipped)}%` }} />
      <div className="bg-orange-500 transition-all" style={{ width: `${pct(blocked)}%` }} />
      <div className="bg-slate-500 transition-all" style={{ width: `${pct(na)}%` }} />
    </div>
  )
}

// ---- Toast ----
export function Toast({ message, type = 'error', onDismiss }: { message: string; type?: 'error' | 'success'; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 4000); return () => clearTimeout(t) }, [onDismiss])
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl shadow-black/30 text-sm font-medium max-w-sm w-max
      ${type === 'error'
        ? 'bg-surface border-fail/25 text-fail'
        : 'bg-surface border-pass/25 text-pass'}`}
    >
      {type === 'error' ? <XCircle size={15} className="shrink-0" /> : <CheckCircle2 size={15} className="shrink-0" />}
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-1 text-text-muted hover:text-text-primary transition-colors shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}
