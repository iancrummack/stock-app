// src/BayView.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function BayView() {
  const [locations, setLocations] = useState([])
  const [bayId, setBayId] = useState('')
  const [consumables, setConsumables] = useState([])
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load the list of bays once.
  useEffect(() => {
    async function loadBays() {
      const { data, error } = await supabase.from('locations').select('id, code, name').order('code')
      if (error) setError(error.message)
      else setLocations(data || [])
    }
    loadBays()
  }, [])

  // When a bay is chosen, load what's in it.
  useEffect(() => {
    if (!bayId) { setConsumables([]); setAssets([]); return }
    async function loadContents() {
      setLoading(true); setError(null)
      const [cons, ass] = await Promise.all([
        // Consumables whose HOME bay is this location.
        supabase.from('products')
          .select('id, code, name, category_id, categories(name)')
          .eq('tracking_type', 'quantity')
          .eq('default_location_id', bayId)
          .order('name'),
        // Assets CURRENTLY located in this bay.
        supabase.from('assets')
          .select('id, asset_code, condition, status, products(name)')
          .eq('location_id', bayId)
          .order('asset_code'),
      ])
      if (cons.error) setError(cons.error.message)
      else setConsumables(cons.data || [])
      if (ass.error) setError(ass.error.message)
      else setAssets(ass.data || [])
      setLoading(false)
    }
    loadContents()
  }, [bayId])

  const chosenBay = locations.find((l) => String(l.id) === String(bayId))

  return (
    <div>
      <div className="form-field" style={{ maxWidth: 360, marginBottom: '1.25rem' }}>
        <label>Choose a bay</label>
        <select value={bayId} onChange={(e) => setBayId(e.target.value)}>
          <option value="">— choose a bay —</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
        </select>
      </div>

      {error && <div className="form-error">{error}</div>}

      {!bayId ? (
        <p className="detail-empty">Pick a bay to see what's in it.</p>
      ) : loading ? (
        <p>Loading…</p>
      ) : (
        <div>
          <h3 className="form-title" style={{ marginBottom: '0.75rem' }}>
            {chosenBay ? `${chosenBay.code} — ${chosenBay.name}` : 'Bay'}
          </h3>

          <h4 className="detail-subhead">Consumables homed here ({consumables.length})</h4>
          {consumables.length === 0 ? (
            <p className="detail-empty" style={{ marginBottom: '1.5rem' }}>No consumables homed in this bay.</p>
          ) : (
            <table className="data-table" style={{ marginBottom: '1.5rem' }}>
              <thead><tr><th>Code</th><th>Name</th><th>Category</th></tr></thead>
              <tbody>
                {consumables.map((c) => (
                  <tr key={c.id}>
                    <td>{c.code}</td>
                    <td>{c.name}</td>
                    <td>{c.categories?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4 className="detail-subhead">Assets currently here ({assets.length})</h4>
          {assets.length === 0 ? (
            <p className="detail-empty">No assets currently in this bay.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Code</th><th>Type</th><th>Condition</th><th>Status</th></tr></thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td>{a.asset_code || '—'}</td>
                    <td>{a.products?.name || '—'}</td>
                    <td>{a.condition}</td>
                    <td>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}