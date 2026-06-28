// src/UncodedAssets.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function UncodedAssets() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [codes, setCodes] = useState({})       // asset id -> typed code
  const [savingId, setSavingId] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('assets')
      .select('id, condition, location_id, product_id, products(name), locations(code, name)')
      .eq('status', 'awaiting_code')
      .order('id')
    if (error) setError(error.message)
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function setCode(id, value) {
    setCodes({ ...codes, [id]: value })
  }

  async function assignCode(asset) {
    const code = (codes[asset.id] || '').trim()
    setError(null)
    if (!code) { setError('Enter a code first.'); return }

    setSavingId(asset.id)
    // Saving a code makes the asset pickable: set the code and flip to in_store.
    const { error } = await supabase
      .from('assets')
      .update({ asset_code: code, status: 'in_store' })
      .eq('id', asset.id)
    setSavingId(null)

    if (error) {
      // The unique index will reject a duplicate code with a clear error.
      if (error.message.toLowerCase().includes('duplicate') || error.code === '23505') {
        setError(`Code "${code}" is already used by another asset. Try again.`)
      } else {
        setError(error.message)
      }
    } else {
      // Remove the now-coded asset from the list.
      setRows(rows.filter((r) => r.id !== asset.id))
      const next = { ...codes }; delete next[asset.id]; setCodes(next)
    }
  }

  if (loading) return <p>Loading uncoded assets…</p>
  if (error && rows.length === 0) return <p className="error">{error}</p>

  if (rows.length === 0) return <p>No uncoded assets — everything’s stickered up.</p>

  return (
    <div>
      <p className="pick-empty">
        {rows.length} asset{rows.length === 1 ? '' : 's'} awaiting a code. Stick the label on, type the code, and save — that makes it pickable.
      </p>
      {error && <div className="form-error">{error}</div>}
      <table className="data-table">
        <thead>
          <tr><th>Type</th><th>Condition</th><th>Location</th><th>Sticker code</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{a.products?.name || '—'}</td>
              <td>{a.condition}</td>
              <td>{a.locations ? `${a.locations.code} — ${a.locations.name}` : '—'}</td>
              <td>
                <input
                  type="text"
                  className="qty-inline code-input"
                  placeholder="enter code"
                  value={codes[a.id] || ''}
                  onChange={(e) => setCode(a.id, e.target.value)}
                />
              </td>
              <td className="line-actions">
                <button onClick={() => assignCode(a)} disabled={savingId === a.id}>
                  {savingId === a.id ? 'Saving…' : 'Save code'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}