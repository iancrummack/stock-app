// src/ProductsControl.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const EMPTY = {
  id: null,
  code: '',
  name: '',
  tracking_type: 'quantity',
  unit_id: '',
  owner_id: '',
  category_id: '',
  default_location_id: '',
  description: '',
}

export default function ProductsControl() {
  const [products, setProducts] = useState([])
  const [units, setUnits] = useState([])
  const [owners, setOwners] = useState([])
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(false)   // showing the form?
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState(null)       // null | 'saving'

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('id, code, name, tracking_type, unit_id, owner_id, category_id, default_location_id, description')
      .order('name')
    if (error) setError(error.message)
    else setProducts(data || [])
  }

  // Load the products list and every dropdown source once, on open.
  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      setError(null)
      const [prods, u, o, c, l] = await Promise.all([
        supabase.from('products').select('id, code, name, tracking_type, unit_id, owner_id, category_id, default_location_id, description').order('name'),
        supabase.from('units').select('id, name').order('name'),
        supabase.from('owners').select('id, name').order('name'),
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('locations').select('id, code, name').order('code'),
      ])
      if (prods.error) setError(prods.error.message)
      else setProducts(prods.data || [])
      setUnits(u.data || [])
      setOwners(o.data || [])
      setCategories(c.data || [])
      setLocations(l.data || [])
      setLoading(false)
    }
    loadAll()
  }, [])

  function startNew() {
    setForm(EMPTY)
    setEditing(true)
    setError(null)
  }

  function startEdit(p) {
    setForm({
      id: p.id,
      code: p.code || '',
      name: p.name || '',
      tracking_type: p.tracking_type || 'quantity',
      unit_id: p.unit_id ?? '',
      owner_id: p.owner_id ?? '',
      category_id: p.category_id ?? '',
      default_location_id: p.default_location_id ?? '',
      description: p.description || '',
    })
    setEditing(true)
    setError(null)
  }

  function cancel() {
    setEditing(false)
    setForm(EMPTY)
    setError(null)
  }

  function setField(field, value) {
    setForm({ ...form, [field]: value })
  }

  async function handleSave() {
    setError(null)
    if (!form.code.trim()) { setError('Please enter a product code.'); return }
    if (!form.name.trim()) { setError('Please enter a product name.'); return }

    const isAsset = form.tracking_type === 'asset'

    // Asset products carry no unit and no home bay — those are consumable concepts.
    const row = {
      code: form.code.trim(),
      name: form.name.trim(),
      tracking_type: form.tracking_type,
      unit_id: isAsset || !form.unit_id ? null : Number(form.unit_id),
      owner_id: form.owner_id ? Number(form.owner_id) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
      default_location_id: isAsset || !form.default_location_id ? null : Number(form.default_location_id),
      description: form.description.trim() || null,
    }

    setStatus('saving')
    // Has an id → update that row. No id → insert a new one.
    const result = form.id
      ? await supabase.from('products').update(row).eq('id', form.id)
      : await supabase.from('products').insert(row)
    setStatus(null)

    if (result.error) {
      setError(result.error.message)
    } else {
      await loadProducts()
      setEditing(false)
      setForm(EMPTY)
    }
  }

  // Show names rather than raw ids in the list.
  const unitName = (id) => units.find((x) => x.id === id)?.name || '—'
  const ownerName = (id) => owners.find((x) => x.id === id)?.name || '—'
  const categoryName = (id) => categories.find((x) => x.id === id)?.name || '—'

  if (loading) return <p>Loading products…</p>

  // ---- Create / edit form ----
  if (editing) {
    const isAsset = form.tracking_type === 'asset'
    return (
      <div className="form-card">
        <h3 className="form-title">{form.id ? 'Edit product' : 'New product'}</h3>

        <div className="form-field">
          <label>Code</label>
          <input type="text" value={form.code} onChange={(e) => setField('code', e.target.value)} />
        </div>

        <div className="form-field">
          <label>Name</label>
          <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </div>

        <div className="form-field">
          <label>Tracking type</label>
          <select value={form.tracking_type} onChange={(e) => setField('tracking_type', e.target.value)}>
            <option value="quantity">quantity (counted stock)</option>
            <option value="asset">asset (individual unit)</option>
          </select>
        </div>

        {!isAsset && (
          <div className="form-field">
            <label>Unit</label>
            <select value={form.unit_id} onChange={(e) => setField('unit_id', e.target.value)}>
              <option value="">— none —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        <div className="form-field">
          <label>Owner</label>
          <select value={form.owner_id} onChange={(e) => setField('owner_id', e.target.value)}>
            <option value="">— none —</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        <div className="form-field">
          <label>Category</label>
          <select value={form.category_id} onChange={(e) => setField('category_id', e.target.value)}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {!isAsset && (
          <div className="form-field">
            <label>Home bay (default location)</label>
            <select value={form.default_location_id} onChange={(e) => setField('default_location_id', e.target.value)}>
              <option value="">— none —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
        )}

        <div className="form-field">
          <label>Description</label>
          <input type="text" value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button onClick={handleSave} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save product'}
          </button>
          <button className="btn-secondary" onClick={cancel} disabled={status === 'saving'}>Cancel</button>
        </div>
      </div>
    )
  }

  // ---- Products list ----
  return (
    <div>
      <div className="list-actions">
        <button onClick={startNew}>+ New product</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {products.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Unit</th>
              <th>Owner</th>
              <th>Category</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{p.tracking_type}</td>
                <td>{p.tracking_type === 'asset' ? '—' : unitName(p.unit_id)}</td>
                <td>{ownerName(p.owner_id)}</td>
                <td>{categoryName(p.category_id)}</td>
                <td><button className="btn-link" onClick={() => startEdit(p)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}