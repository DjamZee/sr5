// Lists the keys to rewrite for the 1.0 and shares them between the family files (run once; --verifier checks the split)
// Keys: every _GE description, and the long strings (> 200 characters) inherited unchanged from upstream
import fs from "node:fs"
import path from "node:path"
import {
  AMONT, BASE, DOSSIER, LANGUES, lireLangue, sansBalises 
} from "./commun.mjs"

export const FAMILLES = [
  {
    fichier: "1a-accessoires-statuts.json", test: cle => /^SR5\.(Accessory|STATUSES_|Toxin|Anticoagulant)/.test(cle) 
  },
  {
    fichier: "1b-matrice-ci-sprites.json", test: cle => /^SR5\.(Matrix|Ice|Sprite)/.test(cle) 
  },
  {
    fichier: "1c-train-de-vie-divers.json", test: () => true 
  }
]

export function clesARecrire() {
  const cles = new Set()
  for (const langue of LANGUES) {
    const base = lireLangue(langue, BASE)
    const amont = lireLangue(langue, AMONT)
    for (const [cle, valeur] of Object.entries(base)) {
      if (/_GE$/.test(cle)) cles.add(cle)
      else if (sansBalises(valeur).length > 200 && amont[cle] === valeur) cles.add(cle)
    }
  }
  return [...cles].sort()
}

export function repartir(cles) {
  const parFamille = Object.fromEntries(FAMILLES.map(f => [f.fichier, []]))
  for (const cle of cles) parFamille[FAMILLES.find(f => f.test(cle)).fichier].push(cle)
  return parFamille
}

if (process.argv[1]?.endsWith("lister.mjs")) {
  const parFamille = repartir(clesARecrire())
  for (const [fichier, cles] of Object.entries(parFamille)) {
    const chemin = path.join(DOSSIER, fichier)
    if (fs.existsSync(chemin)) { console.log(`${fichier} : existe déjà, laissé tel quel (${cles.length} clés attendues)`); continue }
    const entrees = Object.fromEntries(cles.map(cle => [cle, {
      fr: "", en: "", source: "", garder: false, note: "" 
    }]))
    fs.writeFileSync(chemin, JSON.stringify({
      famille: fichier.replace(/\.json$/, ""), entrees 
    }, null, 2) + "\n")
    console.log(`${fichier} : ${cles.length} clés`)
  }
}
