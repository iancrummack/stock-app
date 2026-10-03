// src/NotificationBell.jsx
// Header bell: unread count, a dropdown of recent notifications, and a click
// that marks one read and opens its pick. Each user only ever sees their own
// rows (RLS), so reading one never clears it for anyone else.
// Refreshes every minute and whenever the browser tab regains focus.
import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

const REFRESH_MS = 60000

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

export default function NotificationBell({ onOpenPick }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('id, pick_id, message, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data || [])
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [])

  // Close the dropdown when clicking anywhere else
  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const unread = items.filter((n) => !n.read_at)

  async function openItem(n) {
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    }
    setOpen(false)
    await load()
    if (n.pick_id && onOpenPick) onOpenPick(n.pick_id)
  }

  async function markAllRead() {
    const ids = unread.map((n) => n.id)
    if (ids.length === 0) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    await load()
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => { setOpen(!open); if (!open) load() }}
        aria-label={`Notifications, ${unread.length} unread`}
        title="Notifications"
        style={{ position: 'relative', padding: '0.3rem 0.6rem', fontSize: '1.1rem', lineHeight: 1 }}
      >
        🔔
        {unread.length > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px',
            borderRadius: 9, background: '#b71c1c', color: '#fff', fontSize: '0.7rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 340, maxWidth: '90vw',
          maxHeight: 420, overflowY: 'auto', background: '#fff', color: '#222',
          border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 1000,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', borderBottom: '1px solid #eee' }}>
            <strong style={{ fontSize: '0.9rem' }}>Notifications</strong>
            {unread.length > 0 && (
              <button className="btn-link" onClick={markAllRead} style={{ fontSize: '0.8rem' }}>Mark all read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p style={{ padding: '0.8rem', margin: 0, fontSize: '0.85rem', color: '#666' }}>Nothing yet.</p>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                onClick={() => openItem(n)}
                style={{
                  padding: '0.6rem 0.8rem', borderBottom: '1px solid #f2f2f2', cursor: 'pointer',
                  background: n.read_at ? '#fff' : '#eef4fb',
                  fontWeight: n.read_at ? 400 : 600, fontSize: '0.85rem',
                }}
              >
                <div>{n.message}</div>
                <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 400, marginTop: '0.2rem' }}>
                  {timeAgo(n.created_at)}{!n.read_at && ' · unread'}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
