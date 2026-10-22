// Makes an all-capitals copy of a TrueType font: every lower-case character is drawn with the glyph of its capital,
// as the title font of the system always did. Only the cmap table changes (OFL 1.1 allows modified versions; Barlow
// has no reserved font name). Usage : node tools/polices/capitales.mjs <entrée.ttf> <sortie.ttf>
import fs from "node:fs"

const [entree, sortie] = process.argv.slice(2)
const src = fs.readFileSync(entree)

// Table directory
const numTables = src.readUInt16BE(4)
const tables = []
for (let i = 0; i < numTables; i++) {
  const o = 12 + i * 16
  tables.push({
    tag: src.toString("latin1", o, o + 4), offset: src.readUInt32BE(o + 8), length: src.readUInt32BE(o + 12) 
  })
}
const table = tag => tables.find(t => t.tag === tag)

// Read the Unicode mapping (formats 4 and 12)
const cmap = table("cmap")
const base = cmap.offset
const carte = new Map()
for (let i = 0; i < src.readUInt16BE(base + 2); i++) {
  const r = base + 4 + i * 8
  const plateforme = src.readUInt16BE(r)
  const encodage = src.readUInt16BE(r + 2)
  if (!(plateforme === 0 || (plateforme === 3 && (encodage === 1 || encodage === 10)))) continue
  const s = base + src.readUInt32BE(r + 4)
  const format = src.readUInt16BE(s)
  if (format === 4) {
    const segX2 = src.readUInt16BE(s + 6)
    const fins = s + 14, debuts = fins + segX2 + 2, deltas = debuts + segX2, decalages = deltas + segX2
    for (let k = 0; k < segX2 / 2; k++) {
      const fin = src.readUInt16BE(fins + 2 * k), debut = src.readUInt16BE(debuts + 2 * k)
      const delta = src.readInt16BE(deltas + 2 * k), decalage = src.readUInt16BE(decalages + 2 * k)
      for (let c = debut; c <= fin && c !== 0xFFFF; c++) {
        let g
        if (decalage === 0) g = (c + delta) & 0xFFFF
        else {
          g = src.readUInt16BE(decalages + 2 * k + decalage + 2 * (c - debut))
          if (g !== 0) g = (g + delta) & 0xFFFF
        }
        if (g !== 0 && !carte.has(c)) carte.set(c, g)
      }
    }
  } else if (format === 12) {
    const n = src.readUInt32BE(s + 12)
    for (let k = 0; k < n; k++) {
      const g0 = s + 16 + k * 12
      const debut = src.readUInt32BE(g0), fin = src.readUInt32BE(g0 + 4), glyphe = src.readUInt32BE(g0 + 8)
      for (let c = debut; c <= fin; c++) if (!carte.has(c)) carte.set(c, glyphe + c - debut)
    }
  }
}

// Lower case → glyph of the capital
let remplaces = 0
for (const [c] of carte) {
  const majuscule = String.fromCodePoint(c).toUpperCase()
  if ([...majuscule].length !== 1) continue
  const m = majuscule.codePointAt(0)
  if (m !== c && carte.has(m)) { carte.set(c, carte.get(m)); remplaces++ }
}

// New cmap: one format 4 subtable (BMP), for platform 0/3 and 3/1
const codes = [...carte.keys()].filter(c => c < 0xFFFF).sort((a, b) => a - b)
const segments = []
for (const c of codes) {
  const dernier = segments.at(-1)
  if (dernier && c === dernier.fin + 1 && carte.get(c) === carte.get(dernier.fin) + 1) dernier.fin = c
  else segments.push({
    debut: c, fin: c, delta: (carte.get(c) - c) & 0xFFFF 
  })
}
segments.push({
  debut: 0xFFFF, fin: 0xFFFF, delta: 1 
})
const n = segments.length
const longueur4 = 16 + 8 * n
const st = Buffer.alloc(longueur4)
const puissance = 2 ** Math.floor(Math.log2(n))
st.writeUInt16BE(4, 0); st.writeUInt16BE(longueur4, 2); st.writeUInt16BE(0, 4)
st.writeUInt16BE(2 * n, 6); st.writeUInt16BE(2 * puissance, 8)
st.writeUInt16BE(Math.log2(puissance), 10); st.writeUInt16BE(2 * n - 2 * puissance, 12)
segments.forEach((sg, k) => {
  st.writeUInt16BE(sg.fin, 14 + 2 * k)
  st.writeUInt16BE(sg.debut, 16 + 2 * n + 2 * k)
  st.writeUInt16BE(sg.delta, 16 + 4 * n + 2 * k)
  st.writeUInt16BE(0, 16 + 6 * n + 2 * k)
})
const entete = Buffer.alloc(4 + 2 * 8)
entete.writeUInt16BE(0, 0); entete.writeUInt16BE(2, 2)
entete.writeUInt16BE(0, 4); entete.writeUInt16BE(3, 6); entete.writeUInt32BE(entete.length, 8)
entete.writeUInt16BE(3, 12); entete.writeUInt16BE(1, 14); entete.writeUInt32BE(entete.length, 16)
const nouvelleCmap = Buffer.concat([entete, st])

// Rebuild the font, every table aligned on 4 bytes, checksums recomputed
const somme = b => {
  const p = Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)])
  let s = 0
  for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0
  return s
}
const donnees = tables.map(t => ({
  tag: t.tag, data: t.tag === "cmap" ? nouvelleCmap : Buffer.from(src.subarray(t.offset, t.offset + t.length)) 
}))
const head = donnees.find(t => t.tag === "head").data
head.writeUInt32BE(0, 8)
const tete = Buffer.from(src.subarray(0, 12 + numTables * 16))
let position = tete.length
const corps = []
donnees.forEach((t, i) => {
  const o = 12 + i * 16
  tete.writeUInt32BE(somme(t.data), o + 4)
  tete.writeUInt32BE(position, o + 8)
  tete.writeUInt32BE(t.data.length, o + 12)
  const bourrage = Buffer.alloc((4 - t.data.length % 4) % 4)
  corps.push(t.data, bourrage)
  position += t.data.length + bourrage.length
})
const police = Buffer.concat([tete, ...corps])
const hoff = tete.readUInt32BE(12 + donnees.findIndex(t => t.tag === "head") * 16 + 8)
police.writeUInt32BE((0xB1B0AFBA - somme(police)) >>> 0, hoff + 8)
fs.writeFileSync(sortie, police)
console.log(`${sortie} : ${remplaces} minuscules dessinées en capitales, ${carte.size} caractères`)
