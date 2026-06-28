// src/AssetMove.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function AssetMove() {
  const [mode, setMode] = useState('assign')   // 'assign' | 'return'
  const [assets, setAssets] = useState([])
  const [projects, setProjects] = useState([])
  const [people, setPeople] = useState([])

  // assign header
  const [projectId, setProjectId] = useState('')
  const [holderId, setHolderId] = useState('')
  // assign staged lines
  const [lines, setLines] = useState([])
  const [lineAsset, setLineAsset] = useState('')

  // return: optional site filter + ticked set
  const [returnSite, setReturnSite] = useState('')        // '' = no site filter
  const [ticked, setTicked] = useState({})                // asset id -> true
  const [returnAddAsset, setReturnAddAsset] = useState('') // for unfiltered add

  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function loadAssets() {
    const { data } = await supabase
      .from('assets')
      .select('id, asset_code, status, project_id, product_id, products(name), projects(code, name)')
      .not('asset_code', 'is', null)
      .in('status', ['in_store', 'on_site'])
      .order('asset_code')
    setAssets(data || [])
  }

  useEffect(() => {
    async function loadRef() {
      const [{ data: projs }, { data: ppl }] = await Promise.all([
        supabase.from('projects').select('id, code, name').eq('is_active', true).order('code'),
        supabase.from('people').select('id, name').order('name'),
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
  // On-site assets, optionally filtered to the chosen site.
  const onSite = assets.filter((a) => a.status === 'on_site')
  const returnList = returnSite
    ? onSite.filter((a) => String(a.project_id) === String(returnSite))
    : onSite
  const tickedIds = Object.keys(ticked).filter((id) => ticked[id]).map(Number)

  function toggleTick(id) {
    setResult(null)
    setTicked({ ...ticked, [id]: !ticked[id] })
  }

  function clearAll() {
    setLines([]); setProjectId(''); setHolderId(''); setLineAsset('')
    setReturnSite(''); setTicked({}); setReturnAddAsset('')
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
    setError(null); setResult(null)
    if (tickedIds.length === 0) { setError('Tick at least one asset to return.'); return }
    setStatus('saving')
    const { error } = await supabase.rpc('record_asset_move', {
      p_move_type: 'return',
      p_project_id: null,
      p_location_id: null,
      p_holder_id: null,
      p_asset_ids: tickedIds,
    })
    setStatus(null)
    if (error) setError(error.message)
    else { setResult(`Returned ${tickedIds.length} asset${tickedIds.length === 1 ? '' : 's'} to their home bays.`); clearAll(); await loadAssets() }
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
              <select value={returnSite} onChange={(e) => { setReturnSite(e.target.value); setTicked({}) }}>
                <option value="">— all assets on site —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <div className="form-confirm">Ticked assets return to their type's home bay automatically.</div>
          </div>

          {error && <div className="form-error">{error}</div>}
          {result && <div className="form-success">{result}</div>}

          {returnList.length === 0 ? (
            <p className="pick-empty">No assets currently out{returnSite ? ' for that site' : ''}.</p>
          ) : (
            <>
              <table className="data-table">
                <thead><tr><th>Return</th><th>Code</th><th>Type</th><th>Currently at</th></tr></thead>
                <tbody>
                  {returnList.map((a) => (
                    <tr key={a.id} className={ticked[a.id] ? 'row-soon' : ''}>
                      <td><input type="checkbox" checked={!!ticked[a.id]} onChange={() => toggleTick(a.id)} /></td>
                      <td>{a.asset_code}</td>
                      <td>{a.products?.name || '—'}</td>
                      <td>{a.projects ? `${a.projects.code} — ${a.projects.name}` : '—'}</td>
                    </tr>
                  ))}
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