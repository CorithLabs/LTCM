import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const BASE = '/api/v1'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { code: data.code, data })
  return data
}

// --- Types ---
export interface Project {
  id: string; name: string; description: string | null
  jira_project_key: string | null; is_demo: boolean
  created_at: string; last_run_at: string | null; last_run_status: 'in_progress' | 'completed' | null
}

export interface LayoutSettings {
  appName: string; iconName: string; hasFavicon: boolean
}

export const useLayoutSettings = () => useQuery<LayoutSettings>({
  queryKey: ['layoutSettings'],
  queryFn: () => fetch('/api/v1/settings/layout').then(r => r.json()),
  staleTime: 5 * 60 * 1000,
})

export const useUpdateLayoutSettings = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Pick<LayoutSettings, 'appName' | 'iconName'>>) =>
      req<LayoutSettings>('PATCH', '/settings/layout', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['layoutSettings'] }),
  })
}

export const useUploadFavicon = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData(); fd.append('favicon', file)
      const res = await fetch('/api/v1/settings/layout/favicon', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['layoutSettings'] }),
  })
}

export const useDeleteFavicon = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => req<{ ok: boolean }>('DELETE', '/settings/layout/favicon'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['layoutSettings'] }),
  })
}
export interface Suite {
  id: string; project_id: string; name: string; description: string | null
  sort_order: number; created_at: string; case_count: number; suite_number: number | null
  jira_epic_key: string | null; jira_epic_name: string | null; jira_epic_url: string | null
}
export interface TestCase {
  id: string; suite_id: string; title: string; preconditions: string | null
  steps: string[]; expected_result: string; priority: 'high' | 'medium' | 'low'
  sort_order: number; created_at: string; case_number: number | null
  last_run_status: RunCaseStatus | null; last_run_id: string | null
  last_run_number: number | null; last_run_project_id: string | null
  tags: string[]
  created_by_username: string | null; updated_by_username: string | null; updated_at: string | null
}
export interface Run {
  id: string; project_id: string; name: string; status: 'in_progress' | 'completed'
  created_at: string; completed_at: string | null
  passed: number; failed: number; skipped: number; blocked: number; na: number; case_count: number
  jira_version_id: string | null; jira_version_name: string | null
  environment: string | null; run_number: number | null
  created_by_username: string | null
}
export interface JiraConfig {
  connected: boolean; baseUrl?: string; ltcmBaseUrl?: string | null
}
export interface JiraUserCredentials {
  hasCredentials: boolean; email?: string
}
export interface JiraVersion {
  id: string; name: string; released: boolean; releaseDate: string | null
}
export interface JiraIssue {
  key: string; summary: string; status: string | null; type: string | null
}
export interface JiraLink {
  id: string; case_id: string; jira_issue_key: string; jira_issue_summary: string | null
  jira_issue_url: string | null; created_at: string
}
export type RunCaseStatus = 'pass' | 'fail' | 'skip' | 'blocked' | 'na'
export interface StepResult {
  stepIndex: number; status: 'pass' | 'fail'; actualResult?: string
}
export interface RunCase {
  id: string; run_id: string; case_id: string; title: string
  preconditions: string | null; steps: string[]; expected_result: string
  priority: 'high' | 'medium' | 'low'; suite_name: string; sort_order: number
  status: RunCaseStatus | null; note: string | null
  step_results: StepResult[] | null; case_number: number | null
}
export interface DiffEntry { caseId: string; title: string; suiteName: string }
export interface RunDiff {
  regressions: DiffEntry[]
  fixes: DiffEntry[]
  newCases: DiffEntry[]
  previousRunId: string
}
export interface RunDefect {
  jira_issue_key: string; jira_issue_url: string | null; jira_issue_summary: string | null
  case_title: string; suite_name: string
}
export interface RunSummary extends Run {
  total: number; duration_ms: number | null; project_name?: string
  diff: RunDiff | null
  defects: RunDefect[]
  cases: RunCase[]
}

