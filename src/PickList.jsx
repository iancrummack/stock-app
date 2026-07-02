// src/PickList.jsx
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

const STATUS_LABEL = {
  open: 'Open',
  part_picked: 'Part-picked (in progress)',
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

  const [pickedQty, setPickedQty] = useState({})     // line_id -> qty picked THIS pass (consumables)
  const [chosenAssets, setChosenAssets] = useState({})
  const [availableAssets, setAvailableAssets] = useState({})
  const [holderId, setHolderId] = useState('')
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)

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
    setPickedQty({}); setChosenAssets({}); setAvailableAssets({}); setNote(pick.note || '')
    setConfirmCancel(false); setConfirmComplete(false)
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

    // For each consumable line, default this pass's input to the OUTSTANDING amount.
    const initialQty = {}
    for (const l of ordered) {
      if (l.products?.tracking_type !== 'asset') {
        const outstanding = Number(l.qty) - Number(l.picked_qty || 0)
        initialQty[l.id] = outstanding > 0 ? outstanding : 0
      }
    }
    setPickedQty(initialQty)

    // For each asset line, load available in-store coded units of that type.
    const assetLines = ordered.filter((l) => l.products?.tracking_type === 'asset')
    const avail = {}
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

  // Build the payload: new TOTAL picked per line = already-picked + this pass.
  function buildPayload() {
    return lines.map((l) => {
      if (l.products?.tracking_type === 'asset') {
        const chosen = chosenAssets[l.id] || {}
        const ids = Object.keys(chosen).filter((k) => chosen[k]).map(Number)
        return { line_id: l.id, product_id: l.product_id, asset_ids: ids }
      }
      const already = Number(l.picked_qty || 0)
      const thisPass = Number(pickedQty[l.id] || 0)
      return { line_id: l.id, product_id: l.product_id, picked_qty: already + thisPass, asset_ids: [] }
    })
  }

  async function run(finalise) {
    setError(null)
    setWorking(true)
    if (holderId) {
      await supabase.from('picks').update({ holder_id: Number(holderId) }).eq('id', openPick.id)
    }
    const { error } = await supabase.rpc('commit_pick', {
      p_pick_id: openPick.id,
      p_lines: buildPayload(),
      p_note: note || null,
      p_finalise: finalise,
    })
    setWorking(false)
    if (error) { setError(error.message); return }
    await loadPicks()
    setOpenPick(null); setLines([])
  }

  async function cancelPick() {
    setError(null); setWorking(true)
    const { error } = await supabase.from('picks').update({ status: 'cancelled' }).eq('id', openPick.id)
    setWorking(false)
    if (error) { setError(error.message); return }
    await loadPicks()
    setOpenPick(null); setLines([])
  }

  // Export the outstanding shortfall lines to Excel (for the buyer / suppliers).
  function exportShortfalls() {
    const shortfalls = lines
      .map((l) => {
        const outstanding = Number(l.qty) - Number(l.picked_qty || 0)
        return { l, outstanding }
      })
      .filter((x) => x.outstanding > 0)
      .map(({ l, outstanding }) => ({
        Code: l.products?.code || '',
        Product: l.products?.name || '',
        Kind: l.products?.tracking_type === 'asset' ? 'asset' : 'consumable',
        Wanted: l.qty,
        Picked: l.picked_qty || 0,
        Outstanding: outstanding,
      }))
    const job = openPick.projects ? `${openPick.projects.code}` : 'pick'
    const worksheet = XLSX.utils.json_to_sheet(shortfalls)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Shortfalls')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `shortfalls-${job}-${today}.xlsx`)
  }

  if (loading) return <p>Loading picks…</p>
  if (error && !openPick) return <p className="error">{error}</p>

  // ---- Working one pick ----
  if (openPick) {
    const workable = openPick.status === 'open' || openPick.status === 'part_picked'
    const anyOutstanding = lines.some((l) => Number(l.qty) - Number(l.picked_qty || 0) > 0)

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
            <div className="list-actions" style={{ marginTop: '1rem' }}>
              <button onClick={exportShortfalls} disabled={!anyOutstanding}>Export shortfalls to Excel</button>
            </div>

            <table className="data-table">
              <thead>
                <tr><th>Code</th><th>Product</th><th>Location</th><th className="num">Wanted</th><th className="num">Already</th><th>{workable ? 'Pick now' : 'Picked'}</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const isAsset = l.products?.tracking_type === 'asset'
                  const already = Number(l.picked_qty || 0)
                  const outstanding = Number(l.qty) - already
                  return (
                    <tr key={l.id} className={outstanding > 0 ? 'row-soon' : ''}>
                      <td>{l.products?.code || '—'}</td>
                      <td>{l.products?.name || '—'}</td>
                      <td>{l.products?.locations ? `${l.products.locations.code} — ${l.products.locations.name}` : '—'}</td>
                      <td className="num">{l.qty}</td>
                      <td className="num">{already}</td>
                      <td>
                        {!workable ? (
                          <span>{already} ({l.line_status})</span>
                        ) : outstanding <= 0 ? (
                          <span style={{ color: '#1b5e20' }}>fulfilled</span>
                        ) : isAsset ? (
                          <div>
                            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.3rem' }}>
                              Need {outstanding} more ({chosenCount(l.id)} ticked):
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
                            type="number" min="0" max={outstanding} className="qty-inline"
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

            {workable && (
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

                {!confirmComplete ? (
                  <div className="pick-commit-actions" style={{ marginTop: '0.75rem' }}>
                    <button className="btn-secondary" onClick={() => run(false)} disabled={working}>
                      {working ? 'Saving…' : 'Save progress'}
                    </button>
                    <button onClick={() => setConfirmComplete(true)} disabled={working}>Complete &amp; dispatch</button>
                    {!confirmCancel && (
                      <button className="btn-secondary" onClick={() => setConfirmCancel(true)} disabled={working}>Cancel job</button>
                    )}
                  </div>
                ) : (
                  <div className="form-warning" style={{ marginTop: '0.75rem' }}>
                    Completing dispatches this job and it can't be amended afterwards.
                    {anyOutstanding ? ' Some lines are still short — they will go as shortfalls.' : ' Everything is picked.'}
                    <div className="pick-commit-actions" style={{ marginTop: '0.5rem' }}>
                      <button onClick={() => run(true)} disabled={working}>{working ? 'Dispatching…' : 'Yes, complete & dispatch'}</button>
                      <button className="btn-secondary" onClick={() => setConfirmComplete(false)} disabled={working}>Back</button>
                    </div>
                  </div>
                )}

                {confirmCancel && !confirmComplete && (
                  <div className="form-warning" style={{ marginTop: '0.75rem' }}>
                    You're cancelling this pick. Its items will return to available stock. Are you sure?
                    <div className="pick-commit-actions" style={{ marginTop: '0.5rem' }}>
                      <button onClick={cancelPick} disabled={working} style={{ background: '#b71c1c' }}>Yes, cancel job</button>
                      <button className="btn-secondary" onClick={() => setConfirmCancel(false)} disabled={working}>No, keep it</button>
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
  const activeStatuses = ['open', 'part_picked']
  const visible = showAll ? picks : picks.filter((p) => activeStatuses.includes(p.status))

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
            {visible.map((p) => {
              const workable = p.status === 'open' || p.status === 'part_picked'
              return (
                <tr key={p.id} className={workable ? 'clickable-row' : ''}>
                  <td>{p.projects ? `${p.projects.code} — ${p.projects.name}` : '—'}</td>
                  <td>{p.collection_date || '—'}</td>
                  <td>{STATUS_LABEL[p.status] || p.status}</td>
                  <td><button className="btn-link" onClick={() => openOne(p)}>{workable ? 'Open Pick' : 'View'}</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}