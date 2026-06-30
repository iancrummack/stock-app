// src/ProjectsControl.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const EMPTY = { id: null, code: '', name: '', is_active: true }

export default function ProjectsControl() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState(null)
  const [showDormant, setShowDormant] = useState(false)
  const [assetsOnSite, setAssetsOnSite] = useState(null)   // assets still at this project when going dormant

  async function load() {
    const { data, error } = await supabase
      .from('projects')
      .select('id, code, name, is_active')
      .order('code')
    if (error) setError(error.message)
    else setProjects(data || [])
  }

  useEffect(() => {
    async function init() { setLoading(true); setError(null); await load(); setLoading(false) }
    init()
  }, [])

function startNew() { setForm(EMPTY); setAssetsOnSite(null); setEditing(true); setError(null) }
  function startEdit(p) {
    setForm({ id: p.id, code: p.code || '', name: p.name || '', is_active: p.is_active })
    setAssetsOnSite(null); setEditing(true); setError(null)
  }
  function cancel() { setEditing(false); setForm(EMPTY); setAssetsOnSite(null); setError(null) }
  function setField(field, value) { setForm({ ...form, [field]: value }) }

  // When setting an existing project dormant, check for assets still assigned to it.
  async function setActive(value) {
    setForm({ ...form, is_active: value })
    if (!value && form.id) {
      const { count } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', form.id)
      setAssetsOnSite(count || 0)
    } else {
      setAssetsOnSite(null)
    }
  }

  async function handleSave() {
    setError(null)
    if (!form.code.trim()) { setError('Please enter a project code.'); return }
    if (!form.name.trim()) { setError('Please enter a project name.'); return }

    const row = { code: form.code.trim(), name: form.name.trim(), is_active: form.is_active }

    setStatus('saving')
    const result = form.id
      ? await supabase.from('projects').update(row).eq('id', form.id)
      : await supabase.from('projects').insert(row)
    setStatus(null)

    if (result.error) setError(result.error.message)
    else { await load(); setEditing(false); setForm(EMPTY) }
  }

  if (loading) return <p>Loading projects…</p>

  if (editing) {
    return (
      <div className="form-card">
        <h3 className="form-title">{form.id ? 'Edit project' : 'New project'}</h3>
        <div className="form-field">
          <label>Project code</label>
          <input type="text" value={form.code} onChange={(e) => setField('code', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Project name</label>
          <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={form.is_active ? 'active' : 'dormant'} onChange={(e) => setActive(e.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="dormant">Dormant (hidden from pickers)</option>
          </select>
        </div>

        {assetsOnSite > 0 && (
          <div className="form-warning">
            This project still has {assetsOnSite} asset{assetsOnSite === 1 ? '' : 's'} assigned to it.
            They should be recalled to the warehouse on the Asset move screen before the project goes dormant,
            otherwise that kit stays out on a closed job. You can still save it as dormant.
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button onClick={handleSave} disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save project'}</button>
          <button className="btn-secondary" onClick={cancel} disabled={status === 'saving'}>Cancel</button>
        </div>
      </div>
    )
  }

  const visible = showDormant ? projects : projects.filter((p) => p.is_active)

  return (
    <div>
      <div className="list-actions">
        <button onClick={startNew}>+ New project</button>
      </div>
      <label className="filter-toggle" style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
        <input type="checkbox" checked={showDormant} onChange={(e) => setShowDormant(e.target.checked)} /> Show dormant projects
      </label>
      {error && <div className="form-error">{error}</div>}
      {visible.length === 0 ? (
        <p>No projects to show.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'row-warehouse-due'}>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{p.is_active ? 'Active' : 'Dormant'}</td>
                <td><button className="btn-link" onClick={() => startEdit(p)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}