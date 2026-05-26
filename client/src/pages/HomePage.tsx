import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Play, Loader2, Trash2, Pencil, Link2, Users } from 'lucide-react'
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject, useProjectMembers, useSetProjectMembers, Project } from '../api'
import { ConfirmModal, StatusBadge, EmptyState, PageHeader, Toast } from '../components'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'

function UserPicker({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const { data: rawUsers } = useQuery<any>({
    queryKey: ['users'],
    queryFn: () => fetch('/api/v1/users').then(r => r.json()),
  })
  const users: any[] = Array.isArray(rawUsers) ? rawUsers : []
  const testers = users.filter((u: any) => u.is_active)
  if (!testers.length) return <p className="text-xs text-text-muted">No tester accounts yet.</p>
  return (
    <div className="space-y-1.5 max-h-40 overflow-y-auto">
      {testers.map((u: any) => (
        <label key={u.id} className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            className="accent-accent"
            checked={selectedIds.includes(u.id)}
            onChange={e => onChange(e.target.checked ? [...selectedIds, u.id] : selectedIds.filter(i => i !== u.id))}
          />
          <span className="text-sm text-text-primary group-hover:text-accent">{u.username}</span>
          {u.email && <span className="text-xs text-text-muted">{u.email}</span>}
          <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${u.role === 'admin' ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-muted'}`}>{u.role}</span>
        </label>
      ))}
    </div>
  )
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [jiraKey, setJiraKey] = useState('')
  const [userIds, setUserIds] = useState<string[]>([])
  const [err, setErr] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required'); return }
    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        jiraProjectKey: jiraKey.trim() || null,
        userIds: userIds.length > 0 ? userIds : undefined,
      })
      onClose()
    } catch (e: any) { setErr(e.message || 'Create failed') }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl shadow-black/40 p-6 w-full max-w-md space-y-5">
        <div>
          <h3 className="text-base font-bold text-text-primary">New Project</h3>
          <p className="text-xs text-text-muted mt-0.5">Set up a new testing project</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name <span className="text-fail">*</span></label>
            <input
              className="input w-full" autoFocus
              placeholder="e.g. Mobile App v2"
              value={name} onChange={e => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <label className="label">Description <span className="text-text-muted font-normal">(optional)</span></label>
            <input
              className="input w-full"
              placeholder="What are you testing?"
              value={description} onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <Link2 size={12} className="text-accent" />
              Jira Project Key <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              className="input w-full font-mono"
              placeholder="e.g. SONG"
              value={jiraKey} onChange={e => setJiraKey(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1.5 mb-2">
              <Users size={12} className="text-accent" />
              Assign testers <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <UserPicker selectedIds={userIds} onChange={setUserIds} />
          </div>
          {err && <p className="text-xs text-fail">{err}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || create.isPending}>
              {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const update = useUpdateProject()
  const { data: currentMembers = [] } = useProjectMembers(project.id)
  const setMembers = useSetProjectMembers(project.id)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description || '')
  const [jiraKey, setJiraKey] = useState(project.jira_project_key || '')
  const [userIds, setUserIds] = useState<string[] | null>(null)
  const [err, setErr] = useState('')

  // Initialise user selection once members load
  const effectiveUserIds = userIds ?? currentMembers.map((m: any) => m.id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required'); return }
    try {
      await update.mutateAsync({
        id: project.id,
        name: name.trim(),
        description: description.trim() || undefined,
        jiraProjectKey: jiraKey.trim() || null,
      })
      await setMembers.mutateAsync(effectiveUserIds)
      onClose()
    } catch (e: any) { setErr(e.message || 'Save failed') }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl shadow-black/40 p-6 w-full max-w-md space-y-5">
        <div>
          <h3 className="text-base font-bold text-text-primary">Edit Project</h3>
          <p className="text-xs text-text-muted mt-0.5">Update project details and team assignments</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name <span className="text-fail">*</span></label>
            <input
              className="input w-full" autoFocus
              value={name} onChange={e => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <label className="label">Description <span className="text-text-muted font-normal">(optional)</span></label>
            <input
              className="input w-full"
              placeholder="What are you testing?"
              value={description} onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <Link2 size={12} className="text-accent" />
              Jira Project Key <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              className="input w-full font-mono"
              placeholder="e.g. SONG"
              value={jiraKey} onChange={e => setJiraKey(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1.5 mb-2">
              <Users size={12} className="text-accent" />
              Assigned testers
            </label>
            <UserPicker selectedIds={effectiveUserIds} onChange={setUserIds} />
          </div>
          {err && <p className="text-xs text-fail">{err}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || update.isPending || setMembers.isPending}>
              {(update.isPending || setMembers.isPending) ? <Loader2 size={14} className="animate-spin" /> : null}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { data: projects = [], isLoading } = useProjects()
  const del = useDeleteProject()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [creating, setCreating] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function confirmDelete(id: string) {
    const p = projects.find(p => p.id === id)
    if (p?.last_run_status === 'in_progress') {
      setToast('Cannot delete a project with an in-progress run.')
      setDeleteTarget(null)
      return
    }
    del.mutate(id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (e: Error) => { setToast(e.message); setDeleteTarget(null) }
    })
  }

  const deleteProject = projects.find(p => p.id === deleteTarget)

  return (
    <div className="h-full overflow-y-auto">
    <div>
      <PageHeader
        title="Projects"
        subtitle={projects.length > 0 ? `${projects.length} project${projects.length !== 1 ? 's' : ''}` : undefined}
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={15} /> New Project
            </button>
          ) : undefined
        }
      />

      {/* Project list */}
      <div className="px-6 py-5 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
        )}

        {!isLoading && projects.length === 0 && (
          <EmptyState
            icon={<FolderOpen size={40} />}
            title="No projects yet"
            description={isAdmin ? "Create your first project to start organising test cases." : "No projects have been assigned to you yet. Ask your admin to create a project and add you to it."}
            action={isAdmin ? <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={14} />New Project</button> : undefined}
          />
        )}

        {projects.map(p => {
          const statusColor = p.last_run_status === 'completed' ? 'bg-pass'
            : p.last_run_status === 'in_progress' ? 'bg-progress'
            : 'bg-border'
          return (
            <div key={p.id} className="card hover:border-border-2 transition-all duration-150 group cursor-pointer overflow-hidden"
              onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="flex items-stretch">
                {/* Status stripe */}
                <div className={`w-1 shrink-0 rounded-l-2xl ${statusColor} opacity-60 group-hover:opacity-100 transition-opacity`} />

                <div className="flex-1 flex items-center gap-4 px-4 py-3.5">
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent shrink-0 group-hover:bg-accent/20 transition-colors">
                    <FolderOpen size={16} />
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text-primary text-sm truncate">{p.name}</span>
                      {p.jira_project_key && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/15 shrink-0">
                          {p.jira_project_key}
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{p.description}</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="shrink-0">
                    {p.last_run_status ? (
                      <StatusBadge status={p.last_run_status} />
                    ) : (
                      <span className="text-xs text-text-muted/60">No runs yet</span>
                    )}
                  </div>

                  {/* Actions — visible on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={e => e.stopPropagation()}>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                      title="Start Run"
                      onClick={() => navigate(`/projects/${p.id}/runs/new`)}
                    >
                      <Play size={12} /> Run
                    </button>
                    {isAdmin && (
                      <button
                        className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                        title="Edit project"
                        onClick={() => setEditProject(p)}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {isAdmin && !p.is_demo && (
                      <button
                        className="p-2 rounded-xl text-text-muted hover:text-fail hover:bg-fail/10 transition-colors"
                        title="Delete project"
                        onClick={() => setDeleteTarget(p.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
      {editProject && <EditProjectModal project={editProject} onClose={() => setEditProject(null)} />}

      {deleteTarget && (
        <ConfirmModal
          title="Delete project?"
          message={<>This will permanently delete <strong>{deleteProject?.name}</strong> and all its suites, test cases, and run history.</>}
          confirmLabel="Delete"
          danger
          onConfirm={() => confirmDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
    </div>
  )
}
