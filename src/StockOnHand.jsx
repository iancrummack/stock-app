// src/StockOnHand.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function StockOnHand() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('stock_on_hand')
        .select('*')
        .order('name', { ascending: true })
      if (error) setError(error.message)
      else setRows(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p>Loading stock…</p>
  if (error) return <p className="error">Couldn't load stock: {error}</p>
  if (rows.length === 0) return <p>No stock to show yet.</p>

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
          <tr key={r.product_id}>
            <td>{r.code}</td>
            <td>{r.name}</td>
            <td className="num">{r.on_hand}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}