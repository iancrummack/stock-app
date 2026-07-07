// src/RolesControl.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// The full list of screens the app has, grouped, so the tick-list reads sensibly.
// screen_key must match the keys in App.jsx's SCREENS map.
const SCREEN_CATALOGUE = [
  { group: 'Stock', screens: [
    { key: 'stock', label: 'Stock on hand' },
    { key: 'stocklevels', label: 'Stock levels' },
    { key: 'bayview', label: 'Bay contents' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'stocktake', label: 'Stock take' },
  ]},
  { group: 'Assets', screens: [
    { key: 'assets', label: 'Asset register' },
    { key: 'assetintake', label: 'Asset intake' },
    { key: 'uncoded', label: 'Uncoded assets' },
    { key: 'assetmove', label: 'Asset move' },
    { key: 'compliance', label: 'Compliance' },
  ]},
  { group: 'Movements', screens: [
    { key: 'receipt', label: 'Receive stock' },
    { key: 'issue', label: 'Issue / return' },
    { key: 'pickupload', label: 'Upload pick list' },
    { key: 'picklist', label: 'Pick lists' },
  ]},
  { group: 'Admin', screens: [
    { key: 'products', label: 'Products' },
    { key: 'projects', label: 'Projects' },
    { key: 'people', label: 'People' },
    { key: 'locations', label: 'Locations' },
    { key: 'servicetypes', label: 'Service types' },
    { key: 'assettypeservices', label: 'Asset service rules' },
    { key: 'kits', label: 'Kits' },
  ]},
]

export default function RolesControl() {
  const [roles, setRoles] = useState([])
  const [roleScreens, setRoleScreens] = useState([])   // {role_id, screen_key}
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyKey, setBusyKey] = useState(null)

  async function loadAll() {
    setLoading(true); setError(null)
    const [r, rs, p] = await Promise.all([
      supabase.from('roles').select('id, code, name, rank').order('rank', { ascending: false }),
      supabase.from('role_screens').select('role_id, screen_key'),
      supabase.from('profiles').select('id, email, role_id').order('email'),
    ])
    if (r.error) setError(r.error.message)
    setRoles(r.data || [])
    setRoleScreens(rs.data || [])
    setProfiles(p.data || [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function hasScreen(roleId, screenKey) {
    return roleScreens.some((x) => x.role_id === roleId && x.screen_key === screenKey)
  }

  async function toggleScreen(role, screenKey) {
    // The role-management screen itself ('roles') is never in the catalogue,
    // so it can't be un-ticked — super users always keep it. Safety by design.
    setError(null)
    const key = `${role.id}:${screenKey}`
    setBusyKey(key)
    if (hasScreen(role.id, screenKey)) {
      const { error } = await supabase.from('role_screens').delete()
        .eq('role_id', role.id).eq('screen_key', screenKey)
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.from('role_screens').insert({ role_id: role.id, screen_key: screenKey })
      if (error) setError(error.message)
    }
    await loadAll()
    setBusyKey(null)
  }

  async function setProfileRole(profileId, roleId) {
    setError(null)
    const { error } = await supabase.from('profiles').update({ role_id: roleId ? Number(roleId) : null }).eq('id', profileId)
    if (error) setError(error.message)
    else await loadAll()
  }

  if (loading) return <p>Loading roles…</p>
  if (error) return <p className="error">{error}</p>

  return (
    <div>
      {error && <div className="form-error">{error}</div>}

      <h3 className="form-title">Screen access by role</h3>
      <p className="detail-empty" style={{ marginBottom: '1rem' }}>
        Tick which screens each role can see. Changes save immediately. (The Roles screen itself is always available to super users.)
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Screen</th>
              {roles.map((r) => <th key={r.id} style={{ textAlign: 'center' }}>{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {SCREEN_CATALOGUE.map((grp) => (
              <>
                <tr key={grp.group}>
                  <td colSpan={roles.length + 1} style={{ background: '#f0f1f3', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#666' }}>{grp.group}</td>
                </tr>
                {grp.screens.map((s) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    {roles.map((r) => {
                      const isSuper = r.code === 'super'
                      const on = hasScreen(r.id, s.key)
                      const key = `${r.id}:${s.key}`
                      return (
                        <td key={r.id} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={isSuper || busyKey === key}
                            onChange={() => toggleScreen(r, s.key)}
                            title={isSuper ? 'Super user always has full access' : ''}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="form-title" style={{ marginTop: '2rem' }}>Logins and their roles</h3>
      <p className="detail-empty" style={{ marginBottom: '1rem' }}>
        People appear here after they've logged in at least once. Set each login's role.
      </p>

      {profiles.length === 0 ? (
        <p>No logins yet.</p>
      ) : (
        <table className="data-table">
          <thead><tr><th>Login (email)</th><th>Role</th></tr></thead>
          <tbody>
            {profiles.map((pf) => (
              <tr key={pf.id}>
                <td>{pf.email || '—'}</td>
                <td>
                  <select value={pf.role_id || ''} onChange={(e) => setProfileRole(pf.id, e.target.value)}>
                    <option value="">— no role —</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}