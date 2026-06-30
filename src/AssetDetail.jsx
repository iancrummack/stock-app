// src/AssetDetail.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const CONDITIONS = ['new', 'good', 'fair', 'poor', 'out_of_service']

export default function AssetDetail({ assetId, onClose, onChanged }) {
  const [asset, setAsset] = useState(null)
  const [compliance, setCompliance] = useState([])
  const [events, setEvents] = useState([])
  const [locations, setLocations] = useState([])
  const [projects, setProjects] = useState([])
  const [people, setPeople] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [requiredServiceIds, setRequiredServiceIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [mode, setMode] = useState('view')   // view | condition | move | lifecycle | service | recode
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmRecode, setConfirmRecode] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    const [a, c, e, locs, projs, ppl, svc] = await Promise.all([
      supabase.from('assets')
        .select('id, asset_code, condition, status, product_id, products(name), location_id, locations(code, name), project_id, projects(code, name), holder_id, people(name)')
        .eq('id', assetId).single(),
      supabase.from('asset_compliance').select('compliance_type, expiry_date, last_done').eq('asset_id', assetId).order('expiry_date'),
      supabase.from('asset_events').select('event_type, status, condition, created_at, location_id, project_id, holder_id, note').eq('asset_id', assetId).order('created_at', { ascending: false }),
      supabase.from('locations').select('id, code, name').order('code'),
      supabase.from('projects').select('id, code, name').eq('is_active', true).order('code'),
      supabase.from('people').select('id, name').eq('is_active', true).order('name'),
      supabase.from('service_types').select('id, name').order('name'),
    ])
    if (a.error) setError(a.error.message)
    else setAsset(a.data)
    setCompliance(c.data || [])
    setEvents(e.data || [])
    setLocations(locs.data || [])
    setProjects(projs.data || [])
    setPeople(ppl.data || [])
    setServiceTypes(svc.data || [])
    if (a.data?.product_id) {
      const { data: req } = await supabase.from('asset_type_services').select('service_type_id').eq('product_id', a.data.product_id)
      setRequiredServiceIds((req || []).map((r) => r.service_type_id))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [assetId])

  function positionText(row) {
    if (row.locations) return `Store: ${row.locations.code} — ${row.locations.name}`
    if (row.projects) return `Site: ${row.projects.code} — ${row.projects.name}`
    return 'Unassigned'
  }
  function daysLabel(dateStr) {
    if (!dateStr) return ''
    const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
    return days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`
  }
  const locName = (id) => locations.find((x) => x.id === id)?.code || null
  const projName = (id) => projects.find((x) => x.id === id)?.code || null
  const personName = (id) => people.find((x) => x.id === id)?.name || null

  function startAction(which) {
    setForm({
      condition: asset.condition, status: asset.status,
      location_id: asset.location_id || '', project_id: asset.project_id || '',
      holder_id: asset.holder_id || '', where: asset.project_id ? 'site' : 'store',
      service_type_id: '', expiry_date: '', last_done: '',
      new_code: asset.asset_code || '',
    })
    setConfirmRecode(false)
    setMode(which); setError(null)
  }

  async function save(eventType, overrides) {
    setSaving(true); setError(null)
    const payload = {
      p_asset_id: assetId, p_condition: form.condition, p_status: form.status,
      p_location_id: null, p_project_id: null,
      p_holder_id: form.holder_id ? Number(form.holder_id) : null,
      p_event_type: eventType, p_note: null, ...overrides,
    }
    const { error } = await supabase.rpc('update_asset', payload)
    setSaving(false)
    if (error) { setError(error.message); return }
    setMode('view'); await load(); if (onChanged) onChanged()
  }
  function saveCondition() { save('condition_change', { p_location_id: asset.location_id, p_project_id: asset.project_id }) }
  function saveMove() {
    const toSite = form.where === 'site'
    save('moved', {
      p_location_id: toSite ? null : (form.location_id ? Number(form.location_id) : null),
      p_project_id: toSite ? (form.project_id ? Number(form.project_id) : null) : null,
      p_status: toSite ? 'on_site' : 'in_store',
    })
  }
  function saveLifecycle(newStatus) {
    save(newStatus === 'under_repair' ? 'repair' : 'written_off', {
      p_status: newStatus, p_location_id: asset.location_id, p_project_id: asset.project_id,
    })
  }

  async function saveService() {
    setError(null)
    if (!form.service_type_id) { setError('Choose a service type.'); return }
    if (!form.expiry_date) { setError('Set an expiry date.'); return }
    const svcName = serviceTypes.find((s) => String(s.id) === String(form.service_type_id))?.name
    setSaving(true)
    const { error } = await supabase.from('asset_compliance').insert({
      asset_id: assetId, compliance_type: svcName, expiry_date: form.expiry_date, last_done: form.last_done || null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setMode('view'); await load(); if (onChanged) onChanged()
  }

  // Recode: change the asset's code, then log a 'recoded' event.
  async function saveRecode() {
    setError(null)
    const newCode = (form.new_code || '').trim()
    if (!newCode) { setError('Enter the new code.'); return }
    if (newCode === asset.asset_code) { setError('That’s the same as the current code.'); return }

    setSaving(true)
    // 1. Update the code (the unique index rejects a clash).
    const { error: upErr } = await supabase.from('assets').update({ asset_code: newCode }).eq('id', assetId)
    if (upErr) {
      setSaving(false)
      if (upErr.code === '23505' || upErr.message.toLowerCase().includes('duplicate')) {
        setError(`Code "${newCode}" is already used by another asset.`)
      } else setError(upErr.message)
      return
    }
    // 2. Log the change in history.
    await supabase.from('asset_events').insert({
      asset_id: assetId, event_type: 'recoded', status: asset.status, condition: asset.condition,
      location_id: asset.location_id, project_id: asset.project_id, holder_id: asset.holder_id,
      note: `Recoded from ${asset.asset_code || '(none)'} to ${newCode}`,
    })
    setSaving(false)
    setMode('view'); await load(); if (onChanged) onChanged()
  }

  const chosenServiceNotRequired =
    form.service_type_id && !requiredServiceIds.includes(Number(form.service_type_id))

  return (
    <>
      <div className="detail-backdrop" onClick={onClose} />
      <aside className="detail-panel">
        <div className="detail-head">
          <h3>{loading ? 'Loading…' : asset?.asset_code || 'Asset'}</h3>
          <button className="detail-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <div className="form-error" style={{ margin: '0.75rem 1.25rem' }}>{error}</div>}

        {!loading && asset && (
          <div className="detail-body">
            <section className="detail-section">
              <div className="detail-grid">
                <div><span className="detail-label">Type</span>{asset.products?.name || '—'}</div>
                <div><span className="detail-label">Condition</span>{asset.condition}</div>
                <div><span className="detail-label">Status</span>{asset.status}</div>
                <div><span className="detail-label">Position</span>{positionText(asset)}</div>
                <div><span className="detail-label">Holder</span>{asset.people?.name || '—'}</div>
              </div>

              {mode === 'view' && (
                <div className="detail-actions">
                  <button className="btn-small" onClick={() => startAction('condition')}>Change condition</button>
                  <button className="btn-small" onClick={() => startAction('move')}>Reassign</button>
                  <button className="btn-small" onClick={() => startAction('lifecycle')}>Repair / write-off</button>
                  <button className="btn-small" onClick={() => startAction('recode')}>Change code</button>
                </div>
              )}

              {mode === 'condition' && (
                <div className="detail-edit">
                  <label className="detail-label">New condition</label>
                  <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                    {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="detail-edit-actions">
                    <button onClick={saveCondition} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    <button className="btn-secondary" onClick={() => setMode('view')} disabled={saving}>Cancel</button>
                  </div>
                </div>
              )}

              {mode === 'move' && (
                <div className="detail-edit">
                  <label className="detail-label">Where</label>
                  <select value={form.where} onChange={(e) => setForm({ ...form, where: e.target.value })}>
                    <option value="store">In store (a bay)</option>
                    <option value="site">On site (a project)</option>
                  </select>
                  {form.where === 'store' ? (
                    <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                      <option value="">— choose a bay —</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                    </select>
                  ) : (
                    <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                      <option value="">— choose a site —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                    </select>
                  )}
                  <label className="detail-label">Holder</label>
                  <select value={form.holder_id} onChange={(e) => setForm({ ...form, holder_id: e.target.value })}>
                    <option value="">— no holder —</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div className="detail-edit-actions">
                    <button onClick={saveMove} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    <button className="btn-secondary" onClick={() => setMode('view')} disabled={saving}>Cancel</button>
                  </div>
                </div>
              )}

              {mode === 'lifecycle' && (
                <div className="detail-edit">
                  <p className="detail-empty">Mark this asset as:</p>
                  <div className="detail-edit-actions">
                    <button onClick={() => saveLifecycle('under_repair')} disabled={saving}>Send for repair</button>
                    <button onClick={() => saveLifecycle('written_off')} disabled={saving} style={{ background: '#b71c1c' }}>Write off</button>
                  </div>
                  <button className="btn-secondary" onClick={() => setMode('view')} disabled={saving} style={{ marginTop: '0.5rem' }}>Cancel</button>
                </div>
              )}

              {mode === 'recode' && (
                <div className="detail-edit">
                  <label className="detail-label">New code</label>
                  <input type="text" value={form.new_code} onChange={(e) => { setForm({ ...form, new_code: e.target.value }); setConfirmRecode(false) }} />
                  {!confirmRecode ? (
                    <div className="detail-edit-actions">
                      <button onClick={() => {
                        const nc = (form.new_code || '').trim()
                        if (!nc) { setError('Enter the new code.'); return }
                        if (nc === asset.asset_code) { setError('That’s the same as the current code.'); return }
                        setError(null); setConfirmRecode(true)
                      }}>Continue</button>
                      <button className="btn-secondary" onClick={() => setMode('view')}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="form-warning">
                        Change this asset's code from <strong>{asset.asset_code || '(none)'}</strong> to <strong>{form.new_code.trim()}</strong>?
                        The change will be recorded in its history.
                      </div>
                      <div className="detail-edit-actions">
                        <button onClick={saveRecode} disabled={saving}>{saving ? 'Saving…' : 'Confirm recode'}</button>
                        <button className="btn-secondary" onClick={() => setConfirmRecode(false)} disabled={saving}>Back</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="detail-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h4 className="detail-subhead" style={{ margin: 0 }}>Service & compliance</h4>
                {mode === 'view' && <button className="btn-small" onClick={() => startAction('service')}>+ Add service</button>}
              </div>

              {mode === 'service' && (
                <div className="detail-edit">
                  <label className="detail-label">Service type</label>
                  <select value={form.service_type_id} onChange={(e) => setForm({ ...form, service_type_id: e.target.value })}>
                    <option value="">— choose —</option>
                    {serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {chosenServiceNotRequired && (
                    <div className="form-warning">
                      This asset type ({asset.products?.name}) isn't set up to need this service. You can still add it, but check it's right.
                    </div>
                  )}
                  <label className="detail-label">Expiry date</label>
                  <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
                  <label className="detail-label">Last done (optional)</label>
                  <input type="date" value={form.last_done} onChange={(e) => setForm({ ...form, last_done: e.target.value })} />
                  <div className="detail-edit-actions">
                    <button onClick={saveService} disabled={saving}>{saving ? 'Saving…' : 'Save service'}</button>
                    <button className="btn-secondary" onClick={() => setMode('view')} disabled={saving}>Cancel</button>
                  </div>
                </div>
              )}

              {compliance.length === 0 ? <p className="detail-empty">No compliance dates recorded.</p> : (
                <table className="detail-table">
                  <thead><tr><th>Check</th><th>Expires</th><th>Last done</th><th></th></tr></thead>
                  <tbody>
                    {compliance.map((c, i) => {
                      const overdue = c.expiry_date && new Date(c.expiry_date) < new Date()
                      return (
                        <tr key={i} className={overdue ? 'row-critical' : ''}>
                          <td>{c.compliance_type}</td><td>{c.expiry_date || '—'}</td><td>{c.last_done || '—'}</td><td>{daysLabel(c.expiry_date)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <section className="detail-section">
              <h4 className="detail-subhead">History</h4>
              {events.length === 0 ? <p className="detail-empty">No events yet.</p> : (
                <ul className="detail-timeline">
                  {events.map((ev, i) => {
                    const place = ev.project_id ? projName(ev.project_id) : ev.location_id ? locName(ev.location_id) : null
                    const who = ev.holder_id ? personName(ev.holder_id) : null
                    return (
                      <li key={i}>
                        <span className="timeline-when">{new Date(ev.created_at).toLocaleDateString()}</span>
                        <span className="timeline-what">
                          <strong>{ev.event_type}</strong>
                          {ev.note ? `: ${ev.note}` : ''}
                          {!ev.note && place ? ` → ${place}` : ''}{!ev.note && who ? `, ${who}` : ''}{!ev.note && ev.condition ? `, ${ev.condition}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </aside>
    </>
  )
}