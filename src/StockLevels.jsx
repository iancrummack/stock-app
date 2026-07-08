// src/StockLevels.jsx
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

export default function StockLevels() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('stock_levels')
        .select('*')
        .order('name', { ascending: true })
      if (error) setError(error.message)
      else setRows(data || [])
      setLoading(false)
    }
    load()
  }, [])

const visible = search.trim()
    ? rows.filter((r) => {
        const q = search.trim().toLowerCase()
        const hay = `${r.name || ''} ${r.owner || ''} ${r.category || ''}`.toLowerCase()
        return hay.includes(q)
      })
    : rows

  function exportToExcel() {
    // Friendly column names, now including owner and category so buyers can filter.
    const exportRows = visible.map((r) => ({
      Code: r.code,
      Product: r.name,
      Owner: r.owner || '',
      Category: r.category || '',
      'On hand': r.on_hand,
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock levels')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `stock-levels-${today}.xlsx`)
  }

  if (loading) return <p>Loading stock levels…</p>
  if (error) return <p className="error">Couldn't load stock levels: {error}</p>

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
      </div>

      <div className="list-actions">
        <button onClick={exportToExcel} disabled={visible.length === 0}>
          Export to Excel
        </button>
      </div>

      <div className="filter-summary">
        <span>{visible.length} of {rows.length}</span>
        {search && <button className="btn-link" onClick={() => setSearch('')}>Clear search</button>}
      </div>

      {visible.length === 0 ? (
        <p>{search ? 'No products match that search.' : 'No products yet.'}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Owner</th>
              <th>Category</th>
              <th className="num">On hand</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.product_id} className={r.on_hand < 0 ? 'row-critical' : r.on_hand === 0 ? 'row-warehouse-due' : ''}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td>{r.owner || '—'}</td>
                <td>{r.category || '—'}</td>
                <td className="num">{r.on_hand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}