// --- Projects ---
export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: () => req<Project[]>('GET', '/projects') })

export const useProjectMembers = (projectId: string) => useQuery({
  queryKey: ['projectMembers', projectId],
  queryFn: () => req<{ id: string; username: string; email: string | null; role: string }[]>('GET', `/projects/${projectId}/members`),
  enabled: !!projectId,
})

export const useSetProjectMembers = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userIds: string[]) => req<{ ok: boolean }>('PUT', `/projects/${projectId}/members`, { userIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projectMembers', projectId] }),
  })
}

export const useCreateProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { name: string; description?: string; jiraProjectKey?: string | null; userIds?: string[] }) => req<Project>('POST', '/projects', d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] })
  })
}

export const useUpdateProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...d }: { id: string; name?: string; description?: string; jiraProjectKey?: string | null }) => req<Project>('PATCH', `/projects/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] })
  })
}

export const useDeleteProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => req<void>('DELETE', `/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] })
  })
}

// --- Suites ---
export const useSuites = (projectId: string) => useQuery({
  queryKey: ['suites', projectId],
  queryFn: () => req<Suite[]>('GET', `/projects/${projectId}/suites`),
  enabled: !!projectId
})

export const useCreateSuite = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { name: string; description?: string }) => req<Suite>('POST', `/projects/${projectId}/suites`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suites', projectId] })
  })
}

export const useUpdateSuite = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...d }: { id: string; name?: string; description?: string; order?: number; jiraEpicKey?: string | null }) => req<Suite>('PATCH', `/suites/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suites', projectId] })
  })
}

export const useDeleteSuite = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => req<void>('DELETE', `/suites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suites', projectId] })
  })
}

// --- Cases ---
export const useCases = (suiteId: string) => useQuery({
  queryKey: ['cases', suiteId],
  queryFn: () => req<TestCase[]>('GET', `/suites/${suiteId}/cases`),
  enabled: !!suiteId
})

export const useCreateCase = (suiteId: string, projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: Omit<TestCase, 'id' | 'suite_id' | 'sort_order' | 'created_at'>) =>
      req<TestCase>('POST', `/suites/${suiteId}/cases`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', suiteId] })
      qc.invalidateQueries({ queryKey: ['suites', projectId] })
    }
  })
}

export const useUpdateCase = (suiteId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...d }: Partial<TestCase> & { id: string; order?: number }) => req<TestCase>('PATCH', `/cases/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases', suiteId] })
  })
}

export const useDeleteCase = (suiteId: string, projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => req<void>('DELETE', `/cases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', suiteId] })
      qc.invalidateQueries({ queryKey: ['suites', projectId] })
    }
  })
}

export interface CaseLastRun {
  status: RunCaseStatus; run_id: string; run_name: string; run_number: number | null; project_id: string
}

export const useCaseLastRun = (caseId: string) => useQuery({
  queryKey: ['caseLastRun', caseId],
  queryFn: () => req<CaseLastRun | null>('GET', `/cases/${caseId}/last-run`),
  enabled: !!caseId,
  staleTime: 30000,
})

export const useDuplicateCase = (suiteId: string, projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => req<TestCase>('POST', `/cases/${id}/duplicate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', suiteId] })
      qc.invalidateQueries({ queryKey: ['suites', projectId] })
    }
  })
}

export const useMoveCase = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, suite_id }: { id: string; suite_id: string }) =>
      req<TestCase>('PATCH', `/cases/${id}/move`, { suite_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] })
      qc.invalidateQueries({ queryKey: ['suites', projectId] })
    }
  })
}

// --- Runs ---
export const useRuns = (projectId: string) => useQuery({
  queryKey: ['runs', projectId],
  queryFn: () => req<Run[]>('GET', `/projects/${projectId}/runs`),
  enabled: !!projectId
})

export const useCreateRun = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { name?: string; suite_ids?: string[]; jiraVersionId?: string; jiraVersionName?: string; environment?: string }) =>
      req<Run>('POST', `/projects/${projectId}/runs`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    }
  })
}

export const useRunCases = (runId: string) => useQuery({
  queryKey: ['runCases', runId],
  queryFn: () => req<RunCase[]>('GET', `/runs/${runId}/cases`),
  enabled: !!runId
})

export const useUpdateRunCase = (runId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...d }: { id: string; status?: string; note?: string; stepResults?: StepResult[] }) =>
      req<RunCase>('PATCH', `/runs/${runId}/cases/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runCases', runId] })
  })
}

