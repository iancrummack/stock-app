// src/ProductsControl.jsx
import { useState, useEffect, useMemo } from 'react'
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
  is_key_item: false,
  min_level: '',
}

export default function ProductsControl() {
  const [products, setProducts] = useState([])
  const [units, setUnits] = useState([])
  const [owners, setOwners] = useState([])
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState(null)

  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')   // 'name' | 'position'

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('id, code, name, tracking_type, unit_id, owner_id, category_id, default_location_id, description, is_key_item, min_level')
      .order('name')
    if (error) setError(error.message)
    else setProducts(data || [])
  }

  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      setError(null)
      const [prods, u, o, c, l] = await Promise.all([
        supabase.from('products').select('id, code, name, tracking_type, unit_id, owner_id, category_id, default_location_id, description, is_key_item, min_level').order('name'),
        supabase.from('units').select('id, name').order('name'),
        supabase.from('owners').select('id, name:owner').order('owner'),
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('locations').select('id, code, name').order('name'),
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

  function startNew() { setForm(EMPTY); setEditing(true); setError(null) }

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
      is_key_item: !!p.is_key_item,
      min_level: p.min_level ?? '',
    })
    setEditing(true)
    setError(null)
  }

  function cancel() { setEditing(false); setForm(EMPTY); setError(null) }
  function setField(field, value) { setForm({ ...form, [field]: value }) }

  async function handleSave() {
    setError(null)
    if (!form.code.trim()) { setError('Please enter a product code.'); return }
    if (!form.name.trim()) { setError('Please enter a product name.'); return }

    const isAsset = form.tracking_type === 'asset'
    const row = {
      code: form.code.trim(),
      name: form.name.trim(),
      tracking_type: form.tracking_type,
      unit_id: isAsset || !form.unit_id ? null : Number(form.unit_id),
      owner_id: form.owner_id ? Number(form.owner_id) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
      default_location_id: isAsset || !form.default_location_id ? null : Number(form.default_location_id),
      description: form.description.trim() || null,
      is_key_item: !!form.is_key_item,
      min_level: form.min_level === '' ? null : Number(form.min_level),
    }

    setStatus('saving')
    const result = form.id
      ? await supabase.from('products').update(row).eq('id', form.id)
      : await supabase.from('products').insert(row)
    setStatus(null)

    if (result.error) setError(result.error.message)
    else { await loadProducts(); setEditing(false); setForm(EMPTY) }
  }

  const unitName = (id) => units.find((x) => x.id === id)?.name || '—'
  const ownerName = (id) => owners.find((x) => x.id === id)?.name || '—'
  const categoryName = (id) => categories.find((x) => x.id === id)?.name || '—'
  const locationName = (id) => {
    const l = locations.find((x) => x.id === id)
    return l ? `${l.code} — ${l.name}` : '—'
  }
  const locationSortKey = (id) => id ?? Number.MAX_SAFE_INTEGER

  // Filter then sort the list.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = products.filter((p) => {
      if (typeFilter !== 'all' && p.tracking_type !== typeFilter) return false
      if (categoryFilter && String(p.category_id) !== String(categoryFilter)) return false
      if (q) {
        const cat = categoryName(p.category_id).toLowerCase()
        const hay = `${p.code || ''} ${p.name || ''} ${cat}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    list = list.slice().sort((a, b) => {
      if (sortBy === 'position') {
        return locationSortKey(a.default_location_id) - locationSortKey(b.default_location_id)
      }
      return (a.name || '').localeCompare(b.name || '')
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, typeFilter, categoryFilter, search, sortBy, categories])

  if (loading) return <p>Loading products…</p>

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
          <label>
            <input
              type="checkbox"
              checked={form.is_key_item}
              onChange={(e) => setField('is_key_item', e.target.checked)}
            />{' '}
            Key item (show on the dashboard watchlist)
          </label>
        </div>

        {form.is_key_item && (
          <div className="form-field">
            <label>Minimum level</label>
            <input
              type="number" min="0" value={form.min_level}
              onChange={(e) => setField('min_level', e.target.value)}
              placeholder="the level below which this goes red"
            />
            <div className="form-warning" style={{ marginTop: '0.25rem' }}>
              Without a minimum, the dashboard can only show the number, not whether it's a problem.
            </div>
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

  return (
    <div>
      <div className="list-actions">
        <button onClick={startNew}>+ New product</button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          className="filter-search"
          placeholder="Search name, code or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-row">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All products</option>
            <option value="quantity">Consumables only</option>
            <option value="asset">Assets only</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Category: all</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="position">Sort: Position (route order)</option>
          </select>
        </div>
      </div>

      <div className="filter-summary">
        <span>{visible.length} of {products.length}</span>
      </div>

      {error && <div className="form-error">{error}</div>}
      {visible.length === 0 ? (
        <p>No products to show.</p>
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
              <th>Position</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{p.tracking_type}</td>
                <td>{p.tracking_type === 'asset' ? '—' : unitName(p.unit_id)}</td>
                <td>{ownerName(p.owner_id)}</td>
                <td>{categoryName(p.category_id)}</td>
                <td>{p.tracking_type === 'asset' ? '—' : locationName(p.default_location_id)}</td>
                <td><button className="btn-link" onClick={() => startEdit(p)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}