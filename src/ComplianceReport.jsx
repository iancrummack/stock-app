// src/ComplianceReport.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function ComplianceReport() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [onSiteOnly, setOnSiteOnly] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('compliance_due')
        .select('*')
        .order('expiry_date', { ascending: true })
      if (error) setError(error.message)
      else setRows(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p>Loading compliance…</p>
  if (error) return <p className="error">Couldn't load compliance: {error}</p>

  const visible = onSiteOnly ? rows.filter((r) => r.on_site) : rows

  // Colour priority: on-site overdue/soon is the real problem and shouts loudest.
  // Warehouse items are calmer because they'll be serviced before going out.
  function rowClass(r) {
    if (r.on_site && r.days_remaining < 0) return 'row-critical'
    if (r.on_site && r.days_remaining <= 30) return 'row-soon'
    if (!r.on_site && r.days_remaining < 0) return 'row-warehouse-due'
    return ''
  }

  return (
    <div>
      <label className="filter-toggle">
        <input
          type="checkbox"
          checked={onSiteOnly}
          onChange={(e) => setOnSiteOnly(e.target.checked)}
        />
        Show on-site only (the ones that need recalling)
      </label>

      {visible.length === 0 ? (
        <p>Nothing to show.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Code</th>
              <th>Check</th>
              <th>Expiry</th>
              <th className="num">Days left</th>
              <th>Position</th>
              <th>Holder</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i} className={rowClass(r)}>
                <td>{r.asset_type}</td>
                <td>{r.asset_code}</td>
                <td>{r.compliance_type}</td>
                <td>{r.expiry_date}</td>
                <td className="num">{r.days_remaining}</td>
                <td>{r.current_position}</td>
                <td>{r.holder || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}