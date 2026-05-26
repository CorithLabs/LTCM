import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, NavLink, Link, useLocation, useMatch, useNavigate } from 'react-router-dom'
import {
  FlaskConical, Settings, ChevronLeft, Sun, Moon,
  FolderOpen, Layers, ChevronRight, ChevronDown,
  PanelLeftClose, PanelLeftOpen, FileText, Play, History,
  ServerOff, Search, LogOut, Home,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useSuites, useCases, useProjects, useRuns, useLayoutSettings } from '../api'
import { useAuth } from '../context/AuthContext'
import { ICON_MAP } from './AppIcon'

// ---- DB health check ----
function useDbConnected() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/health')
      return res.json() as Promise<{ dbConnected: boolean }>
    },
    refetchInterval: 5000,
    staleTime: 0,
  })
  return data?.dbConnected ?? true // assume connected until we know otherwise
}

// ---- User widget (bottom of sidebar) ----
function UserWidget({ showTree }: { showTree: boolean }) {
  const { user, logout } = useAuth()
  if (!user) return null
  const initials = user.username.slice(0, 2).toUpperCase()

  if (!showTree) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold border border-accent/20" title={user.username}>
          {initials}
        </div>
        <button onClick={logout} title="Sign out" className="flex items-center justify-center w-7 h-7 rounded-lg text-text-muted hover:text-fail hover:bg-fail/10 transition-colors">
          <LogOut size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl">
      <div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold shrink-0 border border-accent/20">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary truncate leading-tight">{user.username}</p>
        <p className="text-[10px] text-text-muted capitalize leading-tight">{user.role}</p>
      </div>
      <button onClick={logout} title="Sign out" className="text-text-muted hover:text-fail transition-colors shrink-0 p-1 rounded-lg hover:bg-fail/10">
        <LogOut size={13} />
      </button>
    </div>
  )
}

// ---- DB offline screen ----
function DbOfflineScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2">
          <ServerOff size={28} className="text-text-muted" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-text-primary">Database not reachable</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            LTCM could not connect to the database. Check your connection settings and make sure your PostgreSQL server is running.
          </p>
        </div>
        <Link
          to="/settings?tab=database"
          className="text-sm text-accent hover:underline font-medium"
        >
          Database settings
        </Link>
      </div>
    </div>
  )
}

// ---- Theme ----
function useTheme() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('light'))
  function toggle() {
    const next = !isLight
    setIsLight(next)
    document.documentElement.classList.toggle('light', next)
    localStorage.setItem('ltcm-theme', next ? 'light' : 'dark')
  }
  return { isLight, toggle }
}

