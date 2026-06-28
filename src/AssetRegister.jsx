// src/AssetRegister.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function AssetRegister() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('asset_register')
        .select('*')
        .order('asset_type', { ascending: true })
      if (error) setError(error.message)
      else setRows(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p>Loading assets…</p>
  if (error) return <p className="error">Couldn't load assets: {error}</p>
  if (rows.length === 0) return <p>No assets to show yet.</p>

  return (
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
        {rows.map((r) => (
          <tr key={r.asset_id}>
            <td>{r.asset_code}</td>
            <td>{r.asset_type}</td>
            <td>{r.condition}</td>
            <td>{r.status}</td>
            <td>{r.current_position}</td>
            <td>{r.holder || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}