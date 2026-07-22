// src/Insights.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Cell, ResponsiveContainer,
} from 'recharts'

const RED = '#e24b4a'
const BLUE = '#378add'
const TEAL = '#1d9e75'
const PURPLE = '#7f77dd'

const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
const uk = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '—'

export default function Insights() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [picks, setPicks] = useState([])
  const [weeks, setWeeks] = useState([])
  const [includeManual, setIncludeManual] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(null)

    const { data: p, error: pErr } = await supabase
      .from('picks')
      .select('id, created_at, collection_date, completed_at, status, source, projects(code)')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
    if (pErr) { setError(pErr.message); setLoading(false); return }
    setPicks(p || [])

    const since = new Date()
    since.setDate(since.getDate() - 56)
    const { data: m } = await supabase
      .from('stock_movements')
      .select('created_at, quantity')
      .gte('created_at', since.toISOString())

    const bucket = {}
    for (const row of (m || [])) {
      const d = new Date(row.created_at)
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = monday.toISOString().slice(0, 10)
      if (!bucket[key]) bucket[key] = { week: key, In: 0, Out: 0 }
      const q = Number(row.quantity)
      if (q >= 0) bucket[key].In += q
      else bucket[key].Out += Math.abs(q)
    }
    setWeeks(Object.values(bucket)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => ({ ...w, week: uk(w.week).slice(0, 5), In: Math.round(w.In), Out: Math.round(w.Out) })))

    setLoading(false)
  }

  if (loading) return <p>Loading insights…</p>
  if (error) return <p className="error">{error}</p>

  const shown = includeManual ? picks : picks.filter((p) => p.source !== 'manual')

  const notice = shown
    .filter((p) => p.collection_date && p.created_at)
    .map((p) => ({
      label: `${p.projects?.code || p.id}`,
      days: dayDiff(String(p.created_at).slice(0, 10), p.collection_date),
      manual: p.source === 'manual',
    }))
  const noticeAvg = notice.length
    ? Math.round((notice.reduce((s, x) => s + x.days, 0) / notice.length) * 10) / 10
    : 0

  const turnaround = shown
    .filter((p) => p.completed_at && p.created_at)
    .map((p) => ({
      label: `${p.projects?.code || p.id}`,
      days: dayDiff(String(p.created_at).slice(0, 10), String(p.completed_at).slice(0, 10)),
      manual: p.source === 'manual',
    }))
  const turnAvg = turnaround.length
    ? Math.round((turnaround.reduce((s, x) => s + x.days, 0) / turnaround.length) * 10) / 10
    : 0

  return (
    <div>
      <label className="filter-toggle" style={{ display: 'block', marginBottom: '1rem', fontSize: '0.85rem' }}>
        <input type="checkbox" checked={includeManual} onChange={(e) => setIncludeManual(e.target.checked)} />
        {' '}Include ad-hoc (manually created) picks — they are short notice by nature, so they drag the average down
      </label>

      <div className="dash-cards">
        <div className="dash-card">
          <div className="dash-card-label">Average notice</div>
          <div className="dash-card-value">{noticeAvg} <span style={{ fontSize: '0.9rem', fontWeight: 400 }}>days</span></div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Average turnaround</div>
          <div className="dash-card-value">{turnAvg} <span style={{ fontSize: '0.9rem', fontWeight: 400 }}>days</span></div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Picks measured</div>
          <div className="dash-card-value">{shown.length}</div>
        </div>
      </div>

      <h4 className="detail-subhead" style={{ marginTop: '1.5rem' }}>
        Notice lag — creation to collection date
      </h4>
      <p className="detail-empty" style={{ marginTop: 0 }}>Red bars had no notice at all, or were already late when they arrived.</p>
      {notice.length === 0 ? <p className="detail-empty">No picks to measure yet.</p> : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={notice} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-40} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} label={{ value: 'days', angle: -90, position: 'insideLeft', fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v} days notice`, '']} />
              <ReferenceLine y={noticeAvg} stroke={PURPLE} strokeDasharray="4 4" />
              <Bar dataKey="days" barSize={26} radius={[4, 4, 0, 0]}>
                {notice.map((n, i) => <Cell key={i} fill={n.days <= 0 ? RED : (n.manual ? TEAL : BLUE)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <h4 className="detail-subhead" style={{ marginTop: '2rem' }}>
        Warehouse turnaround — creation to completion
      </h4>
      {turnaround.length === 0 ? (
        <p className="detail-empty">
          Nothing measured yet. Completion timestamps start recording from now, so this fills in as picks are dispatched.
        </p>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={turnaround} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-40} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} label={{ value: 'days', angle: -90, position: 'insideLeft', fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v} days to complete`, '']} />
              <ReferenceLine y={turnAvg} stroke={PURPLE} strokeDasharray="4 4" />
              <Bar dataKey="days" barSize={26} radius={[4, 4, 0, 0]} fill={TEAL} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <h4 className="detail-subhead" style={{ marginTop: '2rem' }}>Stock movement volume, last 8 weeks</h4>
      {weeks.length === 0 ? <p className="detail-empty">No movements in the last eight weeks.</p> : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={weeks} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Out" name="Issued out" stroke={BLUE} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="In" name="Received in" stroke={TEAL} strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}