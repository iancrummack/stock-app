// src/PeopleControl.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const EMPTY = { id: null, name: '', role: '', can_hold_assets: true, is_active: true }

export default function PeopleControl() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [heldCount, setHeldCount] = useState(null)   // assets held, when deactivating

  async function load() {
    const { data, error } = await supabase
      .from('people')
      .select('id, name, role, can_hold_assets, is_active')
      .order('name')
    if (error) setError(error.message)
    else setPeople(data || [])
  }

  useEffect(() => {
    async function init() { setLoading(true); setError(null); await load(); setLoading(false) }
    init()
  }, [])

  function startNew() { setForm(EMPTY); setHeldCount(null); setEditing(true); setError(null) }
  function startEdit(p) {
    setForm({ id: p.id, name: p.name || '', role: p.role || '', can_hold_assets: p.can_hold_assets, is_active: p.is_active })
    setHeldCount(null); setEditing(true); setError(null)
  }
  function cancel() { setEditing(false); setForm(EMPTY); setHeldCount(null); setError(null) }

  // When editing an existing person, if they're being set inactive, check held assets.
  async function setActive(value) {
    setForm({ ...form, is_active: value })
    if (!value && form.id) {
      const { count } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('holder_id', form.id)
      setHeldCount(count || 0)
    } else {
      setHeldCount(null)
    }
  }

  async function handleSave() {
    setError(null)
    if (!form.name.trim()) { setError('Please enter a name.'); return }

    const row = {
      name: form.name.trim(),
      role: form.role.trim() || null,
      can_hold_assets: form.can_hold_assets,
      is_active: form.is_active,
    }

    setStatus('saving')
    const result = form.id
      ? await supabase.from('people').update(row).eq('id', form.id)
      : await supabase.from('people').insert(row)
    setStatus(null)

    if (result.error) setError(result.error.message)
    else { await load(); setEditing(false); setForm(EMPTY); setHeldCount(null) }
  }

  if (loading) return <p>Loading people…</p>

  if (editing) {
    return (
      <div className="form-card">
        <h3 className="form-title">{form.id ? 'Edit person' : 'New person'}</h3>
        <div className="form-field">
          <label>Name</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Role (optional)</label>
          <input type="text" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Joiner, Site Manager" />
        </div>
        <div className="form-field">
          <label>Can hold assets</label>
          <select value={form.can_hold_assets ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, can_hold_assets: e.target.value === 'yes' })}>
            <option value="yes">Yes — permitted to hold assets</option>
            <option value="no">No — not permitted</option>
          </select>
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={form.is_active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive (left the business)</option>
          </select>
        </div>

        {heldCount > 0 && (
          <div className="form-warning">
            This person still holds {heldCount} asset{heldCount === 1 ? '' : 's'}. You can save them as inactive,
            but those assets need reassigning to someone else on the Asset move screen, otherwise nobody is accountable for them.
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button onClick={handleSave} disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save person'}</button>
          <button className="btn-secondary" onClick={cancel} disabled={status === 'saving'}>Cancel</button>
        </div>
      </div>
    )
  }

  const visible = showInactive ? people : people.filter((p) => p.is_active)

  return (
    <div>
      <div className="list-actions">
        <button onClick={startNew}>+ New person</button>
      </div>
      <label className="filter-toggle" style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive people
      </label>
      {error && <div className="form-error">{error}</div>}
      {visible.length === 0 ? (
        <p>No people to show.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Can hold</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'row-warehouse-due'}>
                <td>{p.name}</td>
                <td>{p.role || '—'}</td>
                <td>{p.can_hold_assets ? 'Yes' : 'No'}</td>
                <td>{p.is_active ? 'Active' : 'Inactive'}</td>
                <td><button className="btn-link" onClick={() => startEdit(p)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}