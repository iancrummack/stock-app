// src/poParser.js
//
// Reads a 7Formation "Material Order" PDF and pulls out its PO number and
// item lines (description and quantity only, per the decision to keep
// bespoke pick lines simple). Assumes the fixed layout: an item row starts
// with "<item no> <commodity code>" and ends with the five trailing columns
// Quantity, Price, Per, Disc %, Amount. Cost Head is assumed blank, as it is
// on every PO seen so far, if a supplier ever populates it this will need
// revisiting.
//
// Text is pulled out row by row using each text fragment's y position, the
// same trick pdfplumber uses, rather than trusting the PDF's internal
// stream order, which does not reliably follow reading order.

import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// "1 M600-0003 Samphire Matt Grey Tiles..." -> item no, commodity code, rest
const ITEM_PREFIX = /^(\d+)\s+([A-Za-z0-9/.-]+)\s+(.*)$/

// Matches the fixed trailing columns: qty, price, per, disc%, amount.
// Non-greedy group 1 backtracks until the tail lines up, so digits inside
// the description itself (e.g. "3mm (500)") don't get mistaken for columns.
const TRAILING_FIELDS = /^(.*?)\s+(\d[\d,]*\.\d+)\s+(\d[\d,]*\.\d+)\s+(\S+)\s+(\d[\d,]*\.\d+)\s+(\d[\d,]*\.\d+)\s*$/

// e.g. "M-ME000M/000245"
const PO_NUMBER = /\b([A-Z]{1,3}-[A-Z0-9]+\/\d{4,})\b/

async function extractRows(pdf) {
  const rows = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()

    // Bucket text fragments by rounded y position, then read each bucket
    // left to right. Rounding absorbs the small sub-pixel differences
    // between fragments that are visually on the same line.
    const buckets = new Map()
    for (const item of content.items) {
      const y = Math.round(item.transform[5])
      const x = item.transform[4]
      if (!buckets.has(y)) buckets.set(y, [])
      buckets.get(y).push({ x, str: item.str })
    }

    const ys = [...buckets.keys()].sort((a, b) => b - a) // PDF y grows upward
    for (const y of ys) {
      const row = buckets.get(y)
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (row) rows.push(row)
    }
  }
  return rows
}

// Returns { poNumber, items: [{ description, qty }] }. Items is empty if
// nothing matched the expected layout, callers should treat that as "this
// didn't parse" rather than "this PO has no items".
export async function parsePurchaseOrder(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const rows = await extractRows(pdf)
  const fullText = rows.join(' ')

  const poMatch = fullText.match(PO_NUMBER)
  const poNumber = poMatch ? poMatch[1] : null

  const items = []
  for (const row of rows) {
    const prefixMatch = row.match(ITEM_PREFIX)
    if (!prefixMatch) continue
    const fieldsMatch = prefixMatch[3].match(TRAILING_FIELDS)
    if (!fieldsMatch) continue
    const description = fieldsMatch[1].trim()
    const qty = Number(fieldsMatch[2].replace(/,/g, ''))
    if (!description || !qty) continue
    items.push({ description, qty })
  }

  return { poNumber, items }
}
