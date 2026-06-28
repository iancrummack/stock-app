// src/IssueReturn.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function IssueReturn({ pickForm, setPickForm, resetPick }) {
  const [products, setProducts] = useState([])
  const [projects, setProjects] = useState([])
  const [balances, setBalances] = useState({})
  const [lineProduct, setLineProduct] = useState('')
  const [lineQty, setLineQty] = useState('')
  const [status, setStatus] = useState(null)   // null | 'saving'
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    async function loadRef() {
      const [{ data: prods }, { data: projs }, { data: soh }] = await Promise.all([
        supabase.from('products').select('id, code, name').eq('tracking_type', 'quantity').order('name'),
        supabase.from('projects').select('id, code, name').eq('is_active', true).order('code'),
        supabase.from('stock_levels').select('product_id, on_hand'),
      ])
      setProducts(prods || [])
      setProjects(projs || [])
      const map = {}
      ;(soh || []).forEach((r) => { map[r.product_id] = r.on_hand })
      setBalances(map)
    }
    loadRef()
  }, [])

  const mode = pickForm.mode
  const lines = pickForm.lines

  function setMode(next) {
    setError(null); setResult(null)
    setPickForm({ ...pickForm, mode: next })
  }
  function setProject(value) {
    setResult(null)
    setPickForm({ ...pickForm, project_id: value })
  }

  function productLabel(id) {
    const p = products.find((x) => String(x.id) === String(id))
    return p ? `${p.code} — ${p.name}` : `Product ${id}`
  }

  function addLine() {
    setError(null); setResult(null)
    if (!lineProduct) { setError('Choose a product to add.'); return }
    const q = Number(lineQty)
    if (!q || q <= 0) { setError('Enter a quantity greater than zero.'); return }
    const newLine = { key: crypto.randomUUID(), product_id: Number(lineProduct), quantity: q }
    setPickForm({ ...pickForm, lines: [...lines, newLine] })
    setLineProduct('')
    setLineQty('')
  }

  function removeLine(key) {
    setResult(null)
    setPickForm({ ...pickForm, lines: lines.filter((l) => l.key !== key) })
  }

  // Edit a quantity directly in the staged list (the common correction).
  function updateQty(key, value) {
    setResult(null)
    setPickForm({
      ...pickForm,
      lines: lines.map((l) => (l.key === key ? { ...l, quantity: value === '' ? '' : Number(value) } : l)),
    })
  }

  function clearPick() {
    resetPick()
    setLineProduct(''); setLineQty(''); setError(null); setResult(null)
  }

  async function handleCommit() {
    setError(null); setResult(null)
    if (!pickForm.project_id) { setError('Choose the project first.'); return }
    if (lines.length === 0) { setError('Add at least one line.'); return }
    for (const l of lines) {
      if (!l.quantity || Number(l.quantity) <= 0) { setError('Every line needs a quantity greater than zero.'); return }
    }

    setStatus('saving')
    const { error } = await supabase.rpc('record_pick', {
      p_project_id: Number(pickForm.project_id),
      p_movement_type: mode,
      p_lines: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
    })
    setStatus(null)

    if (error) {
      setError(error.message)
    } else {
      setResult(`${mode === 'issue' ? 'Issued' : 'Returned'} ${lines.length} line${lines.length === 1 ? '' : 's'} successfully.`)
      clearPick()
    }
  }

  function lineWarn(line) {
    if (mode !== 'issue') return false
    const bal = balances[line.product_id] ?? 0
    return Number(line.quantity) > bal
  }

  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)

  return (
    <div className="pick-screen">
      <div className="pick-header">
        <div className="mode-toggle">
          <button className={mode === 'issue' ? 'mode-btn active-issue' : 'mode-btn'} onClick={() => setMode('issue')}>Issue out</button>
          <button className={mode === 'return' ? 'mode-btn active-return' : 'mode-btn'} onClick={() => setMode('return')}>Return in</button>
        </div>
        <div className={mode === 'issue' ? 'mode-banner banner-issue' : 'mode-banner banner-return'}>
          {mode === 'issue' ? 'Issuing stock OUT to a project' : 'Returning stock IN from a project'}
        </div>
        <div className="form-field">
          <label>{mode === 'issue' ? 'Project (going to)' : 'Project (coming back from)'}</label>
          <select value={pickForm.project_id} onChange={(e) => setProject(e.target.value)}>
            <option value="">— choose a project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="add-line">
        <div className="form-field grow">
          <label>Product</label>
          <select value={lineProduct} onChange={(e) => setLineProduct(e.target.value)}>
            <option value="">— choose a product —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          {lineProduct && <span className="stock-hint">In stock: {balances[Number(lineProduct)] ?? 0}</span>}
        </div>
        <div className="form-field qty">
          <label>Qty</label>
          <input type="number" min="1" value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
        </div>
        <button className="add-btn" onClick={addLine}>Add line</button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {result && <div className="form-success">{result}</div>}

      {lines.length === 0 ? (
        <p className="pick-empty">No lines yet. Build the pick above, amend as needed, then commit it all at once.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr><th>Product</th><th className="num">Qty</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className={lineWarn(line) ? 'row-soon' : ''}>
                  <td>
                    {productLabel(line.product_id)}
                    {lineWarn(line) && <span className="line-flag"> over stock</span>}
                  </td>
                  <td className="num">
                    <input
                      type="number" min="1" className="qty-inline"
                      value={line.quantity}
                      onChange={(e) => updateQty(line.key, e.target.value)}
                    />
                  </td>
                  <td className="line-actions">
                    <button className="btn-link danger" onClick={() => removeLine(line.key)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pick-summary">
            <span>{lines.length} line{lines.length === 1 ? '' : 's'}, {totalQty} item{totalQty === 1 ? '' : 's'} total</span>
            <div className="pick-commit-actions">
              <button className="btn-secondary" onClick={clearPick} disabled={status === 'saving'}>Clear pick</button>
              <button onClick={handleCommit} disabled={status === 'saving'}>
                {status === 'saving' ? 'Committing…' : `Commit ${mode === 'issue' ? 'issue' : 'return'}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}