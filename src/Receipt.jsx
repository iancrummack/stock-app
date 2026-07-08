// src/Receipt.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Receipt({ receiptForm, setReceiptForm, resetReceipt }) {
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [lineProduct, setLineProduct] = useState('')
  const [lineQty, setLineQty] = useState('')
  const [status, setStatus] = useState(null)   // null | 'saving'
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    async function loadRef() {
      const [{ data: prods }, { data: locs }] = await Promise.all([
        supabase.from('products')
          .select('id, code, name, default_location_id')
          .eq('tracking_type', 'quantity')
          .order('name'),
        supabase.from('locations').select('id, code, name'),
      ])
      setProducts(prods || [])
      setLocations(locs || [])
    }
    loadRef()
  }, [])

  const lines = receiptForm.lines

  function setHeader(field, value) {
    setResult(null)
    setReceiptForm({ ...receiptForm, [field]: value })
  }

  function productLabel(id) {
    const p = products.find((x) => String(x.id) === String(id))
    return p ? `${p.code} — ${p.name}` : `Product ${id}`
  }

  // The home bay for a product, or null if none set.
  function homeBay(productId) {
    const p = products.find((x) => x.id === productId)
    if (!p || !p.default_location_id) return null
    const l = locations.find((x) => x.id === p.default_location_id)
    return l ? `${l.code} — ${l.name}` : null
  }

  function addLine() {
    setError(null); setResult(null)
    if (!lineProduct) { setError('Choose a product to add.'); return }
    const q = Number(lineQty)
    if (!q || q <= 0) { setError('Enter a quantity greater than zero.'); return }
    const newLine = { key: crypto.randomUUID(), product_id: Number(lineProduct), quantity: q }
    setReceiptForm({ ...receiptForm, lines: [...lines, newLine] })
    setLineProduct('')
    setLineQty('')
  }

  function removeLine(key) {
    setResult(null)
    setReceiptForm({ ...receiptForm, lines: lines.filter((l) => l.key !== key) })
  }

  function updateQty(key, value) {
    setResult(null)
    setReceiptForm({
      ...receiptForm,
      lines: lines.map((l) => (l.key === key ? { ...l, quantity: value === '' ? '' : Number(value) } : l)),
    })
  }

  function clearReceipt() {
    resetReceipt()
    setLineProduct(''); setLineQty(''); setError(null); setResult(null)
  }

  async function handleCommit() {
    setError(null); setResult(null)
    if (lines.length === 0) { setError('Add at least one line.'); return }
    for (const l of lines) {
      if (!l.quantity || Number(l.quantity) <= 0) { setError('Every line needs a quantity greater than zero.'); return }
    }

    setStatus('saving')
    const { error } = await supabase.rpc('record_receipt', {
      p_our_order_ref: receiptForm.our_order_ref || '',
      p_supplier_order_ref: receiptForm.supplier_order_ref || '',
      p_lines: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
    })
    setStatus(null)

    if (error) {
      setError(error.message)
    } else {
      setResult(`Received ${lines.length} line${lines.length === 1 ? '' : 's'} successfully.`)
      clearReceipt()
    }
  }

  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)

  return (
    <div className="pick-screen">
      <div className="pick-header">
        <div className="mode-banner banner-return">Receiving stock IN to the warehouse</div>
        <div className="form-field">
          <label>Our order ref</label>
          <input type="text" value={receiptForm.our_order_ref} onChange={(e) => setHeader('our_order_ref', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Supplier order ref</label>
          <input type="text" value={receiptForm.supplier_order_ref} onChange={(e) => setHeader('supplier_order_ref', e.target.value)} />
        </div>
      </div>

      <div className="add-line">
        <div className="form-field grow">
          <label>Product</label>
          <select value={lineProduct} onChange={(e) => setLineProduct(e.target.value)}>
            <option value="">— choose a product —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {lineProduct && (
            homeBay(Number(lineProduct))
              ? <span className="stock-hint">Goes to: {homeBay(Number(lineProduct))}</span>
              : <span className="line-flag">No home bay set — will record without a location</span>
          )}
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
        <p className="pick-empty">No lines yet. Enter the order refs once above, build the delivery, amend as needed, then commit it all at once.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr><th>Product</th><th>Goes to</th><th className="num">Qty</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const bay = homeBay(line.product_id)
                return (
                  <tr key={line.key}>
                    <td>{productLabel(line.product_id)}</td>
                    <td>{bay || <span className="line-flag">no home set</span>}</td>
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
                )
              })}
            </tbody>
          </table>

          <div className="pick-summary">
            <span>{lines.length} line{lines.length === 1 ? '' : 's'}, {totalQty} item{totalQty === 1 ? '' : 's'} total</span>
            <div className="pick-commit-actions">
              <button className="btn-secondary" onClick={clearReceipt} disabled={status === 'saving'}>Clear</button>
              <button onClick={handleCommit} disabled={status === 'saving'}>
                {status === 'saving' ? 'Committing…' : 'Commit receipt'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}