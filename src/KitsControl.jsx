// src/KitsControl.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function KitsControl() {
  const [kits, setKits] = useState([])
  const [assetTypes, setAssetTypes] = useState([])
  const [items, setItems] = useState([])          // all kit_items
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ id: null, code: '', name: '' })
  const [status, setStatus] = useState(null)
  const [selectedKit, setSelectedKit] = useState(null)   // kit whose items we're editing
  const [addProduct, setAddProduct] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addMultiply, setAddMultiply] = useState(true)

  async function loadAll() {
    setLoading(true); setError(null)
    const [k, at, ki] = await Promise.all([
      supabase.from('kits').select('id, code, name, is_active').order('code'),
      supabase.from('products').select('id, code, name').eq('tracking_type', 'asset').order('name'),
      supabase.from('kit_items').select('id, kit_id, product_id, qty, multiply'),
    ])
    setKits(k.data || [])
    setAssetTypes(at.data || [])
    setItems(ki.data || [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function startNew() { setForm({ id: null, code: '', name: '' }); setEditing(true); setError(null) }
  function startEdit(k) { setForm({ id: k.id, code: k.code, name: k.name }); setEditing(true); setError(null) }
  function cancel() { setEditing(false); setError(null) }

  async function saveKit() {
    setError(null)
    if (!form.code.trim()) { setError('Enter a kit code (e.g. FT2).'); return }
    if (!form.name.trim()) { setError('Enter a kit name.'); return }
    const row = { code: form.code.trim(), name: form.name.trim() }
    setStatus('saving')
    const result = form.id
      ? await supabase.from('kits').update(row).eq('id', form.id)
      : await supabase.from('kits').insert(row)
    setStatus(null)
    if (result.error) setError(result.error.message)
    else { await loadAll(); setEditing(false) }
  }

  const itemsFor = (kitId) => items.filter((i) => i.kit_id === kitId)
  const productName = (id) => assetTypes.find((p) => p.id === id)?.name || `#${id}`
  const productCode = (id) => assetTypes.find((p) => p.id === id)?.code || ''

  async function addItem() {
    if (!selectedKit || !addProduct) return
    setError(null)
    const { error } = await supabase.from('kit_items').insert({
      kit_id: selectedKit.id, product_id: Number(addProduct), qty: Number(addQty) || 1, multiply: addMultiply,
    })
    if (error) setError(error.message)
    else { setAddProduct(''); setAddQty('1'); setAddMultiply(true); await loadAll() }
  }

  async function removeItem(itemId) {
    const { error } = await supabase.from('kit_items').delete().eq('id', itemId)
    if (error) setError(error.message)
    else await loadAll()
  }

  if (loading) return <p>Loading kits…</p>

  // Editing a kit's name/code
  if (editing) {
    return (
      <div className="form-card">
        <h3 className="form-title">{form.id ? 'Edit kit' : 'New kit'}</h3>
        <div className="form-field">
          <label>Kit code (used on the sheet, e.g. FT2)</label>
          <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Kit name</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Fire Trolley with WES" />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button onClick={saveKit} disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save kit'}</button>
          <button className="btn-secondary" onClick={cancel} disabled={status === 'saving'}>Cancel</button>
        </div>
      </div>
    )
  }

  // Editing a kit's contents
  if (selectedKit) {
    const kitItems = itemsFor(selectedKit.id)
    return (
      <div>
        <button className="btn-link" onClick={() => setSelectedKit(null)}>← Back to kits</button>
        <h3 className="form-title" style={{ marginTop: '0.75rem' }}>{selectedKit.code} — {selectedKit.name}</h3>
        <p className="detail-empty">The asset types this kit expands into when it appears on a pick list.</p>

        {error && <div className="form-error">{error}</div>}

        <table className="data-table" style={{ marginTop: '0.5rem' }}>
          <thead><tr><th>Asset type</th><th className="num">Qty</th><th>Scales?</th><th></th></tr></thead>
          <tbody>
            {kitItems.length === 0 ? (
              <tr><td colSpan="3" className="detail-empty">No items yet — add the asset types below.</td></tr>
            ) : kitItems.map((it) => (
              <tr key={it.id}>
                <td>{productCode(it.product_id)} — {productName(it.product_id)}</td>
                <td className="num">{it.qty}</td>
                <td>{it.multiply ? 'per kit' : 'fixed (1 per job)'}</td>
                <td><button className="btn-link danger" onClick={() => removeItem(it.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="add-line" style={{ marginTop: '1rem' }}>
          <div className="form-field grow">
            <label>Add asset type</label>
            <select value={addProduct} onChange={(e) => setAddProduct(e.target.value)}>
              <option value="">— choose —</option>
              {assetTypes.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div className="form-field qty">
            <label>Qty</label>
            <input type="number" min="1" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Scales with kit qty?</label>
            <select value={addMultiply ? 'yes' : 'no'} onChange={(e) => setAddMultiply(e.target.value === 'yes')}>
              <option value="yes">Yes — per kit</option>
              <option value="no">No — fixed (e.g. WES base)</option>
            </select>
          </div>
          <button className="add-btn" onClick={addItem}>Add</button>
        </div>
      </div>
    )
  }

  // Kit list
  return (
    <div>
      <div className="list-actions">
        <button onClick={startNew}>+ New kit</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {kits.length === 0 ? (
        <p>No kits yet. Create one, e.g. FT2 "Fire Trolley with WES".</p>
      ) : (
        <table className="data-table">
          <thead><tr><th>Code</th><th>Name</th><th className="num">Items</th><th></th></tr></thead>
          <tbody>
            {kits.map((k) => (
              <tr key={k.id}>
                <td>{k.code}</td>
                <td>{k.name}</td>
                <td className="num">{itemsFor(k.id).length}</td>
                <td>
                  <button className="btn-link" onClick={() => setSelectedKit(k)}>Contents</button>
                  {' · '}
                  <button className="btn-link" onClick={() => startEdit(k)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}