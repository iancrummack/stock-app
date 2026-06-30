// src/ServiceTypesControl.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const EMPTY = { id: null, name: '' }

export default function ServiceTypesControl() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState(null)

  async function load() {
    const { data, error } = await supabase
      .from('service_types')
      .select('id, name')
      .order('name')
    if (error) setError(error.message)
    else setTypes(data || [])
  }

  useEffect(() => {
    async function init() { setLoading(true); setError(null); await load(); setLoading(false) }
    init()
  }, [])

  function startNew() { setForm(EMPTY); setEditing(true); setError(null) }
  function startEdit(t) { setForm({ id: t.id, name: t.name || '' }); setEditing(true); setError(null) }
  function cancel() { setEditing(false); setForm(EMPTY); setError(null) }

  async function handleSave() {
    setError(null)
    if (!form.name.trim()) { setError('Please enter a service type name.'); return }
    const row = { name: form.name.trim() }
    setStatus('saving')
    const result = form.id
      ? await supabase.from('service_types').update(row).eq('id', form.id)
      : await supabase.from('service_types').insert(row)
    setStatus(null)
    if (result.error) setError(result.error.message)
    else { await load(); setEditing(false); setForm(EMPTY) }
  }

  if (loading) return <p>Loading service types…</p>

  if (editing) {
    return (
      <div className="form-card">
        <h3 className="form-title">{form.id ? 'Edit service type' : 'New service type'}</h3>
        <div className="form-field">
          <label>Service type name</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tank inspection, PAT test" />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button onClick={handleSave} disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save'}</button>
          <button className="btn-secondary" onClick={cancel} disabled={status === 'saving'}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="list-actions">
        <button onClick={startNew}>+ New service type</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {types.length === 0 ? (
        <p>No service types yet.</p>
      ) : (
        <table className="data-table">
          <thead><tr><th>Service type</th><th></th></tr></thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td><button className="btn-link" onClick={() => startEdit(t)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}