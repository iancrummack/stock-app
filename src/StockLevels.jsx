// src/StockLevels.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function StockLevels() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('stock_levels')
        .select('*')
        .order('name', { ascending: true })
      if (error) setError(error.message)
      else setRows(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p>Loading stock levels…</p>
  if (error) return <p className="error">Couldn't load stock levels: {error}</p>
  if (rows.length === 0) return <p>No products yet.</p>

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Name</th>
          <th className="num">On hand</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.product_id} className={r.on_hand < 0 ? 'row-critical' : r.on_hand === 0 ? 'row-warehouse-due' : ''}>
            <td>{r.code}</td>
            <td>{r.name}</td>
            <td className="num">{r.on_hand}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}