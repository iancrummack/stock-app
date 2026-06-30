// src/AssetRegister.jsx
import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import AssetDetail from './AssetDetail'

export default function AssetRegister() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [fType, setFType] = useState('')
  const [fCondition, setFCondition] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fPosition, setFPosition] = useState('')
  const [fHolder, setFHolder] = useState('')
  const [openId, setOpenId] = useState(null)

  async function load(isRefresh) {
    if (!isRefresh) setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('asset_register')
      .select('*')
      .order('asset_type', { ascending: true })
    if (error) setError(error.message)
    else setRows(data || [])
    if (!isRefresh) setLoading(false)
  }

  useEffect(() => { load() }, [])

  const options = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((r) => r[key]).filter((v) => v != null && v !== ''))].sort()
    return {
      types: uniq('asset_type'),
      conditions: uniq('condition'),
      statuses: uniq('status'),
      positions: uniq('current_position'),
      holders: uniq('holder'),
    }
  }, [rows])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (fType && r.asset_type !== fType) return false
      if (fCondition && r.condition !== fCondition) return false
      if (fStatus && r.status !== fStatus) return false
      if (fPosition && r.current_position !== fPosition) return false
      if (fHolder && r.holder !== fHolder) return false
      if (q) {
        const hay = `${r.asset_code || ''} ${r.asset_type || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, fType, fCondition, fStatus, fPosition, fHolder])

  function clearFilters() {
    setSearch(''); setFType(''); setFCondition(''); setFStatus(''); setFPosition(''); setFHolder('')
  }

  function exportToExcel() {
    // Export exactly what's filtered on screen, with friendly column names.
    const exportRows = visible.map((r) => ({
      Code: r.asset_code || '',
      Type: r.asset_type || '',
      Condition: r.condition || '',
      Status: r.status || '',
      Position: r.current_position || '',
      Holder: r.holder || '',
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asset register')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `asset-register-${today}.xlsx`)
  }

  const anyFilter = search || fType || fCondition || fStatus || fPosition || fHolder

  if (loading) return <p>Loading assets…</p>
  if (error) return <p className="error">Couldn't load assets: {error}</p>

  return (
    <div>
      <div className="filter-bar">
        <input
          type="text"
          className="filter-search"
          placeholder="Search code or type"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-row">
          <select value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Type: all</option>
            {options.types.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={fCondition} onChange={(e) => setFCondition(e.target.value)}>
            <option value="">Condition: all</option>
            {options.conditions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Status: all</option>
            {options.statuses.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={fPosition} onChange={(e) => setFPosition(e.target.value)}>
            <option value="">Position: all</option>
            {options.positions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={fHolder} onChange={(e) => setFHolder(e.target.value)}>
            <option value="">Holder: all</option>
            {options.holders.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="list-actions">
        <button onClick={exportToExcel} disabled={visible.length === 0}>Export to Excel</button>
      </div>

      <div className="filter-summary">
        <span>{visible.length} of {rows.length} assets</span>
        {anyFilter && <button className="btn-link" onClick={clearFilters}>Clear filters</button>}
      </div>

      {visible.length === 0 ? (
        <p>No assets match those filters.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Condition</th>
              <th>Status</th>
              <th>Position</th>
              <th>Holder</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.asset_id} className="clickable-row" onClick={() => setOpenId(r.asset_id)}>
                <td>{r.asset_code || '—'}</td>
                <td>{r.asset_type}</td>
                <td>{r.condition}</td>
                <td>{r.status}</td>
                <td>{r.current_position}</td>
                <td>{r.holder || '—'}</td>
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