export const useCompleteRun = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, force }: { runId: string; force?: boolean }) =>
      req<Run & { jiraComments?: Array<{ issueKey: string; ok: boolean; status?: number }> }>('PATCH', `/runs/${runId}`, { status: 'completed', force_complete: force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    }
  })
}

export const useRunSummary = (runId: string) => useQuery({
  queryKey: ['runSummary', runId],
  queryFn: () => req<RunSummary>('GET', `/runs/${runId}/summary`),
  enabled: !!runId
})

export const useCancelRun = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => req<{ ok: boolean }>('POST', `/runs/${runId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    }
  })
}

export const useCloneRun = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, name }: { runId: string; name?: string }) =>
      req<Run>('POST', `/runs/${runId}/clone`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    }
  })
}

export interface CaseHistoryEntry {
  id: string; run_id: string; status: RunCaseStatus | null
  run_name: string; run_number: number | null
  created_at: string; completed_at: string | null; run_status: string
  note: string | null
}
export const useCaseHistory = (caseId: string) => useQuery({
  queryKey: ['caseHistory', caseId],
  queryFn: () => req<CaseHistoryEntry[]>('GET', `/cases/${caseId}/history`),
  enabled: !!caseId
})

export const useRerunFailures = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, statuses }: { runId: string; statuses?: string[] }) =>
      req<Run>('POST', `/runs/${runId}/rerun`, { statuses }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    }
  })
}

// --- Attachments ---
export interface Attachment {
  id: string; run_case_id: string; filename: string; original_name: string
  mime_type: string | null; size: number | null; created_at: string
}

export const useAttachments = (runCaseId: string) => useQuery({
  queryKey: ['attachments', runCaseId],
  queryFn: () => req<Attachment[]>('GET', `/run-cases/${runCaseId}/attachments`),
  enabled: !!runCaseId
})

export const useUploadAttachment = (runCaseId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/v1/run-cases/${runCaseId}/attachments`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      return data as Attachment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', runCaseId] })
  })
}

