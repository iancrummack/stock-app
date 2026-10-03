// src/OwnerSelect.jsx
// Pick owner dropdown, shared by Create pick and Upload pick list.
// Lists profiles flagged can_own_picks, plus the logged-in user, who is
// always the default. An empty value means "me": the database then sets
// the owner to the logged-in user, so a pick can never be left ownerless.
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function OwnerSelect({ value, onChange, disabled }) {
  const [owners, setOwners] = useState([])
  const [me, setMe] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email, can_own_picks')
        .order('name')
      const all = data || []
      setMe(all.find((p) => p.id === user?.id) || null)
      setOwners(all.filter((p) => p.can_own_picks && p.id !== user?.id))
    }
    load()
  }, [])

  const label = (p) => p.name || p.email || 'Unnamed login'

  return (
    <div className="form-field">
      <label>Owner (gets the status notifications)</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{me ? `Me, ${label(me)}` : 'Me'}</option>
        {owners.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
      </select>
    </div>
  )
}
