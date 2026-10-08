// src/IssueUniform.jsx
// Uniform is charged to a person, never a project. The person must be chosen
// before any item can be added, and the database refuses uniform on a project.
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const costLabel = (v) => `£${Number(v || 0).toFixed(2)}`

export default function IssueUniform() {
  const [people, setPeople] = useState([])
  const [products, setProducts] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)

  const [personId, setPersonId] = useState('')
  const [lines, setLines] = useState([])
  const [lineProduct, setLineProduct] = useState('')
  const [lineQty, setLineQty] = useState('1')
  const [note, setNote] = useState('')

  const [status, setStatus] = useState(null)   // null | 'saving'
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function loadBalances() {
    const { data } = await supabase.from('stock_levels').select('product_id, on_hand')
    const map = {}
    ;(data || []).forEach((r) => { map[r.product_id] = r.on_hand })
    setBalances(map)
  }

  useEffect(() => {
    async function load() {
      const [pe, pr] = await Promise.all([
        supabase.from('people').select('id, name, role').eq('is_active', true).order('name'),
        supabase
          .from('products')
          .select('id, code, name, unit_cost, categories!inner(charge_to_person)')
          .eq('categories.charge_to_person', true)
          .order('name'),
      ])
      if (pe.error || pr.error) setError((pe.error || pr.error).message)
      setPeople(pe.data || [])
      setProducts(pr.data || [])
      await loadBalances()
      setLoading(false)
    }
    load()
  }, [])

  const person = people.find((p) => String(p.id) === String(personId))
  const productById = (id) => products.find((p) => String(p.id) === String(id))

  function choosePerson(value) {
    setError(null); setResult(null)
    // Changing person with lines staged would silently move the charge, so clear them.
    if (lines.length > 0 && value !== personId) {
      if (!window.confirm('Changing the person clears the items you have added. Carry on?')) return
      setLines([])
    }
    setPersonId(value)
  }

  function addLine() {
    setError(null); setResult(null)
    if (!personId) { setError('Choose the person first.'); return }
    if (!lineProduct) { setError('Choose an item to add.'); return }
    const q = Number(lineQty)
    if (!q || q <= 0 || !Number.isInteger(q)) { setError('Enter a whole quantity above zero.'); return }
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product_id === Number(lineProduct))
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: Number(next[idx].quantity) + q }
        return next
      }
      return [...prev, { key: crypto.randomUUID(), product_id: Number(lineProduct), quantity: q }]
    })
    setLineProduct(''); setLineQty('1')
  }

  function updateQty(key, value) {
    setResult(null)
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: value === '' ? '' : Number(value) } : l)))
  }
  function removeLine(key) { setLines((prev) => prev.filter((l) => l.key !== key)) }

  function clearAll() {
    setPersonId(''); setLines([]); setLineProduct(''); setLineQty('1'); setNote(''); setError(null)
  }

  const lineCost = (l) => Number(productById(l.product_id)?.unit_cost || 0) * (Number(l.quantity) || 0)
  const totalCost = lines.reduce((s, l) => s + lineCost(l), 0)
  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
  const overStock = (l) => Number(l.quantity) > (balances[l.product_id] ?? 0)

  async function handleCommit() {
    setError(null); setResult(null)
    if (!personId) { setError('Choose the person first.'); return }
    if (lines.length === 0) { setError('Add at least one item.'); return }
    if (lines.some((l) => !l.quantity || Number(l.quantity) <= 0)) { setError('Every line needs a quantity above zero.'); return }

    setStatus('saving')
    const { error } = await supabase.rpc('issue_uniform', {
      p_person_id: Number(personId),
      p_lines: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
      p_note: note.trim() || null,
    })
    setStatus(null)

    if (error) { setError(error.message); return }
    setResult(`Issued ${totalQty} item${totalQty === 1 ? '' : 's'} to ${person?.name}, ${costLabel(totalCost)} charged.`)
    clearAll()
    loadBalances()
  }

  if (loading) return <p>Loading…</p>

  return (
    <div className="pick-screen">
      <div className="pick-header">
        <div className="mode-banner banner-issue">Issuing uniform to a person, charged to them, never to a project</div>
        <div className="form-field">
          <label>Person (choose first)</label>
          <select value={personId} onChange={(e) => choosePerson(e.target.value)}>
            <option value="">— choose a person —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` (${p.role})` : ''}</option>)}
          </select>
          <span className="stock-hint">Not on the list? Add them in Admin › People.</span>
        </div>
      </div>

      {!personId ? (
        <p className="pick-empty">Choose the person above to start adding uniform.</p>
      ) : (
        <>
          <div className="add-line">
            <div className="form-field grow">
              <label>Uniform item</label>
              <select value={lineProduct} onChange={(e) => setLineProduct(e.target.value)}>
                <option value="">— choose an item —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.unit_cost == null ? ' (cost not set)' : ` · ${costLabel(p.unit_cost)}`}
                  </option>
                ))}
              </select>
              {lineProduct && <span className="stock-hint">In stock: {balances[Number(lineProduct)] ?? 0}</span>}
            </div>
            <div className="form-field qty">
              <label>Qty</label>
              <input type="number" min="1" value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
            </div>
            <button className="add-btn" onClick={addLine}>Add line</button>
          </div>

          <div className="form-field">
            <label>Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. starter kit, replacement for damaged" />
          </div>
        </>
      )}

      {error && <div className="form-error">{error}</div>}
      {result && <div className="form-success">{result}</div>}

      {lines.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr><th>Item</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Charge</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = productById(l.product_id)
                return (
                  <tr key={l.key} className={overStock(l) ? 'row-soon' : ''}>
                    <td>
                      {p ? `${p.code} — ${p.name}` : `Product ${l.product_id}`}
                      {overStock(l) && <span className="line-flag"> over stock</span>}
                      {p && p.unit_cost == null && <span className="line-flag"> cost not set, charges £0</span>}
                    </td>
                    <td className="num">
                      <input type="number" min="1" className="qty-inline" value={l.quantity}
                        onChange={(e) => updateQty(l.key, e.target.value)} />
                    </td>
                    <td className="num">{p?.unit_cost == null ? '—' : costLabel(p.unit_cost)}</td>
                    <td className="num">{costLabel(lineCost(l))}</td>
                    <td className="line-actions">
                      <button className="btn-link danger" onClick={() => removeLine(l.key)}>Remove</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="pick-summary">
            <span>{totalQty} item{totalQty === 1 ? '' : 's'}, {costLabel(totalCost)} to charge</span>
            <div className="pick-commit-actions">
              <button className="btn-secondary" onClick={clearAll} disabled={status === 'saving'}>Clear</button>
              <button onClick={handleCommit} disabled={status === 'saving'}>
                {status === 'saving' ? 'Issuing…' : `Issue and charge to ${person?.name}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
