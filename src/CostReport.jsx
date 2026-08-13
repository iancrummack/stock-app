// src/CostReport.jsx
import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

export default function CostReport() {
  const [rows, setRows] = useState([])
  const [stockRows, setStockRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [fContract, setFContract] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [showZero, setShowZero] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const [costResult, stockResult] = await Promise.all([
        supabase
          .from('contract_cost_monthly')
          .select('project_id, project_code, project_name, cost_month, total_cost')
          .order('cost_month', { ascending: false })
          .order('project_code', { ascending: true }),
        supabase
          .from('stock_levels')
          .select('product_id, code, name, category, owner, on_hand, unit_cost')
          .order('name', { ascending: true }),
      ])
      if (costResult.error) setError(costResult.error.message)
      else setRows(costResult.data || [])
      setStockRows((stockResult.data || []).filter((r) => Number(r.on_hand) !== 0))
      setLoading(false)
    }
    load()
  }, [])

  const monthLabel = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }
  const costLabel = (v) => `£${Number(v || 0).toFixed(2)}`
  const hasCost = (r) => r.unit_cost !== null && r.unit_cost !== undefined

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (!showZero && Number(r.total_cost) === 0) return false
      if (fContract.trim()) {
        const q = fContract.trim().toLowerCase()
        const hay = `${r.project_code || ''} ${r.project_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (fFrom && r.cost_month < fFrom) return false
      if (fTo && r.cost_month > fTo) return false
      return true
    })
  }, [rows, showZero, fContract, fFrom, fTo])

  const grandTotal = visible.reduce((s, r) => s + Number(r.total_cost || 0), 0)

  const stockValueTotal = stockRows.reduce((s, r) => s + (hasCost(r) ? Number(r.on_hand) * Number(r.unit_cost) : 0), 0)
  const stockMissingCostCount = stockRows.filter((r) => !hasCost(r)).length

  function clearFilters() { setFContract(''); setFFrom(''); setFTo('') }
  const anyFilter = fContract || fFrom || fTo

  function exportSummary() {
    const exportRows = visible.map((r) => ({
      'Contract code': r.project_code,
      'Contract name': r.project_name,
      Month: monthLabel(r.cost_month),
      'Total cost (£)': Number(r.total_cost || 0).toFixed(2),
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cost report')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `contract-cost-report-${today}.xlsx`)
  }

  async function exportDetail() {
    setExporting(true); setError(null)
    let q = supabase
      .from('contract_cost_detail')
      .select('created_at, project_code, project_name, product_code, product_name, movement_type, quantity, unit_cost, line_cost')
      .order('created_at', { ascending: false })
    if (fFrom) q = q.gte('created_at', fFrom)
    if (fTo) q = q.lte('created_at', fTo + 'T23:59:59')
    const { data, error } = await q
    setExporting(false)
    if (error) { setError(error.message); return }

    let items = data || []
    if (fContract.trim()) {
      const qq = fContract.trim().toLowerCase()
      items = items.filter((r) => `${r.project_code || ''} ${r.project_name || ''}`.toLowerCase().includes(qq))
    }

    const exportRows = items.map((r) => ({
      Date: new Date(r.created_at).toLocaleDateString(),
      'Contract code': r.project_code,
      'Contract name': r.project_name,
      Product: `${r.product_code} — ${r.product_name}`,
      Type: r.movement_type,
      Quantity: r.quantity,
      'Unit cost (£)': r.unit_cost === null ? '' : Number(r.unit_cost).toFixed(2),
      'Line cost (£)': Number(r.line_cost || 0).toFixed(2),
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cost detail')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `contract-cost-detail-${today}.xlsx`)
  }

  function exportStockValue() {
    const exportRows = stockRows.map((r) => ({
      Code: r.code,
      Product: r.name,
      Category: r.category || '',
      Owner: r.owner || '',
      'On hand': r.on_hand,
      'Unit cost (£)': hasCost(r) ? Number(r.unit_cost).toFixed(2) : 'Cost not set',
      'Stock value (£)': hasCost(r) ? (Number(r.on_hand) * Number(r.unit_cost)).toFixed(2) : 'Cost not set',
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock value')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `current-stock-value-${today}.xlsx`)
  }

  if (loading) return <p>Loading cost report…</p>
  if (error) return <p className="error">Couldn't load cost report: {error}</p>

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-row">
          <input
            type="text"
            className="filter-search"
            placeholder="Search contract code or name"
            value={fContract}
            onChange={(e) => setFContract(e.target.value)}
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
        <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
        Show zero-cost lines
      </label>

      <div className="list-actions">
        <button onClick={exportSummary} disabled={visible.length === 0}>Export summary to Excel</button>
        <button className="btn-secondary" onClick={exportDetail} disabled={exporting}>
          {exporting ? 'Building…' : 'Export item-level detail'}
        </button>
      </div>

      <div className="filter-summary">
        <span>{visible.length} contract-month line{visible.length === 1 ? '' : 's'}, total {costLabel(grandTotal)}</span>
        {anyFilter && <button className="btn-link" onClick={clearFilters}>Clear filters</button>}
      </div>

      {visible.length === 0 ? (
        <p>No cost movements match those filters.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Contract code</th>
              <th>Contract name</th>
              <th>Month</th>
              <th className="num">Total cost</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={`${r.project_id}-${r.cost_month}`}>
                <td>{r.project_code}</td>
                <td>{r.project_name}</td>
                <td>{monthLabel(r.cost_month)}</td>
                <td className="num">{costLabel(r.total_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <hr style={{ margin: '1.5rem 0' }} />

      <h3 className="form-title">Current stock on hand, valued</h3>
      <div className="filter-summary">
        <span>
          {stockRows.length} product{stockRows.length === 1 ? '' : 's'} held, value {costLabel(stockValueTotal)}
          {stockMissingCostCount > 0 && ` (${stockMissingCostCount} understated, cost not set)`}
        </span>
      </div>
      <div className="list-actions">
        <button onClick={exportStockValue} disabled={stockRows.length === 0}>Export current stock value</button>
      </div>
    </div>
  )
}