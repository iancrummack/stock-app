// src/CreatePick.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const newKey = () => crypto.randomUUID()

export default function CreatePick() {
  const [projects, setProjects] = useState([])
  const [products, setProducts] = useState([])
  const [kits, setKits] = useState([])
  const [kitItems, setKitItems] = useState({})   // { kit_id: [ {qty, multiply, products{...}} ] }
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)

  // Pick header
  const [projectId, setProjectId] = useState('')
  const [collectionDate, setCollectionDate] = useState('')
  const [holderId, setHolderId] = useState('')
  const [note, setNote] = useState('')

  // Staged lines, held in React until Create is pressed
  const [lines, setLines] = useState([])

  // Stock adder
  const [search, setSearch] = useState('')
  const [productId, setProductId] = useState('')
  const [productQty, setProductQty] = useState('1')

  // Kit adder
  const [kitId, setKitId] = useState('')
  const [kitQty, setKitQty] = useState('1')

  // Bespoke adder
  const [bDesc, setBDesc] = useState('')
  const [bQty, setBQty] = useState('1')
  const [bPo, setBPo] = useState('')
  const [bMethod, setBMethod] = useState('delivered')
  const [bSupplier, setBSupplier] = useState('')
  const [bLocation, setBLocation] = useState('')

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    async function load() {
      const [pr, pd, kt, ki, pe] = await Promise.all([
        supabase.from('projects').select('id, code, name').order('code'),
        supabase.from('products').select('id, code, name, tracking_type').order('name'),
        supabase.from('kits').select('id, code, name').order('code'),
        supabase.from('kit_items').select('kit_id, qty, multiply, product_id, products(id, code, name, tracking_type)'),
        supabase.from('people').select('id, name, can_hold_assets, is_active').eq('is_active', true).order('name'),
      ])
      setProjects(pr.data || [])
      setProducts(pd.data || [])
      setKits(kt.data || [])
      const grouped = {}
      for (const item of (ki.data || [])) {
        if (!grouped[item.kit_id]) grouped[item.kit_id] = []
        grouped[item.kit_id].push(item)
      }
      setKitItems(grouped)
      setPeople(pe.data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Merge a stock line into the staged list, same product means one line.
  function mergeStock(prod, qty, fromKit) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.kind === 'stock' && l.product_id === prod.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: Number(next[idx].qty) + Number(qty) }
        return next
      }
      return [...prev, {
        key: newKey(),
        kind: 'stock',
        product_id: prod.id,
        code: prod.code,
        name: prod.name,
        tracking_type: prod.tracking_type,
        qty: Number(qty),
        fromKit: fromKit || null,
        ticked: false,
      }]
    })
  }

  function addProduct() {
    setError(null)
    if (!productId) { setError('Choose a product to add.'); return }
    const q = Number(productQty)
    if (!q || q <= 0) { setError('Enter a valid quantity.'); return }
    const prod = products.find((p) => String(p.id) === String(productId))
    if (!prod) { setError('That product could not be found.'); return }
    mergeStock(prod, q, null)
    setProductId(''); setProductQty('1'); setSearch('')
  }

  function addKit() {
    setError(null)
    if (!kitId) { setError('Choose a kit to add.'); return }
    const q = Number(kitQty)
    if (!q || q <= 0) { setError('Enter a valid quantity.'); return }
    const kit = kits.find((k) => String(k.id) === String(kitId))
    const comps = kitItems[Number(kitId)] || []
    if (comps.length === 0) { setError(`Kit "${kit?.code}" has no items defined.`); return }
    for (const c of comps) {
      if (!c.products) continue
      // Fixed components (multiply = false) do not scale with the kit quantity.
      const lineQty = c.multiply === false ? Number(c.qty) : Number(c.qty) * q
      mergeStock(c.products, lineQty, kit.code)
    }
    setKitId(''); setKitQty('1')
  }

  function addBespoke() {
    setError(null)
    if (!bDesc.trim()) { setError('Enter a description for the bespoke item.'); return }
    const q = Number(bQty)
    if (!q || q <= 0) { setError('Enter a valid quantity.'); return }
    setLines((prev) => [...prev, {
      key: newKey(),
      kind: 'bespoke',
      description: bDesc.trim(),
      qty: q,
      po_number: bPo.trim() || null,
      delivery_method: bMethod,
      supplier_name: bMethod === 'collect_local' ? (bSupplier.trim() || null) : null,
      supplier_location: bMethod === 'collect_local' ? (bLocation.trim() || null) : null,
      ticked: false,
    }])
    setBDesc(''); setBQty('1'); setBPo(''); setBMethod('delivered'); setBSupplier(''); setBLocation('')
  }

  function removeLine(key) { setLines((prev) => prev.filter((l) => l.key !== key)) }
  function setQty(key, value) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, qty: value } : l))
  }
  function toggleTick(key) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, ticked: !l.ticked } : l))
  }

  function resetAll() {
    setProjectId(''); setCollectionDate(''); setHolderId(''); setNote('')
    setLines([]); setError(null)
    setSearch(''); setProductId(''); setProductQty('1')
    setKitId(''); setKitQty('1')
    setBDesc(''); setBQty('1'); setBPo(''); setBMethod('delivered'); setBSupplier(''); setBLocation('')
  }

  async function createPick() {
    setError(null)
    if (!projectId) { setError('Choose a project. Every pick belongs to a job.'); return }
    if (lines.length === 0) { setError('Add at least one item, from stock or bespoke.'); return }
    const bad = lines.find((l) => !Number(l.qty) || Number(l.qty) <= 0)
    if (bad) { setError('Every line needs a quantity above zero.'); return }

    setCreating(true)
    const { data: pick, error: pErr } = await supabase.from('picks').insert({
      project_id: Number(projectId),
      collection_date: collectionDate || null,
      status: 'open',
      source: 'manual',
      holder_id: holderId ? Number(holderId) : null,
      note: note.trim() || null,
    }).select().single()
    if (pErr) { setError(pErr.message); setCreating(false); return }

    const rows = lines.map((l) => l.kind === 'stock'
      ? {
          pick_id: pick.id, product_id: l.product_id, is_bespoke: false,
          qty: Number(l.qty), picked_qty: 0, line_status: 'open',
        }
      : {
          pick_id: pick.id, product_id: null, is_bespoke: true,
          description: l.description, qty: Number(l.qty), picked_qty: 0, line_status: 'open',
          po_number: l.po_number, delivery_method: l.delivery_method,
          supplier_name: l.supplier_name, supplier_location: l.supplier_location,
        })

    const { error: lErr } = await supabase.from('pick_lines').insert(rows)
    setCreating(false)
    if (lErr) { setError('Pick created but its lines failed: ' + lErr.message); return }

    const proj = projects.find((p) => String(p.id) === String(projectId))
    setDone({ pickId: pick.id, lines: rows.length, job: proj ? `${proj.code} — ${proj.name}` : '' })
    resetAll()
  }

  if (loading) return <p>Loading…</p>

  const filtered = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products

  const stockLines = lines.filter((l) => l.kind === 'stock')
  const bespokeLines = lines.filter((l) => l.kind === 'bespoke')
  const holder = people.find((p) => String(p.id) === String(holderId))

  if (done) {
    return (
      <div className="form-card">
        <div className="form-success">
          Pick created for {done.job || 'the job'} with {done.lines} {done.lines === 1 ? 'line' : 'lines'}.
          It is now in the Pick lists screen, ready to be picked.
        </div>
        <div className="form-actions">
          <button onClick={() => setDone(null)}>Create another pick</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="form-card" style={{ maxWidth: 640 }}>
        <h3 className="form-title">Pick details</h3>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
          For orders that arrive by phone, email or message rather than on the master list.
          Add items from stock, bespoke buy-ins, or both.
        </p>

        <div className="form-field">
          <label>Project (required)</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— choose project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>

        <div className="form-field">
          <label>Collection date</label>
          <input type="date" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} />
        </div>

        <div className="form-field">
          <label>Holder (site manager) — assigned to all assets on this job</label>
          <select value={holderId} onChange={(e) => setHolderId(e.target.value)}>
            <option value="">— choose holder —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {holder && !holder.can_hold_assets && (
            <div className="form-warning">This person isn't set up to hold assets. You can still assign, but check it's right.</div>
          )}
        </div>

        <div className="form-field">
          <label>Note (who asked, why, anything odd)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Dave rang Monday, needed on site Friday" />
        </div>
      </div>

      {/* ---- Adders ---- */}
      <div className="form-card" style={{ marginTop: '1rem', maxWidth: 640 }}>
        <h4 className="form-title" style={{ margin: 0 }}>Add from stock</h4>
        <div className="form-field">
          <label>Search products</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="type to narrow the list" />
        </div>
        <div className="form-field">
          <label>Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">— choose product —</option>
            {filtered.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Quantity</label>
          <input type="number" min="1" value={productQty} onChange={(e) => setProductQty(e.target.value)} />
        </div>
        <div className="form-actions">
          <button onClick={addProduct}>Add item</button>
        </div>
      </div>

      <div className="form-card" style={{ marginTop: '1rem', maxWidth: 640 }}>
        <h4 className="form-title" style={{ margin: 0 }}>Add a kit</h4>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
          Kits expand into their component items, exactly as they do on an uploaded list.
        </p>
        <div className="form-field">
          <label>Kit</label>
          <select value={kitId} onChange={(e) => setKitId(e.target.value)}>
            <option value="">— choose kit —</option>
            {kits.map((k) => <option key={k.id} value={k.id}>{k.code} — {k.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Quantity</label>
          <input type="number" min="1" value={kitQty} onChange={(e) => setKitQty(e.target.value)} />
        </div>
        <div className="form-actions">
          <button onClick={addKit}>Add kit</button>
        </div>
      </div>

      <div className="form-card" style={{ marginTop: '1rem', maxWidth: 640 }}>
        <h4 className="form-title" style={{ margin: 0 }}>Add a bespoke item</h4>
        <div className="form-field">
          <label>Description</label>
          <input type="text" value={bDesc} onChange={(e) => setBDesc(e.target.value)} placeholder="e.g. 2 rolls Denso tape" />
        </div>
        <div className="form-field">
          <label>Quantity</label>
          <input type="number" min="1" value={bQty} onChange={(e) => setBQty(e.target.value)} />
        </div>
        <div className="form-field">
          <label>PO number (optional)</label>
          <input type="text" value={bPo} onChange={(e) => setBPo(e.target.value)} placeholder="if known" />
        </div>
        <div className="form-field">
          <label>Supply</label>
          <select value={bMethod} onChange={(e) => setBMethod(e.target.value)}>
            <option value="delivered">Delivered in</option>
            <option value="collect_local">Collect locally</option>
          </select>
        </div>
        {bMethod === 'collect_local' && (
          <>
            <div className="form-field">
              <label>Supplier</label>
              <input type="text" value={bSupplier} onChange={(e) => setBSupplier(e.target.value)} placeholder="e.g. Travis Perkins" />
            </div>
            <div className="form-field">
              <label>Location</label>
              <input type="text" value={bLocation} onChange={(e) => setBLocation(e.target.value)} placeholder="e.g. Corby" />
            </div>
          </>
        )}
        <div className="form-actions">
          <button onClick={addBespoke}>Add bespoke item</button>
        </div>
      </div>

      {/* ---- Staged lines ---- */}
      <div style={{ marginTop: '1.5rem' }}>
        <h4 className="detail-subhead">Stock items ({stockLines.length})</h4>
        {stockLines.length === 0 ? (
          <p className="detail-empty">No stock items added yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th></th><th>Code</th><th>Product</th><th>Kind</th><th>From kit</th><th className="num">Qty</th><th></th></tr>
            </thead>
            <tbody>
              {stockLines.map((l) => (
                <tr key={l.key} className={l.ticked ? 'row-done' : ''}>
                  <td><input type="checkbox" checked={l.ticked} onChange={() => toggleTick(l.key)} title="Just a visual tick, nothing is saved" /></td>
                  <td>{l.code || '—'}</td>
                  <td>{l.name}</td>
                  <td>{l.tracking_type === 'asset' ? 'asset' : 'consumable'}</td>
                  <td>{l.fromKit || '—'}</td>
                  <td className="num">
                    <input type="number" min="1" className="qty-inline" value={l.qty}
                      onChange={(e) => setQty(l.key, e.target.value)} />
                  </td>
                  <td><button className="btn-link danger" onClick={() => removeLine(l.key)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h4 className="detail-subhead" style={{ marginTop: '1.5rem' }}>Bespoke items ({bespokeLines.length})</h4>
        {bespokeLines.length === 0 ? (
          <p className="detail-empty">No bespoke items added yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th></th><th>Description</th><th>PO</th><th>Supply</th><th className="num">Qty</th><th></th></tr>
            </thead>
            <tbody>
              {bespokeLines.map((l) => (
                <tr key={l.key} className={l.ticked ? 'row-done' : ''}>
                  <td><input type="checkbox" checked={l.ticked} onChange={() => toggleTick(l.key)} title="Just a visual tick, nothing is saved" /></td>
                  <td>{l.description}</td>
                  <td>{l.po_number || '—'}</td>
                  <td>{l.delivery_method === 'collect_local'
                    ? `Collect${[l.supplier_name, l.supplier_location].filter(Boolean).length ? ': ' + [l.supplier_name, l.supplier_location].filter(Boolean).join(', ') : ' locally'}`
                    : 'Delivered'}</td>
                  <td className="num">
                    <input type="number" min="1" className="qty-inline" value={l.qty}
                      onChange={(e) => setQty(l.key, e.target.value)} />
                  </td>
                  <td><button className="btn-link danger" onClick={() => removeLine(l.key)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <div className="form-error" style={{ marginTop: '1rem' }}>{error}</div>}

      <div className="pick-commit-actions" style={{ marginTop: '1rem' }}>
        <button onClick={createPick} disabled={creating || lines.length === 0}>
          {creating ? 'Creating…' : `Create pick (${lines.length} ${lines.length === 1 ? 'line' : 'lines'})`}
        </button>
        <button className="btn-secondary" onClick={resetAll} disabled={creating}>Start over</button>
      </div>
    </div>
  )
}