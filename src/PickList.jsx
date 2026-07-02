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

  const [pickedQty, setPickedQty] = useState({})
  const [chosenAssets, setChosenAssets] = useState({})
  const [availableAssets, setAvailableAssets] = useState({})
  const [holderId, setHolderId] = useState('')
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)

  // Bespoke line adder
  const [bespokeDesc, setBespokeDesc] = useState('')
  const [bespokeQty, setBespokeQty] = useState('1')
  const [bespokePo, setBespokePo] = useState('')
  const [bespokeMethod, setBespokeMethod] = useState('delivered')
  const [bespokeSupplier, setBespokeSupplier] = useState('')
  const [bespokeLocation, setBespokeLocation] = useState('')
  const [addingBespoke, setAddingBespoke] = useState(false)

  // Editing an existing bespoke line's details
  const [editLineId, setEditLineId] = useState(null)
  const [editPo, setEditPo] = useState('')
  const [editMethod, setEditMethod] = useState('delivered')
  const [editSupplier, setEditSupplier] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

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

  async function loadLines(pickId) {
    const { data } = await supabase
      .from('pick_lines')
      .select('id, qty, picked_qty, line_status, product_id, is_bespoke, description, po_number, delivery_method, supplier_name, supplier_location, products(code, name, tracking_type, default_location_id, locations(code, name))')
      .eq('pick_id', pickId)

    const standard = (data || []).filter((l) => !l.is_bespoke).sort((a, b) => {
      const la = a.products?.default_location_id ?? Number.MAX_SAFE_INTEGER
      const lb = b.products?.default_location_id ?? Number.MAX_SAFE_INTEGER
      return la - lb
    })
    const bespoke = (data || []).filter((l) => l.is_bespoke).sort((a, b) => a.id - b.id)
    return [...standard, ...bespoke]
  }

  async function openOne(pick) {
    setOpenPick(pick)
    setLinesLoading(true)
    setPickedQty({}); setChosenAssets({}); setAvailableAssets({}); setNote(pick.note || '')
    setConfirmCancel(false); setConfirmComplete(false)
    setBespokeDesc(''); setBespokeQty('1'); setBespokePo(''); setBespokeMethod('delivered'); setBespokeSupplier(''); setBespokeLocation('')
    setEditLineId(null)
    setHolderId(pick.holder_id ? String(pick.holder_id) : '')

    const ordered = await loadLines(pick.id)
    setLines(ordered)

    const initialQty = {}
    for (const l of ordered) {
      if (l.is_bespoke || l.products?.tracking_type !== 'asset') {
        const outstanding = Number(l.qty) - Number(l.picked_qty || 0)
        initialQty[l.id] = outstanding > 0 ? outstanding : 0
      }
    }
    setPickedQty(initialQty)

    const assetLines = ordered.filter((l) => !l.is_bespoke && l.products?.tracking_type === 'asset')
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

  async function addBespokeLine() {
    setError(null)
    if (!bespokeDesc.trim()) { setError('Enter a description for the bespoke item.'); return }
    const q = Number(bespokeQty)
    if (!q || q <= 0) { setError('Enter a valid quantity.'); return }
    setAddingBespoke(true)
    const { error } = await supabase.from('pick_lines').insert({
      pick_id: openPick.id, product_id: null, is_bespoke: true,
      description: bespokeDesc.trim(), qty: q, picked_qty: 0, line_status: 'open',
      po_number: bespokePo.trim() || null,
      delivery_method: bespokeMethod,
      supplier_name: bespokeMethod === 'collect_local' ? (bespokeSupplier.trim() || null) : null,
      supplier_location: bespokeMethod === 'collect_local' ? (bespokeLocation.trim() || null) : null,
    })
    setAddingBespoke(false)
    if (error) { setError(error.message); return }
    setBespokeDesc(''); setBespokeQty('1'); setBespokePo(''); setBespokeMethod('delivered'); setBespokeSupplier(''); setBespokeLocation('')
    const ordered = await loadLines(openPick.id)
    setLines(ordered)
    setPickedQty((prev) => {
      const next = { ...prev }
      for (const l of ordered) {
        if (next[l.id] == null && (l.is_bespoke || l.products?.tracking_type !== 'asset')) {
          const outstanding = Number(l.qty) - Number(l.picked_qty || 0)
          next[l.id] = outstanding > 0 ? outstanding : 0
        }
      }
      return next
    })
  }

  async function removeBespokeLine(lineId) {
    setError(null)
    const { error } = await supabase.from('pick_lines').delete().eq('id', lineId)
    if (error) { setError(error.message); return }
    const ordered = await loadLines(openPick.id)
    setLines(ordered)
  }

  function startEditDetails(l) {
    setEditLineId(l.id)
    setEditPo(l.po_number || '')
    setEditMethod(l.delivery_method || 'delivered')
    setEditSupplier(l.supplier_name || '')
    setEditLocation(l.supplier_location || '')
    setError(null)
  }

  async function saveEditDetails() {
    setSavingEdit(true); setError(null)
    const { error } = await supabase.from('pick_lines').update({
      po_number: editPo.trim() || null,
      delivery_method: editMethod,
      supplier_name: editMethod === 'collect_local' ? (editSupplier.trim() || null) : null,
      supplier_location: editMethod === 'collect_local' ? (editLocation.trim() || null) : null,
    }).eq('id', editLineId)
    setSavingEdit(false)
    if (error) { setError(error.message); return }
    setEditLineId(null)
    const ordered = await loadLines(openPick.id)
    setLines(ordered)
  }

  function buildPayload() {
    return lines.map((l) => {
      if (!l.is_bespoke && l.products?.tracking_type === 'asset') {
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

  function exportShortfalls() {
    const shortfalls = lines
      .map((l) => ({ l, outstanding: Number(l.qty) - Number(l.picked_qty || 0) }))
      .filter((x) => x.outstanding > 0)
      .map(({ l, outstanding }) => ({
        Code: l.is_bespoke ? '(bespoke)' : (l.products?.code || ''),
        Product: l.is_bespoke ? l.description : (l.products?.name || ''),
        Kind: l.is_bespoke ? 'bespoke' : (l.products?.tracking_type === 'asset' ? 'asset' : 'consumable'),
        PO: l.is_bespoke ? (l.po_number || '') : '',
        Supply: l.is_bespoke ? (l.delivery_method === 'collect_local' ? `Collect: ${l.supplier_name || ''} ${l.supplier_location || ''}`.trim() : 'Delivered') : '',
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

  if (openPick) {
    const workable = openPick.status === 'open' || openPick.status === 'part_picked'
    const anyOutstanding = lines.some((l) => Number(l.qty) - Number(l.picked_qty || 0) > 0)
    const standardLines = lines.filter((l) => !l.is_bespoke)
    const bespokeLines = lines.filter((l) => l.is_bespoke)

    const pickCell = (l) => {
      const isAsset = !l.is_bespoke && l.products?.tracking_type === 'asset'
      const already = Number(l.picked_qty || 0)
      const outstanding = Number(l.qty) - already
      if (!workable) return <span>{already} ({l.line_status})</span>
      if (outstanding <= 0) return <span style={{ color: '#1b5e20' }}>fulfilled</span>
      if (isAsset) {
        return (
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
        )
      }
      return (
        <input
          type="number" min="0" max={outstanding} className="qty-inline"
          value={pickedQty[l.id] ?? ''}
          onChange={(e) => setPickedQty({ ...pickedQty, [l.id]: e.target.value })}
        />
      )
    }

    const supplyLabel = (l) => {
      if (l.delivery_method === 'collect_local') {
        const parts = [l.supplier_name, l.supplier_location].filter(Boolean).join(', ')
        return `Collect${parts ? ': ' + parts : ' locally'}`
      }
      if (l.delivery_method === 'delivered') return 'Delivered'
      return '—'
    }

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

            <h4 className="detail-subhead">Master list items ({standardLines.length})</h4>
            <table className="data-table">
              <thead>
                <tr><th>Code</th><th>Product</th><th>Location</th><th className="num">Wanted</th><th className="num">Already</th><th>{workable ? 'Pick now' : 'Picked'}</th></tr>
              </thead>
              <tbody>
                {standardLines.map((l) => {
                  const already = Number(l.picked_qty || 0)
                  const outstanding = Number(l.qty) - already
                  return (
                    <tr key={l.id} className={outstanding > 0 ? 'row-soon' : ''}>
                      <td>{l.products?.code || '—'}</td>
                      <td>{l.products?.name || '—'}</td>
                      <td>{l.products?.locations ? `${l.products.locations.code} — ${l.products.locations.name}` : '—'}</td>
                      <td className="num">{l.qty}</td>
                      <td className="num">{already}</td>
                      <td>{pickCell(l)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div style={{ marginTop: '1.5rem' }}>
              <h4 className="detail-subhead">Bespoke items ({bespokeLines.length})</h4>
              {bespokeLines.length === 0 ? (
                <p className="detail-empty">No bespoke items on this pick.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>Description</th><th>PO</th><th>Supply</th><th className="num">Wanted</th><th className="num">Already</th><th>{workable ? 'Pick now' : 'Picked'}</th>{workable && <th></th>}</tr>
                  </thead>
                  <tbody>
                    {bespokeLines.map((l) => {
                      const already = Number(l.picked_qty || 0)
                      const outstanding = Number(l.qty) - already
                      const isEditing = editLineId === l.id
                      return (
                        <>
                          <tr key={l.id} className={outstanding > 0 ? 'row-soon' : ''}>
                            <td>{l.description}</td>
                            <td>{l.po_number || '—'}</td>
                            <td>{supplyLabel(l)}</td>
                            <td className="num">{l.qty}</td>
                            <td className="num">{already}</td>
                            <td>{pickCell(l)}</td>
                            {workable && (
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn-link" onClick={() => isEditing ? setEditLineId(null) : startEditDetails(l)}>{isEditing ? 'Close' : 'Edit details'}</button>
                                {' · '}
                                <button className="btn-link danger" onClick={() => removeBespokeLine(l.id)}>Remove</button>
                              </td>
                            )}
                          </tr>
                          {isEditing && workable && (
                            <tr>
                              <td colSpan="7">
                                <div className="detail-edit" style={{ margin: '0.25rem 0' }}>
                                  <div className="form-field">
                                    <label>PO number (optional)</label>
                                    <input type="text" value={editPo} onChange={(e) => setEditPo(e.target.value)} placeholder="if known" />
                                  </div>
                                  <div className="form-field">
                                    <label>Supply</label>
                                    <select value={editMethod} onChange={(e) => setEditMethod(e.target.value)}>
                                      <option value="delivered">Delivered in</option>
                                      <option value="collect_local">Collect locally</option>
                                    </select>
                                  </div>
                                  {editMethod === 'collect_local' && (
                                    <>
                                      <div className="form-field">
                                        <label>Supplier</label>
                                        <input type="text" value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} placeholder="e.g. Travis Perkins" />
                                      </div>
                                      <div className="form-field">
                                        <label>Location</label>
                                        <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="e.g. Corby" />
                                      </div>
                                    </>
                                  )}
                                  <div className="detail-edit-actions">
                                    <button onClick={saveEditDetails} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save details'}</button>
                                    <button className="btn-secondary" onClick={() => setEditLineId(null)} disabled={savingEdit}>Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {workable && (
                <div className="form-card" style={{ marginTop: '0.75rem', maxWidth: 640 }}>
                  <h4 className="form-title" style={{ margin: 0 }}>Add a bespoke item</h4>
                  <div className="form-field">
                    <label>Description</label>
                    <input type="text" value={bespokeDesc} onChange={(e) => setBespokeDesc(e.target.value)} placeholder="e.g. Bespoke signage panel, client logo" />
                  </div>
                  <div className="form-field">
                    <label>Quantity</label>
                    <input type="number" min="1" value={bespokeQty} onChange={(e) => setBespokeQty(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label>PO number (optional)</label>
                    <input type="text" value={bespokePo} onChange={(e) => setBespokePo(e.target.value)} placeholder="if known" />
                  </div>
                  <div className="form-field">
                    <label>Supply</label>
                    <select value={bespokeMethod} onChange={(e) => setBespokeMethod(e.target.value)}>
                      <option value="delivered">Delivered in</option>
                      <option value="collect_local">Collect locally</option>
                    </select>
                  </div>
                  {bespokeMethod === 'collect_local' && (
                    <>
                      <div className="form-field">
                        <label>Supplier</label>
                        <input type="text" value={bespokeSupplier} onChange={(e) => setBespokeSupplier(e.target.value)} placeholder="e.g. Travis Perkins" />
                      </div>
                      <div className="form-field">
                        <label>Location</label>
                        <input type="text" value={bespokeLocation} onChange={(e) => setBespokeLocation(e.target.value)} placeholder="e.g. Corby" />
                      </div>
                    </>
                  )}
                  <div className="form-actions">
                    <button onClick={addBespokeLine} disabled={addingBespoke}>{addingBespoke ? 'Adding…' : 'Add bespoke item'}</button>
                  </div>
                </div>
              )}
            </div>

            {workable && (
              <div style={{ marginTop: '1.5rem', maxWidth: 640 }}>
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
                  <td><button className="btn-link" onClick={() => openOne(p)}>{workable ? 'Open pick' : 'View'}</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}