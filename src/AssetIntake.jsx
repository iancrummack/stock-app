// src/AssetIntake.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function AssetIntake() {
  const [assetTypes, setAssetTypes] = useState([])
  const [locations, setLocations] = useState([])
  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [count, setCount] = useState('')
  const [condition, setCondition] = useState('new')
  const [status, setStatus] = useState(null)   // null | 'saving'
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    async function loadRef() {
      const [{ data: prods }, { data: locs }] = await Promise.all([
        supabase.from('products').select('id, code, name').eq('tracking_type', 'asset').order('name'),
        supabase.from('locations').select('id, code, name').order('code'),
      ])
      setAssetTypes(prods || [])
      setLocations(locs || [])
    }
    loadRef()
  }, [])

  async function handleIntake() {
    setError(null); setResult(null)
    if (!productId) { setError('Choose an asset type.'); return }
    if (!locationId) { setError('Choose where they arrived.'); return }
    const n = Number(count)
    if (!n || n <= 0 || !Number.isInteger(n)) { setError('Enter a whole number greater than zero.'); return }
    if (n > 100) { setError('That’s a lot — please log 100 or fewer at a time.'); return }

    // Build n individual asset rows, each uncoded and awaiting its sticker.
    const rows = Array.from({ length: n }, () => ({
      product_id: Number(productId),
      asset_code: null,
      condition,
      status: 'awaiting_code',
      location_id: Number(locationId),
      project_id: null,
      holder_id: null,
    }))

    setStatus('saving')
    const { error } = await supabase.from('assets').insert(rows)
    setStatus(null)

    if (error) {
      setError(error.message)
    } else {
      const typeName = assetTypes.find((t) => String(t.id) === String(productId))?.name || 'assets'
      setResult(`Logged ${n} ${typeName} as awaiting code. Find them on the Uncoded assets screen to sticker up.`)
      // Reset the whole form, ready for the next batch.
      setProductId('')
      setCount('')
      setCondition('new')
      setLocationId('')
    }
  }

  return (
    <div className="form-card">
      <div className="mode-banner banner-return">Logging new assets into the warehouse</div>

      <div className="form-field">
        <label>Asset type</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">— choose an asset type —</option>
          {assetTypes.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
        </select>
      </div>

      <div className="form-field">
        <label>How many arrived?</label>
        <input type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} />
      </div>

      <div className="form-field">
        <label>Condition</label>
        <select value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="new">new</option>
          <option value="good">good</option>
          <option value="fair">fair</option>
          <option value="poor">poor</option>
        </select>
      </div>

      <div className="form-field">
        <label>Where did they arrive?</label>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">— choose a location —</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
        </select>
      </div>

      {error && <div className="form-error">{error}</div>}
      {result && <div className="form-success">{result}</div>}

      <div className="form-actions">
        <button onClick={handleIntake} disabled={status === 'saving'}>
          {status === 'saving' ? 'Logging…' : 'Log arrivals'}
        </button>
      </div>
    </div>
  )
}