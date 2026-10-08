// src/UniformRecharge.jsx
// Month-end uniform recharge for accounts. Voided lines stay visible for the
// audit trail but charge nothing.
import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

const costLabel = (v) => `£${Number(v || 0).toFixed(2)}`
const monthLabel = (d) => {
  if (!d) return '—'
  const [y, m] = String(d).split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
const dateLabel = (ts) => new Date(ts).toLocaleDateString('en-GB')
const charge = (r) => (r.void_id ? 0 : Number(r.line_cost || 0))

// Real Excel dates rather than text, same approach as the Cost report.
const excelDateFromDateOnly = (s) => {
  if (!s) return null
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const excelDateFromTimestamp = (ts) => {
  if (!ts) return null
  const dt = new Date(ts)
  return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
}
function applyDateFormat(worksheet, colIndex, rowCount, format) {
  for (let i = 0; i < rowCount; i++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: i + 1, c: colIndex })]
    if (cell) cell.z = format
  }
}

export default function UniformRecharge() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fMonth, setFMonth] = useState('')
  const [fPerson, setFPerson] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [voiding, setVoiding] = useState(null)

  async function load() {
    const { data, error } = await supabase
      .from('uniform_recharge_detail')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setRows(data || [])
  }

  useEffect(() => {
    async function init() { setLoading(true); await load(); setLoading(false) }
    init()
  }, [])

  const months = useMemo(() => [...new Set(rows.map((r) => r.charge_month))].sort().reverse(), [rows])
  const peopleList = useMemo(() => {
    const m = new Map()
    rows.forEach((r) => m.set(r.person_id, r.person_name))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => rows.filter((r) => {
    if (fMonth && r.charge_month !== fMonth) return false
    if (fPerson && String(r.person_id) !== String(fPerson)) return false
    return true
  }), [rows, fMonth, fPerson])

  const visible = showVoided ? filtered : filtered.filter((r) => !r.void_id)
  const voidedCount = filtered.filter((r) => r.void_id).length

  // One line per person per month, voided lines excluded from the totals.
  const summary = useMemo(() => {
    const m = new Map()
    filtered.filter((r) => !r.void_id).forEach((r) => {
      const k = `${r.person_id}|${r.charge_month}`
      if (!m.has(k)) m.set(k, { person_name: r.person_name, person_role: r.person_role, charge_month: r.charge_month, items: 0, total: 0 })
      const s = m.get(k)
      s.items += Number(r.quantity)
      s.total += Number(r.line_cost || 0)
    })
    return [...m.values()].sort((a, b) => b.charge_month.localeCompare(a.charge_month) || a.person_name.localeCompare(b.person_name))
  }, [filtered])

  const grandTotal = summary.reduce((s, r) => s + r.total, 0)

  async function voidLine(r) {
    const reason = window.prompt(`Void ${r.quantity} × ${r.product_name} issued to ${r.person_name} on ${dateLabel(r.created_at)}?\n\nThe stock goes back on the shelf and the charge is removed. Give a reason:`)
    if (reason === null) return
    if (!reason.trim()) { setError('A reason is needed to void a line.'); return }
    setVoiding(r.id); setError(null)
    const { error } = await supabase.rpc('void_uniform_issue', { p_movement_id: r.id, p_reason: reason.trim() })
    setVoiding(null)
    if (error) setError(error.message)
    else await load()
  }

  function exportExcel() {
    const summaryRows = summary.map((s) => ({
      Person: s.person_name,
      Role: s.person_role || '',
      Month: excelDateFromDateOnly(s.charge_month),
      Items: s.items,
      'Total charge (£)': Number(s.total.toFixed(2)),
    }))
    const detailRows = visible.map((r) => ({
      Date: excelDateFromTimestamp(r.created_at),
      Month: excelDateFromDateOnly(r.charge_month),
      Person: r.person_name,
      Role: r.person_role || '',
      'Product code': r.product_code,
      Product: r.product_name,
      Quantity: Number(r.quantity),
      'Unit cost (£)': r.unit_cost === null ? '' : Number(r.unit_cost),
      'Charge (£)': charge(r),
      Status: r.void_id ? 'Voided' : 'Charged',
      Note: r.void_id ? r.void_note : (r.note || ''),
    }))

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
    applyDateFormat(wsSummary, 2, summaryRows.length, 'mmmm yyyy')
    const wsDetail = XLSX.utils.json_to_sheet(detailRows)
    applyDateFormat(wsDetail, 0, detailRows.length, 'dd/mm/yy')
    applyDateFormat(wsDetail, 1, detailRows.length, 'mmmm yyyy')
    wsDetail['!autofilter'] = { ref: wsDetail['!ref'] }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail')
    const tag = fMonth ? fMonth.slice(0, 7) : 'all-months'
    XLSX.writeFile(wb, `uniform-recharge-${tag}.xlsx`)
  }

  if (loading) return <p>Loading uniform recharge…</p>

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-row">
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            Month
            <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
              <option value="">All months</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            Person
            <select value={fPerson} onChange={(e) => setFPerson(e.target.value)}>
              <option value="">Everyone</option>
              {peopleList.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="list-actions">
        <button onClick={exportExcel} disabled={summary.length === 0 && visible.length === 0}>Export to Excel</button>
      </div>

      <div className="filter-summary">
        <span>{summary.length} person-month line{summary.length === 1 ? '' : 's'}, total {costLabel(grandTotal)}</span>
      </div>

      {summary.length === 0 ? (
        <p>No uniform charges match those filters.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Person</th><th>Role</th><th>Month</th><th className="num">Items</th><th className="num">Total charge</th></tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={`${s.person_name}-${s.charge_month}`}>
                <td>{s.person_name}</td>
                <td>{s.person_role || '—'}</td>
                <td>{monthLabel(s.charge_month)}</td>
                <td className="num">{s.items}</td>
                <td className="num">{costLabel(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <hr style={{ margin: '1.5rem 0' }} />

      <h3 className="form-title">Items issued</h3>
      <label className="filter-toggle">
        <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
        Show voided lines{voidedCount > 0 ? ` (${voidedCount})` : ''}
      </label>

      {visible.length === 0 ? (
        <p>No items to show.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Person</th><th>Item</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Charge</th><th>Note</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className={r.void_id ? 'row-warehouse-due' : ''}>
                <td>{dateLabel(r.created_at)}</td>
                <td>{r.person_name}</td>
                <td>{r.product_code} — {r.product_name}</td>
                <td className="num">{r.quantity}</td>
                <td className="num">{r.unit_cost === null ? '—' : costLabel(r.unit_cost)}</td>
                <td className="num">{r.void_id ? 'Voided' : costLabel(r.line_cost)}</td>
                <td>{r.void_id ? r.void_note : (r.note || '')}</td>
                <td>
                  {!r.void_id && (
                    <button className="btn-link danger" onClick={() => voidLine(r)} disabled={voiding === r.id}>
                      {voiding === r.id ? 'Voiding…' : 'Void'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