export const useDeleteAttachment = (runCaseId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: string) => req<void>('DELETE', `/attachments/${attachmentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', runCaseId] })
  })
}

export interface CaseStat {
  case_id: string; title: string; priority: 'high' | 'medium' | 'low'; sort_order: number
  total_runs: number; passed: number; failed: number; skipped: number; blocked: number; na: number
  last_status: RunCaseStatus | null
}
export interface SuiteStatEntry {
  id: string; name: string; sort_order: number
  total_cases: number; total_runs: number
  passed: number; failed: number; skipped: number; blocked: number; na: number
}
export interface SuiteStats {
  suite: Suite; total_cases: number; total_runs: number
  passed: number; failed: number; skipped: number; blocked: number; na: number
  passRate: number | null; caseStats: CaseStat[]
}
export interface ProjectStats {
  total_cases: number; total_runs: number
  passed: number; failed: number; skipped: number; blocked: number; na: number
  passRate: number | null; suiteStats: SuiteStatEntry[]
}

export const useProjectStats = (projectId: string) => useQuery({
  queryKey: ['projectStats', projectId],
  queryFn: () => req<ProjectStats>('GET', `/projects/${projectId}/stats`),
  enabled: !!projectId,
})

export const useSuiteStats = (suiteId: string) => useQuery({
  queryKey: ['suiteStats', suiteId],
  queryFn: () => req<SuiteStats>('GET', `/suites/${suiteId}/stats`),
  enabled: !!suiteId,
})

export interface SuiteBug {
  id: string; jira_issue_key: string; jira_issue_url: string | null; jira_issue_summary: string | null
  link_type: 'manual' | 'created' | 'comment'; created_at: string
  case_id: string; case_title: string
  run_id: string | null; run_name: string | null; run_number: number | null
}

export const useSuiteBugs = (suiteId: string, enabled = true) => useQuery({
  queryKey: ['suiteBugs', suiteId],
  queryFn: () => req<SuiteBug[]>('GET', `/suites/${suiteId}/bugs`),
  enabled: !!suiteId && enabled,
})

export interface ProjectBug extends SuiteBug {
  case_number: number | null
  suite_id: string
  suite_name: string
}

export const useProjectBugs = (projectId: string, enabled = true) => useQuery({
  queryKey: ['projectBugs', projectId],
  queryFn: () => req<ProjectBug[]>('GET', `/projects/${projectId}/bugs`),
  enabled: !!projectId && enabled,
})

export interface ImportResult { imported: number; skipped: Array<{ row: number; reason: string }>; total: number }

export const useImportCases = (suiteId: string, projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${BASE}/suites/${suiteId}/cases/import`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw Object.assign(new Error(data.error || 'Import failed'), { code: data.code, data })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases', suiteId] })
      qc.invalidateQueries({ queryKey: ['suites', projectId] })
    },
  })
}

export const useCreateDefect = (runId: string, caseId: string) => useMutation({
  mutationFn: async (d: { summary?: string; description?: string; issueType?: string; attachments?: File[] }) => {
    const fd = new FormData()
    if (d.summary)      fd.append('summary', d.summary)
    if (d.description)  fd.append('description', d.description)
    if (d.issueType)    fd.append('issueType', d.issueType)
    for (const file of d.attachments || []) fd.append('attachments', file)
    const res = await fetch(`/api/v1/runs/${runId}/cases/${caseId}/defect`, { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Create defect failed')
    return data as { jiraIssueKey: string; jiraIssueUrl: string; attachments: Array<{ name: string; ok: boolean }> }
  },
})

export const usePostJiraComment = (runId: string, caseId: string) => useMutation({
  mutationFn: (issueKey: string) =>
    req<{ ok: boolean; issueKey: string; issueUrl: string }>('POST', `/runs/${runId}/cases/${caseId}/jira-comment`, { issueKey }),
})

// --- Jira ---
export const useJiraConfig = () => useQuery({
  queryKey: ['jiraConfig'],
  queryFn: () => req<JiraConfig>('GET', '/jira/config'),
})

export const useSaveJiraConfig = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { baseUrl: string; ltcmBaseUrl?: string | null }) =>
      req<JiraConfig>('POST', '/jira/config', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jiraConfig'] })
    }
  })
}

export const useEditJiraConfig = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { baseUrl: string; ltcmBaseUrl?: string | null }) =>
      req<JiraConfig>('PATCH', '/jira/config', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jiraConfig'] })
    }
  })
}

export const useMyJiraCredentials = () => useQuery({
  queryKey: ['myJiraCredentials'],
  queryFn: () => req<JiraUserCredentials>('GET', '/jira/my-credentials'),
})

export const useSaveMyJiraCredentials = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { email: string; apiToken: string }) =>
      req<JiraUserCredentials>('POST', '/jira/my-credentials', d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myJiraCredentials'] }),
  })
}

export const useDeleteMyJiraCredentials = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => req<void>('DELETE', '/jira/my-credentials'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myJiraCredentials'] }),
  })
}

export const useDeleteJiraConfig = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => req<void>('DELETE', '/jira/config'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jiraConfig'] })
      qc.invalidateQueries({ queryKey: ['jiraVersions'] })
    }
  })
}

export const useTestJira = () => useMutation({
  mutationFn: () => req<{ ok: boolean; displayName: string }>('POST', '/jira/test', {}),
})

