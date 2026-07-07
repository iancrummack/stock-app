// src/LocationsControl.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const EMPTY = { id: null, code: '', name: '', position: '' }

export default function LocationsControl() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState(null)

  async function loadLocations() {
    setLoading(true); setError(null)
    const { data, error } = await supabase
      .from('locations')
      .select('id, code, name, position')
      .order('position', { ascending: true, nullsFirst: false })
    if (error) setError(error.message)
    else setLocations(data || [])
    setLoading(false)
  }

  useEffect(() => { loadLocations() }, [])

  function startNew() {
    const nextPos = locations.length > 0
      ? Math.max(...locations.map((l) => l.position || 0)) + 1
      : 1
    setForm({ ...EMPTY, position: String(nextPos) })
    setEditing(true); setError(null)
  }

  function startEdit(loc) {
    setForm({
      id: loc.id,
      code: loc.code || '',
      name: loc.name || '',
      position: loc.position != null ? String(loc.position) : '',
    })
    setEditing(true); setError(null)
  }

  function cancel() { setEditing(false); setForm(EMPTY); setError(null) }
  function setField(field, value) { setForm({ ...form, [field]: value }) }

  async function handleSave() {
    setError(null)
    if (!form.code.trim()) { setError('Enter a location code.'); return }
    if (!form.name.trim()) { setError('Enter a location name.'); return }
    if (form.position === '' || isNaN(Number(form.position))) { setError('Enter a valid route position.'); return }

    const row = {
      code: form.code.trim(),
      name: form.name.trim(),
      position: Number(form.position),
    }

    setStatus('saving')
    const result = form.id
      ? await supabase.from('locations').update(row).eq('id', form.id)
      : await supabase.from('locations').insert(row)
    setStatus(null)

    if (result.error) setError(result.error.message)
    else { await loadLocations(); setEditing(false); setForm(EMPTY) }
  }

  if (loading) return <p>Loading locations…</p>

  if (editing) {
    return (
      <div className="form-card">
        <h3 className="form-title">{form.id ? 'Edit location' : 'New location'}</h3>
        <div className="form-field">
          <label>Code (e.g. A1B2)</label>
          <input type="text" value={form.code} onChange={(e) => setField('code', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Name (e.g. Aisle 1 Bay 2)</label>
          <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Route position (lower numbers are picked first)</label>
          <input type="number" min="1" value={form.position} onChange={(e) => setField('position', e.target.value)} />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button onClick={handleSave} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save location'}
          </button>
          <button className="btn-secondary" onClick={cancel} disabled={status === 'saving'}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="list-actions">
        <button onClick={startNew}>+ New location</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {locations.length === 0 ? (
        <p>No locations yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Position</th><th>Code</th><th>Name</th><th></th></tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id}>
                <td>{l.position ?? '—'}</td>
                <td>{l.code}</td>
                <td>{l.name}</td>
                <td><button className="btn-link" onClick={() => startEdit(l)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}