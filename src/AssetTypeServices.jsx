// src/AssetTypeServices.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function AssetTypeServices() {
  const [assetTypes, setAssetTypes] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [mappings, setMappings] = useState([])     // {product_id, service_type_id}
  const [selectedType, setSelectedType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function loadMappings() {
    const { data } = await supabase.from('asset_type_services').select('product_id, service_type_id')
    setMappings(data || [])
  }

  useEffect(() => {
    async function init() {
      setLoading(true); setError(null)
      const [{ data: types }, { data: services }] = await Promise.all([
        supabase.from('products').select('id, code, name').eq('tracking_type', 'asset').order('name'),
        supabase.from('service_types').select('id, name').order('name'),
      ])
      setAssetTypes(types || [])
      setServiceTypes(services || [])
      await loadMappings()
      setLoading(false)
    }
    init()
  }, [])

  // Is this service required for the selected asset type?
  function isRequired(serviceId) {
    return mappings.some((m) => String(m.product_id) === String(selectedType) && m.service_type_id === serviceId)
  }

  async function toggle(serviceId) {
    if (!selectedType) return
    setBusy(true); setError(null)
    const pid = Number(selectedType)
    if (isRequired(serviceId)) {
      // Remove the requirement.
      const { error } = await supabase.from('asset_type_services')
        .delete().eq('product_id', pid).eq('service_type_id', serviceId)
      if (error) setError(error.message)
    } else {
      // Add the requirement.
      const { error } = await supabase.from('asset_type_services')
        .insert({ product_id: pid, service_type_id: serviceId })
      if (error) setError(error.message)
    }
    await loadMappings()
    setBusy(false)
  }

  if (loading) return <p>Loading…</p>

  return (
    <div className="form-card" style={{ maxWidth: 520 }}>
      <div className="form-field">
        <label>Asset type</label>
        <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
          <option value="">— choose an asset type —</option>
          {assetTypes.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
        </select>
      </div>

      {error && <div className="form-error">{error}</div>}

      {selectedType && (
        <div>
          <p className="detail-empty" style={{ marginBottom: '0.5rem' }}>Tick the services this asset type requires:</p>
          {serviceTypes.length === 0 ? (
            <p className="detail-empty">No service types defined yet — add some on the Service types screen.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {serviceTypes.map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={isRequired(s.id)}
                    onChange={() => toggle(s.id)}
                    disabled={busy}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}