export interface JiraStatusMapping { pass: string | null; fail: string | null; in_progress: string | null }

export const useJiraStatuses = (enabled: boolean) => useQuery({
  queryKey: ['jiraStatuses'],
  queryFn: () => req<string[]>('GET', '/jira/statuses'),
  enabled,
})

export const useJiraStatusMapping = (enabled: boolean) => useQuery({
  queryKey: ['jiraStatusMapping'],
  queryFn: () => req<JiraStatusMapping>('GET', '/jira/status-mapping'),
  enabled,
})

export const useSaveJiraStatusMapping = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: Partial<JiraStatusMapping>) => req<JiraStatusMapping>('PUT', '/jira/status-mapping', d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jiraStatusMapping'] }),
  })
}

export const useJiraVersions = (enabled: boolean) => useQuery({
  queryKey: ['jiraVersions'],
  queryFn: () => req<JiraVersion[]>('GET', '/jira/versions'),
  enabled,
})

export const useJiraIssue = (key: string) => useQuery({
  queryKey: ['jiraIssue', key],
  queryFn: () => req<JiraIssue>('GET', `/jira/issues?key=${encodeURIComponent(key)}`),
  enabled: false, // manually triggered
})

export const useCaseJiraLinks = (caseId: string, enabled: boolean) => useQuery({
  queryKey: ['jiraLinks', caseId],
  queryFn: () => req<JiraLink[]>('GET', `/jira/cases/${caseId}/jira-links`),
  enabled: enabled && !!caseId,
})

export const useLinkJiraIssue = (caseId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jiraIssueKey: string) => req<JiraLink>('POST', `/jira/cases/${caseId}/jira-links`, { jiraIssueKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jiraLinks', caseId] })
  })
}

export const useUnlinkJiraIssue = (caseId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) => req<void>('DELETE', `/jira/cases/${caseId}/jira-links/${linkId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jiraLinks', caseId] })
  })
}

// --- Search ---
export interface SearchCase {
  id: string; title: string; priority: 'high' | 'medium' | 'low'; case_number: number | null
  suite_id: string; suite_name: string; suite_number: number | null
  project_id: string; project_name: string; last_run_status: RunCaseStatus | null
}
export interface SearchSuite {
  id: string; name: string; suite_number: number | null; case_count: number
  project_id: string; project_name: string
  jira_epic_key: string | null; jira_epic_name: string | null; jira_epic_url: string | null
}
export interface SearchProject {
  id: string; name: string; description: string | null; last_run_status: 'in_progress' | 'completed' | null
}
export interface SearchRun {
  id: string; name: string; run_number: number | null; status: 'in_progress' | 'completed'
  created_at: string; environment: string | null; jira_version_name: string | null
  project_id: string; project_name: string
}
export interface SearchResult {
  mode: 'keyword' | 'structured'; total: number
  cases: SearchCase[]; suites: SearchSuite[]; projects: SearchProject[]; runs: SearchRun[]
}

export const useSearch = (q: string) => useQuery({
  queryKey: ['search', q],
  queryFn: () => req<SearchResult>('GET', `/search?q=${encodeURIComponent(q)}`),
  enabled: q.trim().length > 0,
  staleTime: 30000,
})

// --- DB Config ---
export interface DbConfig {
  host: string; port: number; user: string; database: string; hasPassword: boolean
}

export interface DbConfigForm {
  host: string; port: string; user: string; password: string; database: string
}

export const useDbConfig = () => useQuery({
  queryKey: ['dbConfig'],
  queryFn: () => req<DbConfig>('GET', '/db/config'),
})

export const useTestDbConnection = () => useMutation({
  mutationFn: (d: DbConfigForm) => req<{ ok: boolean }>('POST', '/db/test', d),
})

export const useSaveDbConfig = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DbConfigForm) => req<{ ok: boolean; host: string; port: number; database: string }>('POST', '/db/config', d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dbConfig'] }),
  })
}
