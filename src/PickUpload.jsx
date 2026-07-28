// src/PickUpload.jsx
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

const SHEET_NAME = 'Site Set Up & Signage'
const SHEET_PHASE2 = 'Materials'

// Site Manager Box rule: if the box is "Need", the sector picks which box product.

// Phase rule (one client only): the main tab carries a "Phase" label with its
// value in column D. A value of 2 means the item list lives on the Materials
// tab instead, and the main tab's list is disregarded entirely.

export default function PickUpload() {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [creating, setCreating] = useState(false)
  const [done, setDone] = useState(null)
  const [showFlagged, setShowFlagged] = useState(false)
  const [dupeAcknowledged, setDupeAcknowledged] = useState(false)

  function findByLabel(rows, label) {
    for (let r = 0; r < rows.length; r++) {
      const cell = rows[r][0]
      if (cell && String(cell).trim().toLowerCase().startsWith(label.toLowerCase())) {
        return rows[r][3]
      }
    }
    return null
  }

  // Whole-cell match on "Phase" in any column, value taken from column D on
  // that row. Whole-cell rather than startsWith, so a product description
  // containing the word can never trigger it.
  function findPhase(rows) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || []
      for (let c = 0; c < row.length; c++) {
        const cell = row[c]
        if (cell != null && String(cell).trim().toLowerCase() === 'phase') {
          return row[3]
        }
      }
    }
    return null
  }

  // Excel dates arrive as a Date, a serial number or a string. Normalise to
  // yyyy-mm-dd built from local parts, so no timezone shifts the day back.
  function toISODate(raw) {
    if (raw == null || raw === '') return null
    let d = null
    if (raw instanceof Date) {
      d = raw
    } else if (!isNaN(Number(raw))) {
      const parsed = XLSX.SSF ? XLSX.SSF.parse_date_code(Number(raw)) : null
      if (parsed) d = new Date(parsed.y, parsed.m - 1, parsed.d)
    } else {
      d = new Date(raw)
    }
    if (!d || isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setResult(null); setDone(null); setParsing(true); setShowFlagged(false)
    setDupeAcknowledged(false)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      if (!wb.SheetNames.includes(SHEET_NAME)) {
        setError(`Couldn't find a tab called "${SHEET_NAME}" in this file.`); setParsing(false); return
      }
      const mainRows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_NAME], { header: 1, raw: false, defval: null })

      // Decide which tab holds the item list. The marker always lives on the
      // main tab, so it is read before anything else.
      const phaseRaw = findPhase(mainRows)
      const isPhase2 = String(phaseRaw ?? '').trim() === '2'

      let rows = mainRows
      let sheetUsed = SHEET_NAME
      if (isPhase2) {
        // Hard stop, not a soft warning. Falling back to the main tab here
        // would build a pick from the phase 1 list and ship the same kit twice.
        if (!wb.SheetNames.includes(SHEET_PHASE2)) {
          setError(`This file says Phase 2, but there's no "${SHEET_PHASE2}" tab to read the list from. Check the file before uploading.`)
          setParsing(false); return
        }
        rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_PHASE2], { header: 1, raw: false, defval: null })
        sheetUsed = SHEET_PHASE2
      }

      // Identity fields fall back to the main tab if the Materials copy comes
      // back empty, since the formulas assert they are the same job.
      const readHeader = (label) => {
        const v = findByLabel(rows, label)
        if (v != null && String(v).trim() !== '') return v
        return isPhase2 ? findByLabel(mainRows, label) : null
      }

      const projectName = readHeader('Project Name')
      const jobNumber = readHeader('Project Job Number')
      const collectionRaw = readHeader('Collection Date')
      const sectorRaw = readHeader('Sector')

      // Deliberately NOT falling back. If the phase 2 tab doesn't ask for a
      // site manager box, inheriting "Need" from phase 1 would ship a second one.
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
      // Also include the sector code so the SM box kit is loaded from the header.
      const sector = String(sectorRaw || '').trim().toUpperCase()
      if (sector && !kitCodes.includes(sector)) kitCodes.push(sector)

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
      const smBox = String(smBoxRaw || '').trim().toLowerCase()
      if (smBox === 'need') {
        const smKit = kitsByCode[sector]
        if (!smKit) {
          flagged.push({
            rowNum: '(header)', id: sector || '(blank)', qty: '1', desc: 'Site Manager Box',
            reason: `Box needed but no kit found for sector "${sectorRaw || 'blank'}"`,
          })
        } else {
          const comps = kitItemsByKit[smKit.id] || []
          if (comps.length === 0) {
            flagged.push({
              rowNum: '(header)', id: sector, qty: '1', desc: 'Site Manager Box',
              reason: `Kit "${sector}" has no items defined`,
            })
          } else {
            for (const c of comps) {
              const lineQty = c.multiply === false ? Number(c.qty) : Number(c.qty)
              if (c.products) mergeLine(c.products, lineQty, `SM box (${sector})`)
            }
          }
        }
      }

      const collectionDate = toISODate(collectionRaw)

      // On a phase 2 list the date is a formula copying phase 1's. If it still
      // reads the same, it may simply never have been overtyped. We can't tell
      // a deliberate match from an untouched formula, so we say so and let the
      // person judge.
      let dateEchoesPhase1 = false
      if (isPhase2 && collectionDate) {
        const mainDate = toISODate(findByLabel(mainRows, 'Collection Date'))
        dateEchoesPhase1 = mainDate != null && mainDate === collectionDate
      }

      // Same job, same collection date, still live: probably a re-upload or a
      // phase 2 list whose date was never changed.
      let duplicate = null
      if (project && collectionDate) {
        const { data: dupes } = await supabase
          .from('picks')
          .select('id, status, created_at, collection_date, source')
          .eq('project_id', project.id)
          .eq('collection_date', collectionDate)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
        duplicate = (dupes && dupes[0]) || null
      }

      setResult({
        projectName, jobNumber, project, collectionDate, matched, flagged,
        sheetUsed, isPhase2, dateEchoesPhase1, duplicate,
      })
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
            If the sheet is marked Phase 2, it reads the "{SHEET_PHASE2}" tab instead and disregards the main list.
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
              <div>
                <strong>Read from tab:</strong> {result.sheetUsed}
                {result.isPhase2 && <span style={{ color: '#8a6d00' }}> (phase 2, the main list was disregarded)</span>}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <strong style={{ color: '#1b5e20' }}>{result.matched.length} lines</strong>
                {result.flagged.length > 0 && <strong style={{ color: '#b71c1c' }}> · {result.flagged.length} flagged</strong>}
              </div>
            </div>
          </div>

          {result.dateEchoesPhase1 && (
            <div className="form-warning" style={{ marginTop: '1rem', maxWidth: 640 }}>
              This phase 2 list has the same collection date as the phase 1 tab. That's fine if
              both are collected the same day, but it's also what you'd see if the date was left
              as the copied formula. Worth a look before creating.
            </div>
          )}

          {result.duplicate && (
            <div className="form-warning" style={{ marginTop: '1rem', maxWidth: 640 }}>
              <strong>There's already a pick for this job on this date.</strong>
              <div style={{ marginTop: '0.3rem', fontSize: '0.9rem' }}>
                {result.project?.code} · collection {result.collectionDate} ·
                status {result.duplicate.status} ·
                created {String(result.duplicate.created_at).slice(0, 10).split('-').reverse().join('-')}
                {result.duplicate.source === 'manual' && ' · created by hand'}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.9rem' }}>
                Creating this will make a second pick, and both will reserve stock. Check the
                existing one first if you're not sure.
              </div>
              <label style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={dupeAcknowledged}
                  onChange={(e) => setDupeAcknowledged(e.target.checked)}
                />{' '}
                I've checked, this isn't a duplicate
              </label>
            </div>
          )}

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
            <button
              onClick={createPick}
              disabled={creating || result.matched.length === 0 || (result.duplicate && !dupeAcknowledged)}
            >
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