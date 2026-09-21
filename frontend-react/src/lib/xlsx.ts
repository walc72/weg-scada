// XLSX mínimo para el navegador (OOXML + ZIP método "store", sin dependencias
// ni compresión). Excel abre un zip sin comprimir sin problemas. Se usa como
// fallback en modo mock; en live el .xlsx lo genera el backend (con deflate).

export interface Sheet { name: string; headers: (string | number)[]; rows: (string | number | null)[][] }

function crc32(buf: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xFFFFFFFF) >>> 0
}
const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function colRef(i: number) { let s = '', n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }

function sheetXml(sheet: Sheet): string {
  const all = [sheet.headers, ...sheet.rows]
  const rows = all.map((row, r) => {
    const cells = row.map((v, c) => {
      const ref = `${colRef(c)}${r + 1}`
      if (r > 0 && typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v == null ? '' : v)}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`
}

export function buildXlsx(sheets: Sheet[]): Blob {
  const enc = new TextEncoder()
  const list = sheets.filter(s => s && s.headers)
  if (!list.length) list.push({ name: 'Hoja1', headers: ['Sin datos'], rows: [] })

  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((s, i) => `<sheet name="${esc((s.name || `Hoja${i + 1}`).slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  }
  list.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s) })

  // ZIP (método store, sin compresión)
  const local: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  const names = Object.keys(files)
  for (const name of names) {
    const nameBuf = enc.encode(name)
    const data = enc.encode(files[name])
    const crc = crc32(data)
    const lhBuf = new ArrayBuffer(30)
    const lh = new DataView(lhBuf)
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true)
    lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true)
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true)
    lh.setUint16(26, nameBuf.length, true); lh.setUint16(28, 0, true)
    local.push(new Uint8Array(lhBuf), nameBuf, data)

    const chBuf = new ArrayBuffer(46)
    const ch = new DataView(chBuf)
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true)
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true)
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true)
    ch.setUint16(28, nameBuf.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true)
    ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true)
    central.push(new Uint8Array(chBuf), nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const localSize = local.reduce((s, b) => s + b.length, 0)
  const centralSize = central.reduce((s, b) => s + b.length, 0)
  const eocdBuf = new ArrayBuffer(22)
  const eocd = new DataView(eocdBuf)
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true)
  eocd.setUint16(8, names.length, true); eocd.setUint16(10, names.length, true)
  eocd.setUint32(12, centralSize, true); eocd.setUint32(16, localSize, true); eocd.setUint16(20, 0, true)

  const parts = [...local, ...central, new Uint8Array(eocdBuf)]
  const total = parts.reduce((s, b) => s + b.length, 0)
  const out = new Uint8Array(total)  // respaldado por ArrayBuffer (satisface BlobPart)
  let pos = 0
  for (const b of parts) { out.set(b, pos); pos += b.length }
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadXlsx(filename: string, sheets: Sheet[]) {
  const blob = buildXlsx(sheets)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
