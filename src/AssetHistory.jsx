// src/AssetHistory.jsx
import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import AssetDetail from './AssetDetail'

export default function AssetHistory() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)

  const [fAssetSearch, setFAssetSearch] = useState('')
  const [fType, setFType] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [fWhere, setFWhere] = useState('')

  async function load(isRefresh) {
    if (!isRefresh) setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('asset_events')
      .select(`
        id, asset_id, event_type, status, condition, created_at, note,
        location_id, project_id, holder_id,
        assets(asset_code, products(name)),
        locations(code, name),
        projects(code, name),
        people(name)
      `)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) setError(error.message)
    else setRows(data || [])
    if (!isRefresh) setLoading(false)
  }

  useEffect(() => { load() }, [])

  // A short, readable sentence for each event. Asset code is left out since it's
  // already its own column, e.g. "moved to site RE0537".
  function sentence(r) {
    const holderBit = r.holder_id ? `, held by ${r.people?.name || 'someone'}` : ''
    switch (r.event_type) {
      case 'moved': {
        if (r.project_id) return `moved to site ${r.projects?.code || '—'}${holderBit}`
        if (r.location_id) return `returned to store ${r.locations?.code || '—'}${holderBit}`
        return `moved${holderBit}`
      }
      case 'condition_change':
        return `condition change to ${r.condition || 'unknown'}`
      case 'repair':
        return `sent for repair`
      case 'written_off':
        return `written off`
      case 'recode':
        return `code changed`
      default:
        return (r.event_type || 'event').replace(/_/g, ' ')
    }
  }

  // Just the code, no Site:/Store: prefix, since the Where column stands on its own now.
  function whereText(r) {
    if (r.project_id) return r.projects?.code || '—'
    if (r.location_id) return r.locations?.code || '—'
    return '—'
  }

  const types = useMemo(() => [...new Set(rows.map((r) => r.event_type).filter(Boolean))].sort(), [rows])

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (fAssetSearch) {
        const q = fAssetSearch.trim().toLowerCase()
        const hay = `${r.assets?.asset_code || ''} ${r.assets?.products?.name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (fType && r.event_type !== fType) return false
      if (fFrom && r.created_at < fFrom) return false
      // fTo is inclusive of the whole day, so compare against the next day.
      if (fTo && r.created_at > fTo + 'T23:59:59') return false
      if (fWhere.trim()) {
        const q = fWhere.trim().toLowerCase()
        if (!whereText(r).toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [rows, fAssetSearch, fType, fFrom, fTo, fWhere])

  function clearFilters() {
    setFAssetSearch(''); setFType(''); setFFrom(''); setFTo(''); setFWhere('')
  }
  const anyFilter = fAssetSearch || fType || fFrom || fTo || fWhere

  function exportToExcel() {
    const exportRows = visible.map((r) => ({
      Date: new Date(r.created_at).toLocaleString(),
      Asset: r.assets?.asset_code || '',
      Type: r.assets?.products?.name || '',
      Detail: sentence(r),
      Where: whereText(r),
      Note: r.note || '',
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asset history')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `asset-history-${today}.xlsx`)
  }

  if (loading) return <p>Loading asset history…</p>
  if (error) return <p className="error">Couldn't load asset history: {error}</p>

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-row">
          <input
            type="text"
            className="filter-search"
            placeholder="Search asset code or type"
            value={fAssetSearch}
            onChange={(e) => setFAssetSearch(e.target.value)}
          />
          <select value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Event: all</option>
            {types.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            From
            <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </label>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            To
            <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </label>
        </div>
        <div className="filter-row">
          <input
            type="text"
            className="filter-search"
            placeholder="Search where (site or store)"
            value={fWhere}
            onChange={(e) => setFWhere(e.target.value)}
          />
        </div>
      </div>

      <div className="list-actions">
        <button onClick={exportToExcel} disabled={visible.length === 0}>Export to Excel</button>
      </div>

      <div className="filter-summary">
        <span>{visible.length} of {rows.length} events</span>
        {anyFilter && <button className="btn-link" onClick={clearFilters}>Clear filters</button>}
      </div>

      {visible.length === 0 ? (
        <p>No history matches those filters.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Asset</th>
              <th>Type</th>
              <th>Detail</th>
              <th>Where</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="clickable-row" onClick={() => setOpenId(r.asset_id)}>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.assets?.asset_code || '—'}</td>
                <td>{r.assets?.products?.name || '—'}</td>
                <td>{sentence(r)}</td>
                <td>{whereText(r)}</td>
                <td>{r.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {openId && (
        <AssetDetail
          assetId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => load(true)}
        />
      )}
    </div>
  )
}
