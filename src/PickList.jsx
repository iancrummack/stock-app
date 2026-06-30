// src/PickList.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const STATUS_LABEL = {
  open: 'Open',
  completed: 'Completed',
  completed_with_errors: 'Completed with issues',
  cancelled: 'Cancelled',
}

export default function PickList() {
  const [picks, setPicks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const [people, setPeople] = useState([])

  const [openPick, setOpenPick] = useState(null)
  const [lines, setLines] = useState([])
  const [linesLoading, setLinesLoading] = useState(false)

  const [pickedQty, setPickedQty] = useState({})
  const [chosenAssets, setChosenAssets] = useState({})
  const [availableAssets, setAvailableAssets] = useState({})
  const [holderId, setHolderId] = useState('')
  const [note, setNote] = useState('')
  const [committing, setCommitting] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  async function loadPicks() {
    setLoading(true); setError(null)
    const { data, error } = await supabase
      .from('picks')
      .select('id, collection_date, status, note, holder_id, project_id, projects(code, name)')
      .order('collection_date', { ascending: true })
    if (error) setError(error.message)
    else setPicks(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadPicks()
    supabase.from('people').select('id, name, can_hold_assets, is_active').eq('is_active', true).order('name')
      .then(({ data }) => setPeople(data || []))
  }, [])

  async function openOne(pick) {
    setOpenPick(pick)
    setLinesLoading(true)
    setPickedQty({}); setChosenAssets({}); setAvailableAssets({}); setNote(''); setConfirmCancel(false)
    setHolderId(pick.holder_id ? String(pick.holder_id) : '')

    const { data } = await supabase
      .from('pick_lines')
      .select('id, qty, picked_qty, line_status, product_id, products(code, name, tracking_type, default_location_id, locations(code, name))')
      .eq('pick_id', pick.id)

    const ordered = (data || []).slice().sort((a, b) => {
      const la = a.products?.default_location_id ?? Number.MAX_SAFE_INTEGER
      const lb = b.products?.default_location_id ?? Number.MAX_SAFE_INTEGER
      return la - lb
    })
    setLines(ordered)

    const assetLines = ordered.filter((l) => l.products?.tracking_type === 'asset')
    const avail = {}
    const initialQty = {}
    for (const l of ordered) {
      if (l.products?.tracking_type !== 'asset') initialQty[l.id] = l.qty
    }
    for (const l of assetLines) {
      const { data: units } = await supabase
        .from('assets')
        .select('id, asset_code, condition, locations(code, name)')
        .eq('product_id', l.product_id)
        .eq('status', 'in_store')
        .not('asset_code', 'is', null)
        .order('asset_code')
      avail[l.id] = units || []
    }
    setAvailableAssets(avail)
    setPickedQty(initialQty)
    setLinesLoading(false)
  }

  function back() { setOpenPick(null); setLines([]) }

  function toggleAsset(lineId, assetId) {
    const cur = chosenAssets[lineId] || {}
    setChosenAssets({ ...chosenAssets, [lineId]: { ...cur, [assetId]: !cur[assetId] } })
  }

  function chosenCount(lineId) {
    const c = chosenAssets[lineId] || {}
    return Object.values(c).filter(Boolean).length
  }

  async function commit() {
    setError(null)
    const payload = lines.map((l) => {
      if (l.products?.tracking_type === 'asset') {
        const chosen = chosenAssets[l.id] || {}
        const ids = Object.keys(chosen).filter((k) => chosen[k]).map(Number)
        return { line_id: l.id, product_id: l.product_id, picked_qty: ids.length, asset_ids: ids }
      }
      return { line_id: l.id, product_id: l.product_id, picked_qty: Number(pickedQty[l.id] || 0), asset_ids: [] }
    })

    setCommitting(true)
    // Save the chosen holder onto the pick so the commit assigns assets to them.
    if (holderId) {
      await supabase.from('picks').update({ holder_id: Number(holderId) }).eq('id', openPick.id)
    }
    const { error } = await supabase.rpc('commit_pick', {
      p_pick_id: openPick.id,
      p_lines: payload,
      p_note: note || null,
    })
    setCommitting(false)
    if (error) { setError(error.message); return }
    await loadPicks()
    setOpenPick(null); setLines([])
  }

  async function cancelPick() {
    setError(null)
    setCommitting(true)
    const { error } = await supabase.from('picks').update({ status: 'cancelled' }).eq('id', openPick.id)
    setCommitting(false)
    if (error) { setError(error.message); return }
    await loadPicks()
    setOpenPick(null); setLines([])
  }

  if (loading) return <p>Loading picks…</p>
  if (error && !openPick) return <p className="error">{error}</p>

  // ---- Working one pick ----
  if (openPick) {
    const isOpen = openPick.status === 'open'
    return (
      <div>
        <button className="btn-link" onClick={back}>← Back to picks</button>
        <div className="pick-header" style={{ marginTop: '0.75rem' }}>
          <h3 className="form-title" style={{ margin: 0 }}>
            {openPick.projects ? `${openPick.projects.code} — ${openPick.projects.name}` : 'Pick'}
          </h3>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            Collection: {openPick.collection_date || '—'} · Status: {STATUS_LABEL[openPick.status] || openPick.status}
          </div>
        </div>

        {error && <div className="form-error" style={{ marginTop: '0.75rem' }}>{error}</div>}

        {linesLoading ? <p>Loading lines…</p> : (
          <>
            <table className="data-table" style={{ marginTop: '1rem' }}>
              <thead>
                <tr><th>Code</th><th>Product</th><th>Location</th><th className="num">Wanted</th><th>Pick</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const isAsset = l.products?.tracking_type === 'asset'
                  return (
                    <tr key={l.id}>
                      <td>{l.products?.code || '—'}</td>
                      <td>{l.products?.name || '—'}</td>
                      <td>{l.products?.locations ? `${l.products.locations.code} — ${l.products.locations.name}` : '—'}</td>
                      <td className="num">{l.qty}</td>
                      <td>
                        {!isOpen ? (
                          <span>{l.picked_qty} ({l.line_status})</span>
                        ) : isAsset ? (
                          <div>
                            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.3rem' }}>
                              Tick {l.qty} unit{l.qty === 1 ? '' : 's'} ({chosenCount(l.id)} chosen):
                            </div>
                            {(availableAssets[l.id] || []).length === 0 ? (
                              <span className="line-flag">None available in store</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', maxHeight: 160, overflowY: 'auto' }}>
                                {(availableAssets[l.id] || []).map((u) => (
                                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                    <input type="checkbox" checked={!!(chosenAssets[l.id]?.[u.id])} onChange={() => toggleAsset(l.id, u.id)} />
                                    {u.asset_code} <span style={{ color: '#999' }}>({u.condition})</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <input
                            type="number" min="0" className="qty-inline"
                            value={pickedQty[l.id] ?? ''}
                            onChange={(e) => setPickedQty({ ...pickedQty, [l.id]: e.target.value })}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {isOpen && (
              <div style={{ marginTop: '1rem', maxWidth: 640 }}>
                <div className="form-field">
                  <label>Holder (site manager) — assigned to all assets on this job</label>
                  <select value={holderId} onChange={(e) => setHolderId(e.target.value)}>
                    <option value="">— choose holder —</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {holderId && people.find((p) => String(p.id) === String(holderId) && !p.can_hold_assets) && (
                    <div className="form-warning">This person isn't set up to hold assets. You can still assign, but check it's right.</div>
                  )}
                </div>

                <div className="form-field">
                  <label>Note (any issues, shortfalls, comments)</label>
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
                </div>

                <div className="pick-commit-actions" style={{ marginTop: '0.75rem' }}>
                  <button onClick={commit} disabled={committing}>{committing ? 'Committing…' : 'Commit pick'}</button>
                  {!confirmCancel && (
                    <button className="btn-secondary" onClick={() => setConfirmCancel(true)} disabled={committing}>Cancel job</button>
                  )}
                </div>

                {confirmCancel && (
                  <div className="form-warning" style={{ marginTop: '0.75rem' }}>
                    You're cancelling this pick. Its items will return to available stock. Are you sure?
                    <div className="pick-commit-actions" style={{ marginTop: '0.5rem' }}>
                      <button onClick={cancelPick} disabled={committing} style={{ background: '#b71c1c' }}>Yes, cancel job</button>
                      <button className="btn-secondary" onClick={() => setConfirmCancel(false)} disabled={committing}>No, keep it</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ---- List of picks ----
  const visible = showAll ? picks : picks.filter((p) => p.status === 'open')

  return (
    <div>
      <label className="filter-toggle" style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show completed and cancelled too
      </label>

      {visible.length === 0 ? (
        <p>No picks to show.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Job</th><th>Collection</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={p.status === 'open' ? 'clickable-row' : ''}>
                <td>{p.projects ? `${p.projects.code} — ${p.projects.name}` : '—'}</td>
                <td>{p.collection_date || '—'}</td>
                <td>{STATUS_LABEL[p.status] || p.status}</td>
                <td><button className="btn-link" onClick={() => openOne(p)}>{p.status === 'open' ? 'Pick this' : 'View'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}