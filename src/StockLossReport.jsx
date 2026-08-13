// src/StockLossReport.jsx
import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

export default function StockLossReport() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [fSearch, setFSearch] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [missingCostOnly, setMissingCostOnly] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('stock_loss_report')
        .select('id, created_at, product_code, product_name, category_name, owner_name, quantity, unit_cost, loss_value')
        .order('created_at', { ascending: false })
      if (error) setError(error.message)
      else setRows(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const costLabel = (v) => `£${Number(v || 0).toFixed(2)}`
  const hasCost = (r) => r.unit_cost !== null && r.unit_cost !== undefined

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (missingCostOnly && hasCost(r)) return false
      if (fSearch.trim()) {
        const q = fSearch.trim().toLowerCase()
        const hay = `${r.product_code || ''} ${r.product_name || ''} ${r.category_name || ''} ${r.owner_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (fFrom && r.created_at < fFrom) return false
      if (fTo && r.created_at > fTo + 'T23:59:59') return false
      return true
    })
  }, [rows, fSearch, fFrom, fTo, missingCostOnly])

  const totalLoss = visible.reduce((s, r) => s + Number(r.loss_value || 0), 0)
  const missingCostCount = visible.filter((r) => !hasCost(r)).length

  function clearFilters() { setFSearch(''); setFFrom(''); setFTo(''); setMissingCostOnly(false) }
  const anyFilter = fSearch || fFrom || fTo || missingCostOnly

  function exportToExcel() {
    const exportRows = visible.map((r) => ({
      Date: new Date(r.created_at).toLocaleDateString(),
      Product: `${r.product_code} — ${r.product_name}`,
      Category: r.category_name || '',
      Owner: r.owner_name || '',
      'Qty lost': Math.abs(r.quantity),
      'Unit cost (£)': hasCost(r) ? Number(r.unit_cost).toFixed(2) : 'Cost not set',
      'Value lost (£)': hasCost(r) ? Number(r.loss_value || 0).toFixed(2) : 'Cost not set',
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock loss')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `stock-loss-report-${today}.xlsx`)
  }

  if (loading) return <p>Loading stock loss report…</p>
  if (error) return <p className="error">Couldn't load stock loss report: {error}</p>

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-row">
          <input
            type="text"
            className="filter-search"
            placeholder="Search product, category or owner"
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
          />
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            From
            <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </label>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            To
            <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </label>
        </div>
      </div>

      <label className="filter-toggle">
        <input type="checkbox" checked={missingCostOnly} onChange={(e) => setMissingCostOnly(e.target.checked)} />
        Missing cost only ({rows.filter((r) => !hasCost(r)).length} product{rows.filter((r) => !hasCost(r)).length === 1 ? '' : 's'} need a cost set)
      </label>

      <div className="list-actions">
        <button onClick={exportToExcel} disabled={visible.length === 0}>Export to Excel</button>
      </div>

      <div className="filter-summary">
        <span>
          {visible.length} loss{visible.length === 1 ? '' : 'es'}, total {costLabel(totalLoss)}
          {missingCostCount > 0 && ` (${missingCostCount} understated, cost not set)`}
        </span>
        {anyFilter && <button className="btn-link" onClick={clearFilters}>Clear filters</button>}
      </div>

      {visible.length === 0 ? (
        <p>No stock losses match those filters.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Category</th>
              <th>Owner</th>
              <th className="num">Qty lost</th>
              <th className="num">Unit cost</th>
              <th className="num">Value lost</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className={hasCost(r) ? '' : 'row-soon'}>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.product_code} — {r.product_name}</td>
                <td>{r.category_name || '—'}</td>
                <td>{r.owner_name || '—'}</td>
                <td className="num">{Math.abs(r.quantity)}</td>
                <td className="num">{hasCost(r) ? costLabel(r.unit_cost) : <span className="line-flag">Cost not set</span>}</td>
                <td className="num">{hasCost(r) ? costLabel(r.loss_value) : <span className="line-flag">Cost not set</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}