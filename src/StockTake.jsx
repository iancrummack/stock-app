// src/StockTake.jsx
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

export default function StockTake() {
  const [kind, setKind] = useState('consumable')   // consumable | asset
  const [phase, setPhase] = useState('setup')       // setup | counting | review | done
  const [error, setError] = useState(null)

  // ---- Consumable stock take state (unchanged) ----
  const [owners, setOwners] = useState([])
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])
  const [scopeType, setScopeType] = useState('owner')
  const [scopeId, setScopeId] = useState('')

  const [lines, setLines] = useState([])
  const [counted, setCounted] = useState({})
  const [note, setNote] = useState('')
  const [loadingLines, setLoadingLines] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  // ---- Asset stock take state ----
  const [aScope, setAScope] = useState('bay')        // bay | all | owner
  const [aBayId, setABayId] = useState('')
  const [aOwnerId, setAOwnerId] = useState('')
  const [aLines, setALines] = useState([])            // [{asset_id, code, type, ownerId, condition, status, bayCode, bayId}]
  const [aTicked, setATicked] = useState({})          // asset_id -> true when confirmed present
  const [aNote, setANote] = useState('')
  const [aLoadingLines, setALoadingLines] = useState(false)
  const [aSaving, setASaving] = useState(false)
  const [aResult, setAResult] = useState(null)

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
  const ownerName = (id) => { const o = owners.find((x) => x.id === id); return o ? o.name : '—' }

  function switchKind(k) {
    setKind(k)
    setPhase('setup')
    setError(null)
    setScopeId(''); setLines([]); setCounted({}); setNote(''); setResult(null)
    setAScope('bay'); setABayId(''); setAOwnerId(''); setALines([]); setATicked({}); setANote(''); setAResult(null)
  }

  // ---- Consumable counting (unchanged) ----
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

    const built = (prods || []).map((p) => ({
      product_id: p.id, code: p.code, name: p.name,
      expected: onHand[p.id] ?? 0,
      locId: p.default_location_id,
    })).sort((a, b) => (a.locId ?? Number.MAX_SAFE_INTEGER) - (b.locId ?? Number.MAX_SAFE_INTEGER))

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

  // ---- Asset counting ----
  async function startAssetCount() {
    setError(null)
    if (aScope === 'bay' && !aBayId) { setError('Choose a bay.'); return }
    if (aScope === 'owner' && !aOwnerId) { setError('Choose an owner.'); return }
    setALoadingLines(true)

    let q = supabase.from('assets')
      .select('id, asset_code, condition, status, product_id, products!inner(name, owner_id), location_id, locations(code, name)')
      .not('location_id', 'is', null)

    if (aScope === 'bay') q = q.eq('location_id', aBayId)
    else if (aScope === 'owner') q = q.eq('products.owner_id', aOwnerId)

    const { data: rows, error: aErr } = await q
    if (aErr) { setError(aErr.message); setALoadingLines(false); return }

    const built = (rows || []).map((r) => ({
      asset_id: r.id,
      code: r.asset_code || '(uncoded)',
      type: r.products?.name || '—',
      ownerId: r.products?.owner_id ?? null,
      condition: r.condition,
      status: r.status,
      bayCode: r.locations?.code || '—',
      bayId: r.location_id,
    })).sort((a, b) => {
      const byBay = (a.bayCode || '').localeCompare(b.bayCode || '')
      return byBay !== 0 ? byBay : (a.code || '').localeCompare(b.code || '')
    })

    setALines(built)
    setATicked({})
    setANote('')
    setALoadingLines(false)
    if (built.length === 0) { setError('No assets found in that scope.'); return }
    setPhase('counting')
  }

  const aFoundCount = aLines.filter((l) => aTicked[l.asset_id]).length
  const aNotFound = aLines.filter((l) => !aTicked[l.asset_id])

  async function confirmAsset() {
    setError(null); setASaving(true)
    const payload = aLines.map((l) => ({ asset_id: l.asset_id, found: !!aTicked[l.asset_id] }))
    const { data, error } = await supabase.rpc('commit_asset_stocktake', {
      p_lines: payload,
      p_note: aNote || null,
    })
    setASaving(false)
    if (error) { setError(error.message); return }
    setAResult({ id: data, total: aLines.length, found: aFoundCount, notFound: aNotFound.length })
    setPhase('done')
  }

  function resetAsset() {
    setPhase('setup'); setABayId(''); setAOwnerId(''); setALines([]); setATicked({}); setANote(''); setAResult(null); setError(null)
  }

  function exportAssetStocktake() {
    const rows = aLines.map((l) => ({
      Code: l.code,
      Type: l.type,
      Owner: ownerName(l.ownerId),
      Bay: l.bayCode,
      Condition: l.condition,
      Status: l.status,
      Found: aTicked[l.asset_id] ? 'Yes' : 'No',
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asset Stock Take')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `asset-stocktake-${today}.xlsx`)
  }

  // ==================== SETUP ====================
  if (phase === 'setup') {
    return (
      <div className="form-card" style={{ maxWidth: 520 }}>
        <div className="mode-toggle">
          <button className={kind === 'consumable' ? 'mode-btn active-issue' : 'mode-btn'} onClick={() => switchKind('consumable')}>Consumables</button>
          <button className={kind === 'asset' ? 'mode-btn active-return' : 'mode-btn'} onClick={() => switchKind('asset')}>Assets</button>
        </div>

        {kind === 'consumable' ? (
          <>
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
          </>
        ) : (
          <>
            <h3 className="form-title">Start an asset stock take</h3>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
              Choose what to check. You'll tick off each asset as you physically find it.
            </p>
            <div className="form-field">
              <label>Count</label>
              <select value={aScope} onChange={(e) => { setAScope(e.target.value); setABayId(''); setAOwnerId('') }}>
                <option value="bay">A specific bay</option>
                <option value="all">Everything currently in store</option>
                <option value="owner">By owner</option>
              </select>
            </div>
            {aScope === 'bay' && (
              <div className="form-field">
                <label>Which bay?</label>
                <select value={aBayId} onChange={(e) => setABayId(e.target.value)}>
                  <option value="">— choose —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                </select>
              </div>
            )}
            {aScope === 'owner' && (
              <div className="form-field">
                <label>Which owner?</label>
                <select value={aOwnerId} onChange={(e) => setAOwnerId(e.target.value)}>
                  <option value="">— choose —</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0 0' }}>
                  Only checks that owner's assets currently in store, assets out on site aren't included.
                </p>
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions">
              <button onClick={startAssetCount} disabled={aLoadingLines}>{aLoadingLines ? 'Loading…' : 'Start count'}</button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ==================== COUNTING ====================
  if (phase === 'counting' && kind === 'consumable') {
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

  if (phase === 'counting' && kind === 'asset') {
    return (
      <div>
        <button className="btn-link" onClick={resetAsset}>← Cancel</button>
        <h3 className="form-title" style={{ marginTop: '0.75rem' }}>Checking assets</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Tick each asset as you physically find it. Leave unticked anything you can't locate.
        </p>
        {error && <div className="form-error">{error}</div>}

        <table className="data-table" style={{ marginTop: '0.5rem' }}>
          <thead>
            <tr><th></th><th>Code</th><th>Type</th><th>Owner</th><th>Bay</th><th>Condition</th><th>Status</th></tr>
          </thead>
          <tbody>
            {aLines.map((l) => (
              <tr key={l.asset_id} className={aTicked[l.asset_id] ? '' : 'row-soon'}>
                <td>
                  <input
                    type="checkbox"
                    checked={!!aTicked[l.asset_id]}
                    onChange={(e) => setATicked({ ...aTicked, [l.asset_id]: e.target.checked })}
                  />
                </td>
                <td>{l.code}</td>
                <td>{l.type}</td>
                <td>{ownerName(l.ownerId)}</td>
                <td>{l.bayCode}</td>
                <td>{l.condition}</td>
                <td>{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pick-commit-actions" style={{ marginTop: '1rem' }}>
          <button onClick={() => setPhase('review')}>Review ({aNotFound.length} not found)</button>
        </div>
      </div>
    )
  }

  // ==================== REVIEW ====================
  if (phase === 'review' && kind === 'consumable') {
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

  if (phase === 'review' && kind === 'asset') {
    return (
      <div>
        <button className="btn-link" onClick={() => setPhase('counting')}>← Back to checking</button>
        <h3 className="form-title" style={{ marginTop: '0.75rem' }}>Review before recording</h3>
        <p style={{ fontSize: '0.9rem' }}>
          Checked <strong>{aLines.length}</strong> assets · <strong style={{ color: '#1b5e20' }}>{aFoundCount}</strong> found · <strong style={{ color: aNotFound.length ? '#b71c1c' : '#1b5e20' }}>{aNotFound.length}</strong> not found.
        </p>

        {aNotFound.length === 0 ? (
          <p className="detail-empty">Everything on the list was found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Type</th><th>Owner</th><th>Bay</th></tr>
            </thead>
            <tbody>
              {aNotFound.map((l) => (
                <tr key={l.asset_id} className="row-critical">
                  <td>{l.code}</td><td>{l.type}</td><td>{ownerName(l.ownerId)}</td><td>{l.bayCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="form-field" style={{ maxWidth: 520, marginTop: '1rem' }}>
          <label>Note (optional, e.g. what you found)</label>
          <input type="text" value={aNote} onChange={(e) => setANote(e.target.value)} placeholder="optional" />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="pick-commit-actions" style={{ marginTop: '1rem' }}>
          <button onClick={confirmAsset} disabled={aSaving}>{aSaving ? 'Saving…' : 'Confirm and record'}</button>
          <button className="btn-secondary" onClick={exportAssetStocktake} disabled={aLines.length === 0}>Export to Excel</button>
          <button className="btn-secondary" onClick={() => setPhase('counting')} disabled={aSaving}>Back</button>
        </div>
      </div>
    )
  }

  // ==================== DONE ====================
  if (kind === 'consumable') {
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

  return (
    <div className="form-card">
      <div className="form-success">
        Asset stock take recorded. Checked {aResult?.total} assets, {aResult?.found} found, {aResult?.notFound} not found.
        {aResult?.notFound > 0 && ' Not found assets are logged in their history for follow up.'}
      </div>
      <div className="form-actions">
        <button onClick={resetAsset}>New stock take</button>
      </div>
    </div>
  )
}