// src/POUploadPanel.jsx
//
// Uploads a PO PDF, parses it, and shows the result as an editable staged
// list, exactly like the pick upload elsewhere in the app never commits
// anything until the person reviews it. onAdd receives only the finished
// shape a bespoke line needs: { description, qty, po_number }, so the
// caller can slot it straight into whatever staging or insert path it
// already has.

import { useState, useRef } from 'react'
import { parsePurchaseOrder } from './poParser'

const newKey = () => crypto.randomUUID()

export default function POUploadPanel({ onAdd }) {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  const [poNumber, setPoNumber] = useState('')
  const [staged, setStaged] = useState([])
  const [adding, setAdding] = useState(false)
  const inputRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setParsing(true); setStaged([])
    try {
      const { poNumber: po, items } = await parsePurchaseOrder(file)
      if (items.length === 0) {
        setError('No item lines were found in that PDF. It may not match the usual PO layout, add items manually instead.')
      } else {
        setPoNumber(po || '')
        setStaged(items.map((it) => ({ key: newKey(), description: it.description, qty: it.qty, include: true })))
      }
    } catch (err) {
      setError('Could not read that PDF: ' + err.message)
    }
    setParsing(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function updateStaged(key, field, value) {
    setStaged((prev) => prev.map((r) => r.key === key ? { ...r, [field]: value } : r))
  }
  function toggleInclude(key) {
    setStaged((prev) => prev.map((r) => r.key === key ? { ...r, include: !r.include } : r))
  }
  function removeStaged(key) {
    setStaged((prev) => prev.filter((r) => r.key !== key))
  }
  function discard() {
    setStaged([]); setPoNumber(''); setError(null)
  }

  async function confirmAdd() {
    const chosen = staged.filter((r) => r.include && r.description.trim() && Number(r.qty) > 0)
    if (chosen.length === 0) { setError('Nothing selected to add.'); return }
    setAdding(true)
    await onAdd(chosen.map((r) => ({
      description: r.description.trim(),
      qty: Number(r.qty),
      po_number: poNumber.trim() || null,
    })))
    setAdding(false)
    setStaged([]); setPoNumber('')
  }

  const includedCount = staged.filter((r) => r.include).length

  return (
    <div className="form-card" style={{ marginTop: '1rem', maxWidth: 640 }}>
      <h4 className="form-title" style={{ margin: 0 }}>Add bespoke items from a PO</h4>
      <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
        Reads a 7Formation Material Order PDF and pulls out its item lines, description and quantity only.
        Review and edit below before adding, delivery method defaults to "Delivered in".
      </p>
      <div className="form-field">
        <label>PO PDF</label>
        <input ref={inputRef} type="file" accept="application/pdf" onChange={handleFile} disabled={parsing} />
      </div>
      {parsing && <p>Reading PDF…</p>}
      {error && <div className="form-error">{error}</div>}

      {staged.length > 0 && (
        <>
          <div className="form-field">
            <label>PO number</label>
            <input type="text" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="if known" />
          </div>
          <table className="data-table">
            <thead>
              <tr><th></th><th>Description</th><th className="num">Qty</th><th></th></tr>
            </thead>
            <tbody>
              {staged.map((r) => (
                <tr key={r.key}>
                  <td><input type="checkbox" checked={r.include} onChange={() => toggleInclude(r.key)} /></td>
                  <td>
                    <input type="text" value={r.description}
                      onChange={(e) => updateStaged(r.key, 'description', e.target.value)}
                      className="desc-inline" />
                  </td>
                  <td className="num">
                    <input type="number" min="0" step="0.001" className="qty-inline" value={r.qty}
                      onChange={(e) => updateStaged(r.key, 'qty', e.target.value)} />
                  </td>
                  <td><button className="btn-link danger" onClick={() => removeStaged(r.key)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-actions">
            <button onClick={confirmAdd} disabled={adding || includedCount === 0}>
              {adding ? 'Adding…' : `Add ${includedCount} item${includedCount === 1 ? '' : 's'}`}
            </button>
            <button className="btn-secondary" onClick={discard} disabled={adding}>Discard</button>
          </div>
        </>
      )}
    </div>
  )
}
