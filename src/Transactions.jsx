// src/Transactions.jsx
import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

export default function Transactions() {
  const [rows, setRows] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [fProductSearch, setFProductSearch] = useState('')
  const [fType, setFType] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [profileMap, setProfileMap] = useState({})
  const [fWhere, setFWhere] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      // Movements, with product, location, project and the person's profile.
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, created_at, movement_type, quantity, product_id, location_id, project_id, created_by, products(code, name), locations(code, name), projects(code, name)')
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) setError(error.message)
      else setRows(data || [])

      const { data: prods } = await supabase
        .from('products').select('id, code, name').eq('tracking_type', 'quantity').order('name')
      setProducts(prods || [])

      // Load profiles separately and match names in the browser (no DB join needed).
      const { data: profs } = await supabase.from('profiles').select('id, name, email')
      const map = {}
      ;(profs || []).forEach((p) => { map[p.id] = p })
      setProfileMap(map)

      setLoading(false)
    }
    load()
  }, [])

  function whoDidIt(r) {
    const p = r.created_by ? profileMap[r.created_by] : null
    return p?.name || p?.email || '—'
    }

  function whereTo(r) {
    if (r.projects) return `Site: ${r.projects.code}`
    if (r.locations) return `Store: ${r.locations.code}`
    return '—'
  }

  const types = useMemo(() => [...new Set(rows.map((r) => r.movement_type).filter(Boolean))].sort(), [rows])

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (fProductSearch) {
        const q = fProductSearch.trim().toLowerCase()
        const hay = `${r.products?.code || ''} ${r.products?.name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (fType && r.movement_type !== fType) return false
      if (fFrom && r.created_at < fFrom) return false
      // fTo is inclusive of the whole day, so compare against the next day.
      if (fTo && r.created_at > fTo + 'T23:59:59') return false
      if (fWhere.trim()) {
        const q = fWhere.trim().toLowerCase()
        if (!whereTo(r).toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [rows, fProductSearch, fType, fFrom, fTo, fWhere])

  function clearFilters() {
    setFProductSearch(''); setFType(''); setFFrom(''); setFTo(''); setFWhere('')
  }
  const anyFilter = fProductSearch || fType || fFrom || fTo || fWhere

  function exportToExcel() {
    const exportRows = visible.map((r) => ({
      Date: new Date(r.created_at).toLocaleString(),
      Product: r.products ? `${r.products.code} — ${r.products.name}` : '',
      Type: r.movement_type,
      Quantity: r.quantity,
      Where: whereTo(r),
      By: whoDidIt(r),
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions')
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `transactions-${today}.xlsx`)
  }

  if (loading) return <p>Loading transactions…</p>
  if (error) return <p className="error">Couldn't load transactions: {error}</p>

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-row">
          <input
            type="text"
            className="filter-search"
            placeholder="Search product name or code"
            value={fProductSearch}
            onChange={(e) => setFProductSearch(e.target.value)}
          />
          <select value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Type: all</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            From
            <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </label>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            To
            <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </label>
          <input
            type="text"
            className="filter-search"
            placeholder="Search where (site or store)"
            value={fWhere}
            onChange={(e) => setFWhere(e.target.value)}
            style={{ maxWidth: 200 }}
          />
        </div>
      </div>

      <div className="list-actions">
        <button onClick={exportToExcel} disabled={visible.length === 0}>Export to Excel</button>
      </div>

      <div className="filter-summary">
        <span>{visible.length} of {rows.length} movements</span>
        {anyFilter && <button className="btn-link" onClick={clearFilters}>Clear filters</button>}
      </div>

      {visible.length === 0 ? (
        <p>No movements match those filters.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Type</th>
              <th className="num">Qty</th>
              <th>Where</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.products ? `${r.products.code} — ${r.products.name}` : '—'}</td>
                <td>{r.movement_type}</td>
                <td className="num">{r.quantity}</td>
                <td>{whereTo(r)}</td>
                <td>{whoDidIt(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}