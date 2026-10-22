// Sweeps EVERY string of lang/*.json (working tree) against the books cache: the keys sharing a 45-character window
// with a book, whatever their length. Usage : node tools/ge-1.0/balayer-livres.mjs [--livres <dossier>]
import fs from "node:fs"
import path from "node:path"
import {
  FENETRE, LANGUES, fenetres, lireLangue, normaliser
} from "./commun.mjs"

const args = process.argv.slice(2)
const i = args.indexOf("--livres")
const dossier = i >= 0 ? args[i + 1] : "E:/01.Install et sauvegarde/Shadowrun Library VO/Workflow Claude/Cache-regles-SR5"
const index = new Map()
for (const langue of LANGUES) for (const [cle, valeur] of Object.entries(lireLangue(langue))) {
  for (const f of fenetres(valeur)) if (!index.has(f)) index.set(f, `${langue} ${cle}`)
}
const touches = new Map()
for (const livre of fs.readdirSync(dossier).filter(n => n.endsWith(".txt"))) {
  const n = normaliser(fs.readFileSync(path.join(dossier, livre), "utf8"))
  for (let j = 0; j + FENETRE <= n.length; j++) {
    const qui = index.get(n.slice(j, j + FENETRE))
    if (!qui) continue
    const t = touches.get(qui) ?? {
      livres: new Set(), n: 0 
    }
    t.livres.add(livre.replace(/\.txt$/, "")); t.n++
    touches.set(qui, t)
  }
}
for (const [qui, t] of [...touches].sort()) console.log(`${qui}\t${t.n}\t${[...t.livres].join(",")}`)
console.log(`${touches.size} chaîne(s) touchée(s)`)
