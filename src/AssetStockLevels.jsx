// src/AssetStockLevels.jsx
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

export default function AssetStockLevels() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('asset_stock_levels')
        .select('*')
        .order('name', { ascending: true })
      if (error) setError(error.message)
      else setRows(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const owners = [...new Set(rows.map((r) => r.owner).filter(Boolean))].sort()
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort()

  const visible = rows.filter((r) => {
    if (ownerFilter && r.owner !== ownerFilter) return false
    if (categoryFilter && r.category !== categoryFilter) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${r.name || ''} ${r.owner || ''} ${r.category || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  function exportToExcel() {
    const exportRows = visible.map((r) => ({
      Code: r.code,
      Type: r.name,
      Owner: r.owner || '',
      Category: r.category || '',
      Total: r.total,
      'In store': r.in_store,
      'On site': r.on_site,
      'Under repair': r.under_repair,
      'Written off': r.written_off,
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asset stock levels')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `asset-stock-levels-${today}.xlsx`)
  }

  if (loading) return <p>Loading asset stock levels…</p>
  if (error) return <p className="error">Couldn't load asset stock levels: {error}</p>

  return (
    <div>
      <div className="filter-bar">
        <input
          type="text"
          className="filter-search"
          placeholder="Search name, owner or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-row">
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="">Owner: all</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Category: all</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="list-actions">
        <button onClick={exportToExcel} disabled={visible.length === 0}>
          Export to Excel
        </button>
      </div>

      <div className="filter-summary">
        <span>{visible.length} of {rows.length}</span>
        {(search || ownerFilter || categoryFilter) && (
          <button className="btn-link" onClick={() => { setSearch(''); setOwnerFilter(''); setCategoryFilter('') }}>Clear filters</button>
        )}
      </div>

      {visible.length === 0 ? (
        <p>{search ? 'No asset types match that search.' : 'No asset types yet.'}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Owner</th>
              <th>Category</th>
              <th className="num">Total</th>
              <th className="num">In store</th>
              <th className="num">On site</th>
              <th className="num">Under repair</th>
              <th className="num">Written off</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.product_id} className={r.total === 0 ? 'row-warehouse-due' : ''}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td>{r.owner || '—'}</td>
                <td>{r.category || '—'}</td>
                <td className="num">{r.total}</td>
                <td className="num">{r.in_store}</td>
                <td className="num">{r.on_site}</td>
                <td className="num">{r.under_repair}</td>
                <td className="num">{r.written_off}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}