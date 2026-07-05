// src/StockTake.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function StockTake() {
  const [phase, setPhase] = useState('setup')   // setup | counting | review | done
  const [error, setError] = useState(null)

  const [owners, setOwners] = useState([])
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])
  const [scopeType, setScopeType] = useState('owner')
  const [scopeId, setScopeId] = useState('')

  const [lines, setLines] = useState([])        // [{product_id, code, name, expected, locId}]
  const [counted, setCounted] = useState({})    // product_id -> counted value (string)
  const [note, setNote] = useState('')
  const [loadingLines, setLoadingLines] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    async function loadScopes() {
      const [o, l, c] = await Promise.all([
        supabase.from('owners').select('id, name:owner').order('owner'),
        supabase.from('locations').select('id, code, name').order('code'),
        supabase.from('categories').select('id, name').order('name'),
      ])
      setOwners(o.data || [])
      setLocations(l.data || [])
      setCategories(c.data || [])
    }
    loadScopes()
  }, [])

  const scopeOptions = scopeType === 'owner' ? owners : scopeType === 'bay' ? locations : categories
  const scopeOptLabel = (opt) => scopeType === 'bay' ? `${opt.code} — ${opt.name}` : opt.name
  const locName = (id) => { const l = locations.find((x) => x.id === id); return l ? l.code : '—' }

  async function startCount() {
    setError(null)
    if (!scopeId) { setError('Choose what to count.'); return }
    setLoadingLines(true)

    let q = supabase.from('products')
      .select('id, code, name, default_location_id')
      .eq('tracking_type', 'quantity')
    if (scopeType === 'owner') q = q.eq('owner_id', scopeId)
    else if (scopeType === 'bay') q = q.eq('default_location_id', scopeId)
    else q = q.eq('category_id', scopeId)

    const { data: prods, error: pErr } = await q
    if (pErr) { setError(pErr.message); setLoadingLines(false); return }

    const { data: avail } = await supabase.from('stock_available').select('product_id, on_hand')
    const onHand = {}
    ;(avail || []).forEach((a) => { onHand[a.product_id] = Number(a.on_hand) })

    // Sort by home bay so counting walks the route in order.
    const built = (prods || []).map((p) => ({
      product_id: p.id, code: p.code, name: p.name,
      expected: onHand[p.id] ?? 0,
      locId: p.default_location_id,
    })).sort((a, b) => (a.locId ?? Number.MAX_SAFE_INTEGER) - (b.locId ?? Number.MAX_SAFE_INTEGER))

    // Informed counting: default each count to the expected figure; change only discrepancies.
    const initCounted = {}
    built.forEach((l) => { initCounted[l.product_id] = String(l.expected) })

    setLines(built)
    setCounted(initCounted)
    setNote('')
    setLoadingLines(false)
    if (built.length === 0) { setError('No products found in that scope.'); return }
    setPhase('counting')
  }

  const discrepancies = lines.filter((l) => Number(counted[l.product_id]) !== l.expected)

  async function confirm() {
    setError(null); setSaving(true)
    const payload = lines.map((l) => ({
      product_id: l.product_id,
      expected_qty: l.expected,
      counted_qty: Number(counted[l.product_id] || 0),
    }))
    const { data, error } = await supabase.rpc('commit_stocktake', {
      p_scope_type: scopeType,
      p_scope_id: Number(scopeId),
      p_lines: payload,
      p_note: note || null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setResult({ id: data, counted: lines.length, adjusted: discrepancies.length })
    setPhase('done')
  }

  function reset() {
    setPhase('setup'); setScopeId(''); setLines([]); setCounted({}); setNote(''); setResult(null); setError(null)
  }

  // ---- Setup ----
  if (phase === 'setup') {
    return (
      <div className="form-card" style={{ maxWidth: 520 }}>
        <h3 className="form-title">Start a stock take</h3>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
          Choose what to count. You'll see the expected figure for each item and enter what you actually count.
        </p>
        <div className="form-field">
          <label>Count by</label>
          <select value={scopeType} onChange={(e) => { setScopeType(e.target.value); setScopeId('') }}>
            <option value="owner">Owner</option>
            <option value="bay">Bay (location)</option>
            <option value="category">Category</option>
          </select>
        </div>
        <div className="form-field">
          <label>Which {scopeType === 'bay' ? 'bay' : scopeType}?</label>
          <select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            <option value="">— choose —</option>
            {scopeOptions.map((opt) => <option key={opt.id} value={opt.id}>{scopeOptLabel(opt)}</option>)}
          </select>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button onClick={startCount} disabled={loadingLines}>{loadingLines ? 'Loading…' : 'Start count'}</button>
        </div>
      </div>
    )
  }

  // ---- Counting ----
  if (phase === 'counting') {
    return (
      <div>
        <button className="btn-link" onClick={reset}>← Cancel</button>
        <h3 className="form-title" style={{ marginTop: '0.75rem' }}>Counting</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Each count starts at the expected figure, change only the ones that differ. Items are in warehouse route order.
        </p>
        {error && <div className="form-error">{error}</div>}

        <table className="data-table" style={{ marginTop: '0.5rem' }}>
          <thead>
            <tr><th>Code</th><th>Product</th><th>Bay</th><th className="num">Expected</th><th className="num">Counted</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const diff = Number(counted[l.product_id]) !== l.expected
              return (
                <tr key={l.product_id} className={diff ? 'row-soon' : ''}>
                  <td>{l.code}</td>
                  <td>{l.name}</td>
                  <td>{locName(l.locId)}</td>
                  <td className="num">{l.expected}</td>
                  <td className="num">
                    <input
                      type="number" min="0" className="qty-inline"
                      value={counted[l.product_id] ?? ''}
                      onChange={(e) => setCounted({ ...counted, [l.product_id]: e.target.value })}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="pick-commit-actions" style={{ marginTop: '1rem' }}>
          <button onClick={() => setPhase('review')}>Review ({discrepancies.length} to adjust)</button>
        </div>
      </div>
    )
  }

  // ---- Review ----
  if (phase === 'review') {
    return (
      <div>
        <button className="btn-link" onClick={() => setPhase('counting')}>← Back to counting</button>
        <h3 className="form-title" style={{ marginTop: '0.75rem' }}>Review before adjusting</h3>
        <p style={{ fontSize: '0.9rem' }}>
          Counted <strong>{lines.length}</strong> items · <strong style={{ color: discrepancies.length ? '#b71c1c' : '#1b5e20' }}>{discrepancies.length}</strong> need adjusting.
        </p>

        {discrepancies.length === 0 ? (
          <p className="detail-empty">Everything matched, no adjustments needed. You can still record the count.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Product</th><th className="num">Expected</th><th className="num">Counted</th><th className="num">Difference</th></tr>
            </thead>
            <tbody>
              {discrepancies.map((l) => {
                const c = Number(counted[l.product_id] || 0)
                const d = c - l.expected
                return (
                  <tr key={l.product_id} className="row-critical">
                    <td>{l.code}</td>
                    <td>{l.name}</td>
                    <td className="num">{l.expected}</td>
                    <td className="num">{c}</td>
                    <td className="num" style={{ color: d < 0 ? '#b71c1c' : '#1b5e20' }}>{d > 0 ? `+${d}` : d}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="form-field" style={{ maxWidth: 520, marginTop: '1rem' }}>
          <label>Note (optional, e.g. what you found)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="pick-commit-actions" style={{ marginTop: '1rem' }}>
          <button onClick={confirm} disabled={saving}>{saving ? 'Saving…' : 'Confirm and record count'}</button>
          <button className="btn-secondary" onClick={() => setPhase('counting')} disabled={saving}>Back</button>
        </div>
      </div>
    )
  }

  // ---- Done ----
  return (
    <div className="form-card">
      <div className="form-success">
        Stock take recorded. Counted {result?.counted} items, {result?.adjusted} adjustment{result?.adjusted === 1 ? '' : 's'} written.
        {result?.adjusted > 0 && ' The adjustments now appear in Transactions.'}
      </div>
      <div className="form-actions">
        <button onClick={reset}>New stock take</button>
      </div>
    </div>
  )
}