// ---- Suite row with expandable cases ----
function SuiteNavRow({ suite, projectId, activeSuiteId, activeCaseId }: {
  suite: { id: string; name: string; case_count: number; suite_number?: number | null }
  projectId: string
  activeSuiteId: string | null
  activeCaseId: string | null
}) {
  const navigate = useNavigate()
  const isActive = suite.id === activeSuiteId
  const [open, setOpen] = useState(isActive)
  const { data: cases = [] } = useCases(open ? suite.id : '')

  useEffect(() => { if (isActive) setOpen(true) }, [isActive])

  return (
    <div>
      {/* Suite row */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer group transition-colors
          ${isActive ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-surface-2'}`}
      >
        <button
          className="shrink-0 w-4 h-4 flex items-center justify-center"
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          onClick={() => navigate(`/projects/${projectId}/suites/${suite.id}`)}
          title={suite.name}
        >
          <Layers size={11} className="shrink-0" />
          {suite.suite_number != null && <span className="text-[10px] font-mono text-text-muted/40 shrink-0">TS-{suite.suite_number}</span>}
          <span className="text-xs truncate">{suite.name}</span>
          <span className="ml-auto text-xs opacity-50 shrink-0">{suite.case_count}</span>
        </button>
      </div>

      {/* Case rows */}
      {open && cases.length > 0 && (
        <div className="ml-4 border-l border-border/40 pl-2 mt-0.5 space-y-0.5">
          {cases.map(tc => {
            const isCaseActive = tc.id === activeCaseId
            return (
              <button
                key={tc.id}
                onClick={() => navigate(`/projects/${projectId}/suites/${suite.id}/cases/${tc.id}`)}
                title={tc.title}
                className={`flex items-center gap-1.5 w-full text-left px-2 py-1 rounded-md transition-colors text-xs
                  ${isCaseActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-2'}`}
              >
                <FileText size={10} className="shrink-0" />
                {tc.case_number != null && <span className="text-[10px] font-mono text-text-muted/40 shrink-0">TC-{tc.case_number}</span>}
                <span className="truncate">{tc.title}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---- Project tree ----
function ProjectTree({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: suites = [] } = useSuites(projectId)

  const suiteMatch = useMatch('/projects/:projectId/suites/:suiteId/*')
  const caseMatch = useMatch('/projects/:projectId/suites/:suiteId/cases/:caseId')
  const activeSuiteId = suiteMatch?.params?.suiteId || null
  const activeCaseId = caseMatch?.params?.caseId || null
  const isOnProject = location.pathname === `/projects/${projectId}`

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {/* All Projects */}
      <button
        className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 rounded-lg transition-colors w-full text-left"
        onClick={() => navigate('/')}
      >
        <ChevronLeft size={11} />
        <span>All Projects</span>
      </button>

      {/* Project root */}
      <button
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors w-full text-left mt-1 text-xs font-semibold
          ${isOnProject ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-surface-2'}`}
        onClick={() => navigate(`/projects/${projectId}`)}
      >
        <FolderOpen size={12} className="shrink-0" />
        <span className="truncate">Overview</span>
      </button>

      {/* Divider */}
      {suites.length > 0 && (
        <div className="mt-2 mb-1 px-2">
          <span className="text-[10px] uppercase tracking-widest text-text-muted/50 font-semibold">Suites</span>
        </div>
      )}

      {/* Suites + expandable cases */}
      <div className="space-y-0.5">
        {suites.map(s => (
          <SuiteNavRow
            key={s.id}
            suite={s}
            projectId={projectId}
            activeSuiteId={activeSuiteId}
            activeCaseId={activeCaseId}
          />
        ))}
      </div>

      {/* Nav shortcuts */}
      <div className="mt-3 pt-2 border-t border-border/30 space-y-0.5">
        <button
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors w-full text-left"
          onClick={() => navigate(`/projects/${projectId}/runs/new`)}
        >
          <Play size={11} className="shrink-0" /> New Run
        </button>
        <button
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors w-full text-left"
          onClick={() => navigate(`/projects/${projectId}/runs`)}
        >
          <History size={11} className="shrink-0" /> Run History
        </button>
      </div>
    </div>
  )
}

// ---- Breadcrumb ----
function Breadcrumb() {
  const location = useLocation()
  const projectMatch = useMatch({ path: '/projects/:projectId', end: false })
  const suiteMatch = useMatch('/projects/:projectId/suites/:suiteId/*')
  const runExecuteMatch = useMatch('/projects/:projectId/runs/:runId/execute')
  const runSummaryMatch = useMatch('/projects/:projectId/runs/:runId/summary')
  const runsNewMatch = useMatch('/projects/:projectId/runs/new')
  const runsListMatch = useMatch('/projects/:projectId/runs')
  const settingsMatch = useMatch('/settings')

  const projectId = projectMatch?.params?.projectId || null
  const suiteId = suiteMatch?.params?.suiteId || null
  const runId = runExecuteMatch?.params?.runId || runSummaryMatch?.params?.runId || null

  const { data: projects = [] } = useProjects()
  const { data: suites = [] } = useSuites(projectId || '')
  const { data: runs = [] } = useRuns(projectId || '')

  if (location.pathname === '/') return null

  const project = projects.find(p => p.id === projectId)
  const suite = suites.find(s => s.id === suiteId)
  const run = runs.find(r => r.id === runId)

  const sep = <ChevronRight size={10} className="text-text-muted/40 shrink-0" />

  if (settingsMatch) {
    return (
      <nav className="flex items-center gap-1.5 text-xs">
        <Link to="/" className="text-text-muted hover:text-text-primary transition-colors"><Home size={12} /></Link>
        {sep}
        <span className="text-text-primary font-medium">Settings</span>
      </nav>
    )
  }

  if (!projectId) return null

  const projectCrumb = project ? (
    <Link to={`/projects/${projectId}`} className="text-text-muted hover:text-text-primary transition-colors max-w-[120px] truncate block">
      {project.name}
    </Link>
  ) : null

  let lastCrumb: React.ReactNode = null

  if (suiteId && suite) {
    lastCrumb = <span className="text-text-primary font-medium max-w-[120px] truncate block">{suite.name}</span>
  } else if (runExecuteMatch && run) {
    lastCrumb = <span className="text-text-primary font-medium max-w-[120px] truncate block">{run.name}</span>
  } else if (runSummaryMatch && run) {
    lastCrumb = <span className="text-text-primary font-medium max-w-[120px] truncate block">{run.name}</span>
  } else if (runsNewMatch) {
    lastCrumb = <span className="text-text-primary font-medium">New Run</span>
  } else if (runsListMatch) {
    lastCrumb = <span className="text-text-primary font-medium">Run History</span>
  }

  return (
    <nav className="flex items-center gap-1.5 text-xs">
      <Link to="/" className="text-text-muted hover:text-text-primary transition-colors shrink-0"><Home size={12} /></Link>
      {projectCrumb && <>{sep}{projectCrumb}</>}
      {lastCrumb && <>{sep}{lastCrumb}</>}
    </nav>
  )
}

// ---- Search bar ----
const SEARCH_HINTS = [
  { label: 'Keyword',  examples: ['login flow', 'checkout'] },
  { label: 'project',  examples: ['project = "My App"'] },
  { label: 'suite/ts', examples: ['ts = "TS-3"', 'suite = "Auth"'] },
  { label: 'tc/case',  examples: ['tc = "TC-42"', 'case = "login"'] },
  { label: 'priority', examples: ['priority = high'] },
  { label: 'status',   examples: ['status = fail', 'runstatus = pass'] },
  { label: 'run',      examples: ['run = "RUN-7"'] },
  { label: 'jira',    examples: ['jira = PROJ-123'] },
  { label: 'epic',    examples: ['epic = PROJ-456'] },
  { label: 'version', examples: ['version = "v1.0"'] },
]

function SearchBar() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  // Press "/" to focus
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault()
      inputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (value.trim()) { setFocused(false); navigate(`/search?q=${encodeURIComponent(value.trim())}`) }
  }

  function pickExample(example: string) {
    setValue(example)
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="relative w-44 shrink-0">
      <div className="relative w-full">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/50 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder='Search or use field = "value" syntax…'
          className="w-full pl-7 pr-8 py-1 text-xs bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
        />
        {!focused && (
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted/40 font-mono pointer-events-none">/</kbd>
        )}

        {/* Hint popover */}
        {focused && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-border rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="px-3 pt-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted/60 mb-2">Search fields</p>
              <div className="space-y-1">
                {SEARCH_HINTS.map(h => (
                  <div key={h.label} className="flex items-start gap-2">
                    <span className="text-[11px] font-mono text-accent w-16 shrink-0 pt-px">{h.label}</span>
                    <div className="flex flex-wrap gap-1">
                      {h.examples.map(ex => (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => pickExample(ex)}
                          className="text-[11px] font-mono text-text-muted bg-surface-2 hover:bg-border hover:text-text-primary px-1.5 py-0.5 rounded transition-colors"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-3 py-2 mt-1 border-t border-border/50 bg-surface-2/50">
              <p className="text-[10px] text-text-muted/60">
                Combine with <span className="font-mono text-text-muted">AND</span> · e.g.{' '}
                <button type="button" onClick={() => pickExample('project = "My App" AND status = fail')}
                  className="font-mono text-accent/80 hover:text-accent transition-colors">
                  project = "My App" AND status = fail
                </button>
              </p>
            </div>
          </div>
        )}
      </div>
    </form>
  )
}

// ---- Layout ----
export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isLight, toggle } = useTheme()
  const { data: layout } = useLayoutSettings()
  const appName = layout?.appName || 'LTCM'
  const AppIcon = ICON_MAP[layout?.iconName || 'FlaskConical'] ?? FlaskConical

  useEffect(() => { document.title = appName }, [appName])

  useEffect(() => {
    if (layout?.hasFavicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      link.href = `/api/v1/settings/layout/favicon?v=${Date.now()}`
    }
  }, [layout?.hasFavicon])

  const projectMatch = useMatch({ path: '/projects/:projectId', end: false })
  const projectId = projectMatch?.params?.projectId || null
  const isSettings = location.pathname === '/settings'
  const dbConnected = useDbConnected()

  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!projectId) setCollapsed(false)
  }, [projectId])

  const showTree = !!projectId && !collapsed

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar */}
      <aside className={`flex flex-col py-3 bg-surface border-r border-border shrink-0 overflow-hidden transition-all duration-200 ${showTree ? 'w-56' : 'w-14'}`}>
        {/* Logo */}
        <div className={`flex items-center gap-2.5 px-3 mb-4 ${showTree ? '' : 'justify-center'}`}>
          <NavLink
            to="/"
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0 border border-accent/20 shadow-sm shadow-accent/10"
            title={`${appName} — Home`}
          >
            <AppIcon size={16} />
          </NavLink>
          {showTree && (
            <div className="min-w-0">
              <span className="text-xs font-bold text-text-primary tracking-wide">{appName}</span>
              <p className="text-[10px] text-text-muted leading-none mt-0.5">Test Manager</p>
            </div>
          )}
        </div>

        {/* Tree */}
        {showTree && projectId ? (
          <div className="flex-1 overflow-y-auto">
            <ProjectTree projectId={projectId} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Bottom controls */}
        <div className={`flex flex-col gap-0.5 px-2 pt-2 border-t border-border/40 ${showTree ? '' : 'items-center'}`}>
          {projectId && (
            <button
              onClick={() => setCollapsed(c => !c)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors w-full ${showTree ? '' : 'justify-center'}`}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              {showTree && <span className="text-xs">Collapse</span>}
            </button>
          )}
          <button
            onClick={toggle}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors w-full ${showTree ? '' : 'justify-center'}`}
            title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {isLight ? <Moon size={14} /> : <Sun size={14} />}
            {showTree && <span className="text-xs">{isLight ? 'Dark mode' : 'Light mode'}</span>}
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors w-full ${showTree ? '' : 'justify-center'} ${isActive ? 'bg-surface-2 text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-surface-2'}`
            }
            title="Settings"
          >
            <Settings size={14} />
            {showTree && <span className="text-xs">Settings</span>}
          </NavLink>
          <div className="mt-1 pt-1 border-t border-border/40 w-full">
            <UserWidget showTree={showTree} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top nav bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface shrink-0">
          <div className="flex-1"><Breadcrumb /></div>
          <SearchBar />
        </div>
        <main className="flex-1 overflow-hidden flex flex-col">
          {!dbConnected && !isSettings ? <DbOfflineScreen /> : <Outlet />}
        </main>
      </div>
    </div>
  )
}
