// src/Dashboard.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, Legend,
} from 'recharts'

const RED = '#e24b4a'
const AMBER = '#ef9f27'
const GREEN = '#1d9e75'
const BLUE = '#378add'
const GREY = '#888780'

// Colour a watchlist bar against its own minimum.
function levelColour(row) {
  if (row.short > 0) return RED
  if (row.min == null) return BLUE
  if (row.available < row.min) return RED
  if (row.available < row.min * 1.25) return AMBER
  return GREEN
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [watch, setWatch] = useState([])
  const [compliance, setCompliance] = useState([])
  const [openPicks, setOpenPicks] = useState(0)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(null)

    // 1. The key items themselves.
    const { data: keyProducts, error: kErr } = await supabase
      .from('products')
      .select('id, code, name, tracking_type, min_level')
      .eq('is_key_item', true)
      .order('name')
    if (kErr) { setError(kErr.message); setLoading(false); return }

    const keyIds = (keyProducts || []).map((p) => p.id)
    const keyNames = (keyProducts || []).map((p) => p.name)

    if (keyIds.length === 0) {
      setWatch([]); setCompliance([]);
      const { count } = await supabase.from('picks').select('id', { count: 'exact', head: true })
        .in('status', ['open', 'part_picked'])
      setOpenPicks(count || 0)
      setLoading(false)
      return
    }

    // 2. Consumables: the view already nets off open picks.
    const { data: avail } = await supabase
      .from('stock_available')
      .select('product_id, available')
      .in('product_id', keyIds)

    // 3. Assets: count coded units sitting in store.
    const { data: assetRows } = await supabase
      .from('assets')
      .select('id, product_id')
      .in('product_id', keyIds)
      .eq('status', 'in_store')
      .not('asset_code', 'is', null)

    // 4. Assets: what open and part-picked picks have already claimed.
    const { data: claimRows } = await supabase
      .from('pick_lines')
      .select('product_id, qty, picked_qty, picks!inner(status)')
      .in('product_id', keyIds)
      .in('picks.status', ['open', 'part_picked'])

    const assetInStore = {}
    for (const a of (assetRows || [])) {
      assetInStore[a.product_id] = (assetInStore[a.product_id] || 0) + 1
    }
    const claimed = {}
    for (const c of (claimRows || [])) {
      const outstanding = Number(c.qty) - Number(c.picked_qty || 0)
      if (outstanding > 0) claimed[c.product_id] = (claimed[c.product_id] || 0) + outstanding
    }
    const availByProduct = {}
    for (const a of (avail || [])) availByProduct[a.product_id] = Number(a.available)

    const rows = (keyProducts || []).map((p) => {
      const inStore = p.tracking_type === 'asset'
        ? (assetInStore[p.id] || 0)
        : (availByProduct[p.id] ?? 0) + (claimed[p.id] || 0)
      const promised = claimed[p.id] || 0
      const net = p.tracking_type === 'asset'
        ? inStore - promised
        : (availByProduct[p.id] ?? 0)
      return {
        name: p.name,
        kind: p.tracking_type === 'asset' ? 'asset' : 'consumable',
        available: Math.max(0, Math.round(net)),   // bar never goes below the axis
        short: net < 0 ? Math.abs(Math.round(net)) : 0,
        promised: Math.round(promised),
        min: p.min_level ?? null,
      }
    })
    setWatch(rows)

    // 5. Compliance, key items only, written-off units excluded.
    const { data: due } = await supabase
      .from('compliance_due')
      .select('asset_type, asset_code, compliance_type, expiry_date, days_remaining, status, on_site, current_position, holder')
      .in('asset_type', keyNames)
      .neq('status', 'written_off')
      .order('days_remaining', { ascending: true })
    setCompliance(due || [])

    const { count } = await supabase.from('picks').select('id', { count: 'exact', head: true })
      .in('status', ['open', 'part_picked'])
    setOpenPicks(count || 0)

    setLoading(false)
  }

  if (loading) return <p>Loading dashboard…</p>
  if (error) return <p className="error">{error}</p>

  // Bucket the compliance rows.
  const buckets = [
    { name: 'Overdue', test: (d) => d < 0 },
    { name: 'Under 4 weeks', test: (d) => d >= 0 && d <= 28 },
    { name: 'Under 12 weeks', test: (d) => d > 28 && d <= 84 },
    { name: 'Clear', test: (d) => d > 84 },
  ]
  const complianceData = buckets.map((b) => {
    const inBucket = compliance.filter((c) => b.test(Number(c.days_remaining)))
    return {
      name: b.name,
      'On site': inBucket.filter((c) => c.on_site).length,
      'In store': inBucket.filter((c) => !c.on_site).length,
    }
  })

  const urgent = compliance.filter((c) => Number(c.days_remaining) <= 28)
  const overdue = compliance.filter((c) => Number(c.days_remaining) < 0).length
  const belowMin = watch.filter((w) => w.min != null && w.available < w.min).length

  return (
    <div>
      {/* Cards */}
      <div className="dash-cards">
        <div className="dash-card">
          <div className="dash-card-label">Key items below minimum</div>
          <div className="dash-card-value" style={{ color: belowMin > 0 ? RED : undefined }}>{belowMin}</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Services due within 4 weeks</div>
          <div className="dash-card-value" style={{ color: urgent.length > 0 ? AMBER : undefined }}>{urgent.length}</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Services overdue</div>
          <div className="dash-card-value" style={{ color: overdue > 0 ? RED : undefined }}>{overdue}</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Picks open</div>
          <div className="dash-card-value">{openPicks}</div>
        </div>
      </div>

      {/* Watchlist */}
      <h4 className="detail-subhead" style={{ marginTop: '1.5rem' }}>Key item stock, available in store</h4>
      {watch.length === 0 ? (
        <p className="detail-empty">
          No key items yet. Tick "Key item" on a product in Products admin and it will appear here.
        </p>
      ) : (
        <>
          <div style={{ width: '100%', height: Math.max(180, watch.length * 46 + 40) }}>
            <ResponsiveContainer>
              <BarChart data={watch} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, _n, p) => [`${v} available (min ${p.payload.min ?? 'not set'})`, p.payload.name]} />
                <Bar dataKey="available" barSize={22} radius={[0, 4, 4, 0]}>
                  {watch.map((w, i) => <Cell key={i} fill={levelColour(w.available, w.min)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="data-table" style={{ marginTop: '0.5rem' }}>
            <thead>
              <tr><th>Item</th><th>Kind</th><th className="num">Available</th><th className="num">Promised</th><th className="num">Minimum</th><th></th></tr>
            </thead>
            <tbody>
              {watch.map((w) => (
                <tr key={w.name} className={w.short > 0 || (w.min != null && w.available < w.min) ? 'row-soon' : ''}>
                  <td>{w.name}</td>
                  <td>{w.kind}</td>
                  <td className="num">{w.available}</td>
                  <td className="num">{w.promised}</td>
                  <td className="num">{w.min ?? '—'}</td>
                  <td>
                    {w.short > 0
                      ? `over-committed by ${w.short}`
                      : (w.min == null ? 'no minimum set' : (w.available < w.min ? 'below minimum' : 'ok'))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Compliance */}
      <h4 className="detail-subhead" style={{ marginTop: '2rem' }}>Key item service status</h4>
      {compliance.length === 0 ? (
        <p className="detail-empty">No compliance records against key items.</p>
      ) : (
        <>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={complianceData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="On site" stackId="a" fill={BLUE} barSize={40} />
                <Bar dataKey="In store" stackId="a" fill={GREY} barSize={40} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h5 className="detail-subhead" style={{ marginTop: '1rem' }}>Due within four weeks, or overdue ({urgent.length})</h5>
          {urgent.length === 0 ? (
            <p className="detail-empty">Nothing due in the next four weeks.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Asset</th><th>Type</th><th>Service</th><th>Expires</th><th className="num">Days</th><th>Where</th><th>Holder</th></tr>
              </thead>
              <tbody>
                {urgent.map((c, i) => {
                  const d = Number(c.days_remaining)
                  return (
                    <tr key={i} className={d < 0 ? 'row-overdue' : 'row-soon'}>
                      <td>{c.asset_code || '—'}</td>
                      <td>{c.asset_type}</td>
                      <td>{c.compliance_type}</td>
                      <td>{c.expiry_date ? c.expiry_date.split('-').reverse().join('-') : '—'}</td>
                      <td className="num">{d < 0 ? `${Math.abs(d)} over` : d}</td>
                      <td>{c.current_position}</td>
                      <td>{c.holder || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}