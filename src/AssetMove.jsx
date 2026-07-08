// src/AssetMove.jsx
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

const CONDITIONS = ['new', 'good', 'fair', 'poor', 'out_of_service']

export default function AssetMove() {
  const [mode, setMode] = useState('assign')
  const [assets, setAssets] = useState([])
  const [projects, setProjects] = useState([])
  const [people, setPeople] = useState([])

  const [projectId, setProjectId] = useState('')
  const [holderId, setHolderId] = useState('')
  const [lines, setLines] = useState([])
  const [lineAsset, setLineAsset] = useState('')

  const [returnSite, setReturnSite] = useState('')
  const [ticked, setTicked] = useState({})
  const [returnAddAsset, setReturnAddAsset] = useState('')

  // Condition tracking for return
  const [conditions, setConditions] = useState({})        // asset id -> chosen condition
  const [originalConditions, setOriginalConditions] = useState({}) // asset id -> condition before return
  const [comments, setComments] = useState({})             // asset id -> comment (max 25 chars)

  // Condition report after commit
  const [report, setReport] = useState(null)              // [{code, type, project, oldCondition, newCondition, changed}]

  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function loadAssets() {
    const { data } = await supabase
      .from('assets')
      .select('id, asset_code, status, condition, project_id, product_id, products(name), projects(code, name)')
      .not('asset_code', 'is', null)
      .in('status', ['in_store', 'on_site'])
      .order('asset_code')
    setAssets(data || [])
  }

  useEffect(() => {
    async function loadRef() {
      const [{ data: projs }, { data: ppl }] = await Promise.all([
        supabase.from('projects').select('id, code, name').eq('is_active', true).order('code'),
        supabase.from('people').select('id, name, can_hold_assets, is_active').order('name'),
      ])
      setProjects(projs || [])
      setPeople(ppl || [])
      await loadAssets()
    }
    loadRef()
  }, [])

  function switchMode(next) {
    setMode(next)
    setLines([]); setProjectId(''); setHolderId(''); setLineAsset('')
    setReturnSite(''); setTicked({}); setReturnAddAsset('')
    setConditions({}); setOriginalConditions({}); setReport(null); setComments({})
    setError(null); setResult(null)
  }

  // ---------- ASSIGN ----------
  const stagedIds = lines.map((l) => l.asset_id)
  const assignEligible = assets.filter((a) => a.status === 'in_store' && !stagedIds.includes(a.id))

  function addAssignLine() {
    setError(null); setResult(null)
    if (!lineAsset) { setError('Choose an asset to add.'); return }
    const a = assets.find((x) => String(x.id) === String(lineAsset))
    if (!a) return
    setLines([...lines, { key: crypto.randomUUID(), asset_id: a.id, code: a.asset_code, type: a.products?.name || '' }])
    setLineAsset('')
  }
  function removeAssignLine(key) { setResult(null); setLines(lines.filter((l) => l.key !== key)) }

  // ---------- RETURN ----------
  const onSite = assets.filter((a) => a.status === 'on_site')
  const returnList = returnSite
    ? onSite.filter((a) => String(a.project_id) === String(returnSite))
    : onSite
  const tickedIds = Object.keys(ticked).filter((id) => ticked[id]).map(Number)

  function toggleTick(id) {
    setResult(null); setReport(null)
    const nowTicked = !ticked[id]
    setTicked({ ...ticked, [id]: nowTicked })
    if (nowTicked) {
      // When ticking, set default condition to the asset's current condition.
      const asset = assets.find((a) => a.id === id)
      if (asset) {
        setConditions((prev) => ({ ...prev, [id]: asset.condition || 'good' }))
        setOriginalConditions((prev) => ({ ...prev, [id]: asset.condition || 'good' }))
      }
    }
  }

  function setCondition(assetId, value) {
    setConditions({ ...conditions, [assetId]: value })
  }

  function clearAll() {
    setLines([]); setProjectId(''); setHolderId(''); setLineAsset('')
    setReturnSite(''); setTicked({}); setReturnAddAsset('')
    setConditions({}); setOriginalConditions({}); setReport(null); setComments({})
    setError(null); setResult(null)
  }

  async function commitAssign() {
    setError(null); setResult(null)
    if (!projectId) { setError('Choose the site these are going to.'); return }
    if (lines.length === 0) { setError('Add at least one asset.'); return }
    setStatus('saving')
    const { error } = await supabase.rpc('record_asset_move', {
      p_move_type: 'assign',
      p_project_id: Number(projectId),
      p_location_id: null,
      p_holder_id: holderId ? Number(holderId) : null,
      p_asset_ids: lines.map((l) => l.asset_id),
    })
    setStatus(null)
    if (error) setError(error.message)
    else { setResult(`Assigned ${lines.length} asset${lines.length === 1 ? '' : 's'}.`); clearAll(); await loadAssets() }
  }

  async function commitReturn() {
    setError(null); setResult(null); setReport(null)
    if (tickedIds.length === 0) { setError('Tick at least one asset to return.'); return }
    setStatus('saving')

    // Build the report data BEFORE the move, while we still know which project each came from.
    const reportData = tickedIds.map((id) => {
      const a = assets.find((x) => x.id === id)
      const oldCond = originalConditions[id] || a?.condition || '—'
      const newCond = conditions[id] || oldCond
      const comment = (comments[id] || '').trim()
      return {
        code: a?.asset_code || '—',
        type: a?.products?.name || '—',
        project: a?.projects ? `${a.projects.code} — ${a.projects.name}` : '—',
        oldCondition: oldCond,
        newCondition: newCond,
        changed: oldCond !== newCond,
        comment,
      }
    })

    // 1. Do the return move (returns to home bays).
    const { error: moveErr } = await supabase.rpc('record_asset_move', {
      p_move_type: 'return',
      p_project_id: null,
      p_location_id: null,
      p_holder_id: null,
      p_asset_ids: tickedIds,
    })
    if (moveErr) { setStatus(null); setError(moveErr.message); return }

    // 2. For any assets whose condition changed, update the condition and log it.
    const changed = reportData.filter((r) => r.changed)
    for (const r of changed) {
      const a = assets.find((x) => x.asset_code === r.code)
      if (!a) continue
      await supabase.from('assets').update({ condition: r.newCondition }).eq('id', a.id)
      await supabase.from('asset_events').insert({
        asset_id: a.id,
        event_type: 'condition_change',
        condition: r.newCondition,
        status: 'in_store',
        note: `Condition changed on return: ${r.oldCondition} → ${r.newCondition}${r.comment ? ' — ' + r.comment : ''}`,
      })
    }

    setStatus(null)
    setResult(`Returned ${tickedIds.length} asset${tickedIds.length === 1 ? '' : 's'} to their home bays.${changed.length > 0 ? ` ${changed.length} condition${changed.length === 1 ? '' : 's'} updated.` : ''}`)
    setReport(reportData)
    setTicked({}); setConditions({}); setOriginalConditions({}); setComments({})
    await loadAssets()
  }

  function exportReport() {
    if (!report) return
    const rows = report.map((r) => ({
      Code: r.code,
      Type: r.type,
      'Returned from': r.project,
      'Condition before': r.oldCondition,
      'Condition after': r.newCondition,
      Changed: r.changed ? 'Yes' : '',
      Note: r.comment || '',
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Condition Report')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `condition-report-${today}.xlsx`)
  }

  return (
    <div className="pick-screen">
      <div className="pick-header">
        <div className="mode-toggle">
          <button className={mode === 'assign' ? 'mode-btn active-issue' : 'mode-btn'} onClick={() => switchMode('assign')}>Assign to site</button>
          <button className={mode === 'return' ? 'mode-btn active-return' : 'mode-btn'} onClick={() => switchMode('return')}>Return to warehouse</button>
        </div>
        <div className={mode === 'assign' ? 'mode-banner banner-issue' : 'mode-banner banner-return'}>
          {mode === 'assign' ? 'Assigning assets OUT to a site' : 'Returning assets IN to their home bays'}
        </div>
      </div>

      {/* ===================== ASSIGN ===================== */}
      {mode === 'assign' && (
        <>
          <div className="pick-header">
            <div className="form-field">
              <label>Site (going to)</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— choose a site —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
              <div className="form-field">
              <label>Holder (optional)</label>
              <select value={holderId} onChange={(e) => setHolderId(e.target.value)}>
                <option value="">— no holder —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {holderId && people.find((p) => String(p.id) === String(holderId) && (!p.can_hold_assets || !p.is_active)) && (
                <div className="form-warning">
                  {(() => {
                    const person = people.find((p) => String(p.id) === String(holderId))
                    if (person && !person.is_active) return 'This person is marked inactive (left the business). You can still assign it, but check it\'s right.'
                    return 'This person isn\'t set up to hold assets. You can still assign it, but check it\'s the right person.'
                  })()}
                </div>
              )}
            </div>
          </div>

          <div className="add-line">
            <div className="form-field grow">
              <label>Asset in store</label>
              <select value={lineAsset} onChange={(e) => setLineAsset(e.target.value)}>
                <option value="">— choose an asset —</option>
                {assignEligible.map((a) => <option key={a.id} value={a.id}>{a.asset_code} — {a.products?.name || ''}</option>)}
              </select>
            </div>
            <button className="add-btn" onClick={addAssignLine}>Add</button>
          </div>

          {error && <div className="form-error">{error}</div>}
          {result && <div className="form-success">{result}</div>}

          {lines.length === 0 ? (
            <p className="pick-empty">No assets added yet. Pick the site, then add the assets going to it.</p>
          ) : (
            <>
              <table className="data-table">
                <thead><tr><th>Code</th><th>Type</th><th></th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key}>
                      <td>{l.code}</td><td>{l.type}</td>
                      <td className="line-actions"><button className="btn-link danger" onClick={() => removeAssignLine(l.key)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pick-summary">
                <span>{lines.length} asset{lines.length === 1 ? '' : 's'}</span>
                <div className="pick-commit-actions">
                  <button className="btn-secondary" onClick={clearAll} disabled={status === 'saving'}>Clear</button>
                  <button onClick={commitAssign} disabled={status === 'saving'}>{status === 'saving' ? 'Committing…' : 'Commit assignment'}</button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ===================== RETURN ===================== */}
      {mode === 'return' && (
        <>
          <div className="pick-header">
            <div className="form-field">
              <label>Filter by site (optional)</label>
              <select value={returnSite} onChange={(e) => { setReturnSite(e.target.value); setTicked({}); setConditions({}); setOriginalConditions({}); setReport(null); setComments({}) }}>
                <option value="">— all assets on site —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <div className="form-confirm">Ticked assets return to their type's home bay. Confirm or change each asset's condition before committing.</div>
          </div>

          {error && <div className="form-error">{error}</div>}
          {result && <div className="form-success">{result}</div>}

          {/* Condition report (shown after commit) */}
          {report && (
            <div style={{ marginTop: '1rem' }}>
              <h4 className="detail-subhead">Condition report</h4>
              <div className="list-actions">
                <button onClick={exportReport}>Export to Excel</button>
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>Code</th><th>Type</th><th>Returned from</th><th>Before</th><th>After</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {report.map((r, i) => (
                    <tr key={i} className={r.changed ? 'row-critical' : ''}>
                      <td>{r.code}</td>
                      <td>{r.type}</td>
                      <td>{r.project}</td>
                      <td>{r.oldCondition}</td>
                      <td style={r.changed ? { fontWeight: 600, color: '#b71c1c' } : {}}>{r.newCondition}</td>
                      <td>{r.comment || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                <button className="btn-link" onClick={() => setReport(null)}>Close report</button>
              </div>
            </div>
          )}

          {!report && returnList.length === 0 ? (
            <p className="pick-empty">No assets currently out{returnSite ? ' for that site' : ''}.</p>
          ) : !report && (
            <>
              <table className="data-table">
                <thead><tr><th>Return</th><th>Code</th><th>Type</th><th>Currently at</th><th>Condition</th></tr></thead>
                <tbody>
                  {returnList.map((a) => {
                    const isTicked = !!ticked[a.id]
                    return (
                      <tr key={a.id} className={isTicked ? 'row-soon' : ''}>
                        <td><input type="checkbox" checked={isTicked} onChange={() => toggleTick(a.id)} /></td>
                        <td>{a.asset_code}</td>
                        <td>{a.products?.name || '—'}</td>
                        <td>{a.projects ? `${a.projects.code} — ${a.projects.name}` : '—'}</td>
                        <td>
                          {isTicked ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <select value={conditions[a.id] || a.condition || 'good'} onChange={(e) => setCondition(a.id, e.target.value)}>
                                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                              {conditions[a.id] && conditions[a.id] !== (originalConditions[a.id] || a.condition) && (
                                <input
                                  type="text"
                                  maxLength={25}
                                  placeholder="Note (max 25 chars)"
                                  value={comments[a.id] || ''}
                                  onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })}
                                  style={{ fontSize: '0.8rem', width: '100%' }}
                                />
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#888' }}>{a.condition || '—'}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="pick-summary">
                <span>{tickedIds.length} ticked to return</span>
                <div className="pick-commit-actions">
                  <button className="btn-secondary" onClick={clearAll} disabled={status === 'saving'}>Clear</button>
                  <button onClick={commitReturn} disabled={status === 'saving'}>{status === 'saving' ? 'Committing…' : 'Commit return'}</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}