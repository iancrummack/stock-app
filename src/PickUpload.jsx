// src/PickUpload.jsx
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

const SHEET_NAME = 'Site Set Up & Signage'

// Site Manager Box rule: if the box is "Need", the sector picks which box product.
const SM_BOX_BY_SECTOR = { BD: 127, MF: 128, TA: 129 }

export default function PickUpload() {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [creating, setCreating] = useState(false)
  const [done, setDone] = useState(null)
  const [showFlagged, setShowFlagged] = useState(false)

  function findByLabel(rows, label) {
    for (let r = 0; r < rows.length; r++) {
      const cell = rows[r][0]
      if (cell && String(cell).trim().toLowerCase().startsWith(label.toLowerCase())) {
        return rows[r][3]
      }
    }
    return null
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setResult(null); setDone(null); setParsing(true); setShowFlagged(false)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      if (!wb.SheetNames.includes(SHEET_NAME)) {
        setError(`Couldn't find a tab called "${SHEET_NAME}" in this file.`); setParsing(false); return
      }
      const sheet = wb.Sheets[SHEET_NAME]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null })

      const projectName = findByLabel(rows, 'Project Name')
      const jobNumber = findByLabel(rows, 'Project Job Number')
      const collectionRaw = findByLabel(rows, 'Collection Date')
      const sectorRaw = findByLabel(rows, 'Sector')
      const smBoxRaw = findByLabel(rows, 'Site Manager Box')

      let headerRow = -1
      for (let r = 0; r < rows.length; r++) {
        const joined = rows[r].map((c) => String(c || '').trim().toLowerCase())
        if (joined.includes('i.d') && joined.includes('qty')) { headerRow = r; break }
      }
      if (headerRow === -1) {
        setError('Couldn\'t find the item table (looking for a row with "I.D" and "Qty" headers).'); setParsing(false); return
      }
      const hdr = rows[headerRow].map((c) => String(c || '').trim().toLowerCase())
      const idCol = hdr.indexOf('i.d')
      const qtyCol = hdr.indexOf('qty')
      const descCol = hdr.indexOf('description')

      const rawLines = []
      for (let r = headerRow + 1; r < rows.length; r++) {
        const idVal = rows[r][idCol]
        const qtyVal = rows[r][qtyCol]
        const desc = descCol >= 0 ? rows[r][descCol] : ''
        if ((idVal == null || String(idVal).trim() === '') && (qtyVal == null || String(qtyVal).trim() === '')) continue
        rawLines.push({
          rowNum: r + 1,
          id: idVal == null ? '' : String(idVal).trim(),
          qty: qtyVal == null ? '' : String(qtyVal).trim(),
          desc: desc || '',
        })
      }

      // Gather numeric product ids and lettered kit codes.
      const numericIds = rawLines.filter((l) => l.id !== '' && !isNaN(Number(l.id))).map((l) => Number(l.id))
      const kitCodes = rawLines.filter((l) => l.id !== '' && isNaN(Number(l.id))).map((l) => l.id.toUpperCase())

      // Load matching products, kits, and kit items.
      const productsById = {}
      if (numericIds.length) {
        const { data: prods } = await supabase.from('products').select('id, code, name, tracking_type').in('id', numericIds)
        ;(prods || []).forEach((p) => { productsById[p.id] = p })
      }
      const kitsByCode = {}
      let kitItemsByKit = {}
      if (kitCodes.length) {
        const { data: kits } = await supabase.from('kits').select('id, code, name').in('code', kitCodes)
        ;(kits || []).forEach((k) => { kitsByCode[k.code.toUpperCase()] = k })
        const kitIds = (kits || []).map((k) => k.id)
        if (kitIds.length) {
          const { data: kitItems } = await supabase
            .from('kit_items')
            .select('kit_id, qty, multiply, product_id, products(id, code, name, tracking_type)')
            .in('kit_id', kitIds)
          ;(kitItems || []).forEach((ki) => {
            if (!kitItemsByKit[ki.kit_id]) kitItemsByKit[ki.kit_id] = []
            kitItemsByKit[ki.kit_id].push(ki)
          })
        }
      }

      // Match the job number to a project.
      let project = null
      if (jobNumber) {
        const { data: projs } = await supabase.from('projects').select('id, code, name').eq('code', String(jobNumber).trim())
        project = (projs && projs[0]) || null
      }

      // Build matched lines and flags. Kit rows expand into component lines.
      const matched = []          // { product_id, code, name, tracking_type, qty, fromKit? }
      const flagged = []
      const mergeLine = (prod, qty, fromKit) => {
        // Merge same product across rows/kits so the pick has one line per product.
        const existing = matched.find((m) => m.product_id === prod.id)
        if (existing) existing.qty += qty
        else matched.push({ product_id: prod.id, code: prod.code, name: prod.name, tracking_type: prod.tracking_type, qty, fromKit: fromKit || null })
      }

      for (const l of rawLines) {
        const qtyNum = Number(l.qty)
        if (l.id === '') { flagged.push({ ...l, reason: 'No I.D on this row' }); continue }
        if (l.qty === '' || isNaN(qtyNum) || qtyNum <= 0) { flagged.push({ ...l, reason: 'Missing or invalid quantity' }); continue }

        if (!isNaN(Number(l.id))) {
          // Numeric → a product.
          const prod = productsById[Number(l.id)]
          if (!prod) { flagged.push({ ...l, reason: `I.D ${l.id} not found in products` }); continue }
          mergeLine(prod, qtyNum)
        } else {
          // Lettered → a kit code to expand.
          const kit = kitsByCode[l.id.toUpperCase()]
          if (!kit) { flagged.push({ ...l, reason: `Kit code "${l.id}" not found` }); continue }
          const comps = kitItemsByKit[kit.id] || []
          if (comps.length === 0) { flagged.push({ ...l, reason: `Kit "${l.id}" has no items defined` }); continue }
          for (const c of comps) {
            // Fixed components (e.g. WES base) don't scale with the row quantity.
            const lineQty = c.multiply === false ? Number(c.qty) : Number(c.qty) * qtyNum
            if (c.products) mergeLine(c.products, lineQty, kit.code)
          }
        }
      }

    // ---- Site Manager Box rule ----
      // If the header's Site Manager Box field says "Need", add the sector's box.
      const smBox = String(smBoxRaw || '').trim().toLowerCase()
      if (smBox === 'need') {
        const sector = String(sectorRaw || '').trim().toUpperCase()
        const boxProductId = SM_BOX_BY_SECTOR[sector]
        if (!boxProductId) {
          // "Need" but no recognisable sector — flag it loudly, don't guess.
          flagged.push({
            rowNum: '(header)', id: sector || '(blank)', qty: '1', desc: 'Site Manager Box',
            reason: `Box needed but sector "${sectorRaw || 'blank'}" not recognised (expected TA, BD or MF)`,
          })
        } else {
          // Look up the box product so we can show it in the summary.
          const { data: boxProd } = await supabase
            .from('products')
            .select('id, code, name, tracking_type')
            .eq('id', boxProductId)
            .single()
          if (boxProd) {
            mergeLine(boxProd, 1, 'SM box')
          } else {
            flagged.push({
              rowNum: '(header)', id: String(boxProductId), qty: '1', desc: 'Site Manager Box',
              reason: `Box product id ${boxProductId} not found`,
            })
          }
        }
      }

      let collectionDate = null
      if (collectionRaw != null && collectionRaw !== '') {
        let d = null
        if (collectionRaw instanceof Date) {
          d = collectionRaw
        } else if (!isNaN(Number(collectionRaw))) {
          // Excel serial number → date (SheetJS helper), fallback if cellDates missed it.
          const parsed = XLSX.SSF ? XLSX.SSF.parse_date_code(Number(collectionRaw)) : null
          if (parsed) d = new Date(parsed.y, parsed.m - 1, parsed.d)
        } else {
          d = new Date(collectionRaw)
        }
        if (d && !isNaN(d.getTime())) {
          // Build the yyyy-mm-dd from local parts, so no timezone shifts the day back.
          const y = d.getFullYear()
          const m = String(d.getMonth() + 1).padStart(2, '0')
          const day = String(d.getDate()).padStart(2, '0')
          collectionDate = `${y}-${m}-${day}`
        }
      }

      setResult({ projectName, jobNumber, project, collectionDate, matched, flagged })
    } catch (err) {
      setError('Could not read this file: ' + err.message)
    }
    setParsing(false)
  }

  async function createPick() {
    if (!result) return
    setCreating(true); setError(null)
    const { data: pick, error: pErr } = await supabase.from('picks').insert({
      project_id: result.project ? result.project.id : null,
      collection_date: result.collectionDate,
      status: 'open',
    }).select().single()
    if (pErr) { setError(pErr.message); setCreating(false); return }

    const lineRows = result.matched.map((m) => ({ pick_id: pick.id, product_id: m.product_id, qty: m.qty }))
    const { error: lErr } = await supabase.from('pick_lines').insert(lineRows)
    setCreating(false)
    if (lErr) { setError(lErr.message); return }
    setDone({ pickId: pick.id, lines: lineRows.length })
    setResult(null)
  }

  return (
    <div>
      {!result && !done && (
        <div className="form-card">
          <h3 className="form-title">Upload a pick list</h3>
          <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
            Select the master list Excel file. It reads the "{SHEET_NAME}" tab, matches items by I.D (kits expand automatically), and shows a summary before creating the pick.
          </p>
          <div className="form-field">
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={parsing} />
          </div>
          {parsing && <p>Reading file…</p>}
          {error && <div className="form-error">{error}</div>}
        </div>
      )}

      {result && (
        <div>
          <div className="form-card" style={{ maxWidth: 640 }}>
            <h3 className="form-title">Check before creating the pick</h3>
            <div style={{ fontSize: '0.9rem' }}>
              <div><strong>Project:</strong> {result.projectName || '—'} ({result.jobNumber || 'no job number'})
                {result.project
                  ? <span style={{ color: '#1b5e20' }}> ✓ matched to {result.project.code}</span>
                  : <span style={{ color: '#b71c1c' }}> ✗ no matching project found</span>}
              </div>
              <div><strong>Collection date:</strong> {result.collectionDate || <span style={{ color: '#b71c1c' }}>couldn't read a date</span>}</div>
              <div style={{ marginTop: '0.5rem' }}>
                <strong style={{ color: '#1b5e20' }}>{result.matched.length} lines</strong>
                {result.flagged.length > 0 && <strong style={{ color: '#b71c1c' }}> · {result.flagged.length} flagged</strong>}
              </div>
            </div>
          </div>

          {result.flagged.length > 0 && (() => {
            // Group the flagged rows by reason for the collapsed summary.
            const byReason = result.flagged.reduce((acc, f) => {
              acc[f.reason] = (acc[f.reason] || 0) + 1
              return acc
            }, {})
            return (
              <div style={{ marginTop: '1rem' }}>
                <div
                  onClick={() => setShowFlagged((s) => !s)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <h4 className="detail-subhead" style={{ margin: 0, color: '#b71c1c' }}>
                    {showFlagged ? '▾' : '▸'} {result.flagged.length} flagged {result.flagged.length === 1 ? 'row' : 'rows'} (won't be included)
                  </h4>
                </div>

                {/* Collapsed: a per-reason breakdown so you can judge without expanding */}
                {!showFlagged && (
                  <div style={{ fontSize: '0.85rem', color: '#8a6d00', marginTop: '0.3rem' }}>
                    {Object.entries(byReason).map(([reason, count], i) => (
                      <div key={i}>{count} × {reason}</div>
                    ))}
                    <button className="btn-link" onClick={() => setShowFlagged(true)} style={{ paddingLeft: 0 }}>Show details</button>
                  </div>
                )}

                {/* Expanded: the full table as before */}
                {showFlagged && (
                  <table className="data-table" style={{ marginTop: '0.5rem' }}>
                    <thead><tr><th>Sheet row</th><th>I.D</th><th>Qty</th><th>Description</th><th>Problem</th></tr></thead>
                    <tbody>
                      {result.flagged.map((f, i) => (
                        <tr key={i} className="row-critical">
                          <td>{f.rowNum}</td><td>{f.id || '—'}</td><td>{f.qty || '—'}</td><td>{f.desc}</td><td>{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })()}

          <div style={{ marginTop: '1rem' }}>
            <h4 className="detail-subhead">Lines to be created ({result.matched.length})</h4>
            <table className="data-table">
              <thead><tr><th>Code</th><th>Product</th><th>Kind</th><th className="num">Qty</th><th>From kit</th></tr></thead>
              <tbody>
                {result.matched.map((m, i) => (
                  <tr key={i}>
                    <td>{m.code}</td><td>{m.name}</td>
                    <td>{m.tracking_type === 'asset' ? 'asset' : 'consumable'}</td>
                    <td className="num">{m.qty}</td>
                    <td>{m.fromKit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <div className="form-error" style={{ marginTop: '1rem' }}>{error}</div>}

          <div className="pick-commit-actions" style={{ marginTop: '1rem' }}>
            <button onClick={createPick} disabled={creating || result.matched.length === 0}>
              {creating ? 'Creating…' : `Create pick (${result.matched.length} lines)`}
            </button>
            <button className="btn-secondary" onClick={() => setResult(null)} disabled={creating}>Start over</button>
          </div>
          {result.matched.length === 0 && <p className="line-flag" style={{ marginTop: '0.5rem' }}>No lines to create a pick from.</p>}
        </div>
      )}

      {done && (
        <div className="form-card">
          <div className="form-success">
            Pick created with {done.lines} lines. It's now in the Pick lists screen, ready to be picked.
          </div>
          <div className="form-actions">
            <button onClick={() => setDone(null)}>Upload another</button>
          </div>
        </div>
      )}
    </div>
  )
}