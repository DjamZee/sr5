// Checks the family files of the 1.0 rewrite of the long descriptions: form, page reference, and no copy of the old text
// nor of the books (45-character windows, the method of the rights audit of 21/10).
// Usage : node tools/ge-1.0/verifier.mjs [fichier.json …] [--livres <dossier des .txt>] [--sans-livres] [--detail]
import fs from "node:fs"
import path from "node:path"
import {
  AMONT, BALISES, BASE, DOSSIER, FENETRE, LANGUES, fenetres, fichiersFamilles, lireJson, lireLangue, normaliser, sansBalises 
} from "./commun.mjs"
import {
  clesARecrire, repartir 
} from "./lister.mjs"

const LONGUEUR_ALERTE = 500
const LONGUEUR_MAX = 900
const PAGE = /\b(p|pp)\.\s?\d+/i
// The rules cache of mj-sr5, found from the skills folder like its own scripts do
const LIVRES_DEFAUT = "E:/01.Install et sauvegarde/Shadowrun Library VO/Workflow Claude/Cache-regles-SR5"

const args = process.argv.slice(2)
const detail = args.includes("--detail")
const sansLivres = args.includes("--sans-livres")
const iLivres = args.indexOf("--livres")
const dossierLivres = iLivres >= 0 ? args[iLivres + 1] : LIVRES_DEFAUT
const demandes = args.filter((a, i) => a.endsWith(".json") && args[i - 1] !== "--livres").map(a => path.basename(a))
const fichiers = demandes.length ? demandes : fichiersFamilles()

const erreurs = []
const alertes = []
const erreur = (fichier, cle, texte) => erreurs.push(`${fichier} ${cle} : ${texte}`)
const alerte = (fichier, cle, texte) => alertes.push(`${fichier} ${cle} : ${texte}`)

// 1. The split: every key in exactly one family file, the one it was given
const attendu = repartir(clesARecrire())
const proprietaire = {
}
for (const nom of fichiersFamilles()) for (const cle of Object.keys(lireJson(path.join(DOSSIER, nom)).entrees)) {
  if (proprietaire[cle]) erreur(nom, cle, `déjà dans ${proprietaire[cle]}`)
  proprietaire[cle] = nom
}
for (const [nom, cles] of Object.entries(attendu)) for (const cle of cles) {
  if (proprietaire[cle] !== nom) erreur(nom, cle, proprietaire[cle] ? `rangée dans ${proprietaire[cle]}` : "absente")
}

// 2. The old texts: every long string of the alpha, both languages (a rewrite shares nothing with any of them)
const anciens = Object.fromEntries(LANGUES.map(l => [l, lireLangue(l, BASE)]))
const amont = Object.fromEntries(LANGUES.map(l => [l, lireLangue(l, AMONT)]))
const fenetresAnciennes = new Map()
for (const langue of LANGUES) for (const [cle, valeur] of Object.entries(anciens[langue])) {
  if (sansBalises(valeur).length < FENETRE) continue
  for (const f of fenetres(valeur)) if (!fenetresAnciennes.has(f)) fenetresAnciennes.set(f, `${langue}:${cle}`)
}

// 3. Each entry
const fenetresNouvelles = new Map() // window → [fichier, cle, langue]
const bilan = []
for (const nom of fichiers) {
  const chemin = path.join(DOSSIER, nom)
  if (!fs.existsSync(chemin)) { erreur(nom, "-", "fichier introuvable"); continue }
  const {
    entrees 
  } = lireJson(chemin)
  let faites = 0
  for (const [cle, e] of Object.entries(entrees)) {
    const vide = LANGUES.every(l => !String(e[l] ?? "").trim())
    if (e.garder) {
      if (!vide) erreur(nom, cle, "« garder » avec un texte : choisir l'un ou l'autre")
      for (const l of LANGUES) if (amont[l][cle] !== undefined && amont[l][cle] === anciens[l][cle]) erreur(nom, cle, `« garder » refusé : le texte ${l} vient de l'amont`)
      faites++
      // A kept text is the current one: checked against the books only
      for (const l of LANGUES) for (const f of fenetres(anciens[l][cle] ?? "")) fenetresNouvelles.set(f, [nom, cle, l])
      continue
    }
    if (vide) continue
    faites++
    for (const langue of LANGUES) {
      const texte = String(e[langue] ?? "")
      if (!texte.trim()) { erreur(nom, cle, `${langue} vide`); continue }
      const brut = sansBalises(texte)
      if (brut.length > LONGUEUR_MAX) erreur(nom, cle, `${langue} trop long (${brut.length} > ${LONGUEUR_MAX})`)
      else if (brut.length > LONGUEUR_ALERTE) alerte(nom, cle, `${langue} long (${brut.length})`)
      if (!PAGE.test(brut) && !PAGE.test(e.source ?? "")) erreur(nom, cle, `${langue} sans renvoi « p. N » (ni dans source)`)
      for (const balise of texte.match(/<\/?([a-zA-Z0-9]+)/g) ?? []) {
        const b = balise.replace(/[</]/g, "").toLowerCase()
        if (!BALISES.has(b)) erreur(nom, cle, `${langue} balise <${b}> refusée`)
      }
      // The placeholders of the old text ({name}) are kept: the code formats them
      const ancien = anciens[langue][cle] ?? ""
      const attendus = new Set(ancien.match(/\{\w+\}/g) ?? [])
      const presents = new Set(texte.match(/\{\w+\}/g) ?? [])
      for (const p of attendus) if (!presents.has(p)) erreur(nom, cle, `${langue} paramètre ${p} perdu`)
      for (const p of presents) if (!attendus.has(p)) erreur(nom, cle, `${langue} paramètre ${p} inconnu du code`)
      const reprises = new Map() // origin → [first window, count]
      for (const f of fenetres(texte)) {
        const origine = fenetresAnciennes.get(f)
        if (origine) reprises.set(origine, [reprises.get(origine)?.[0] ?? f, (reprises.get(origine)?.[1] ?? 0) + 1])
        fenetresNouvelles.set(f, [nom, cle, langue])
      }
      for (const [origine, [f, n]] of reprises) erreur(nom, cle, `${langue} reprend l'ancien texte (${origine}, ${n} fenêtre(s)) : « ${f} »`)
    }
  }
  bilan.push(`${nom} : ${faites}/${Object.keys(entrees).length} entrées écrites`)
}

// 4. The books: one pass over the normalised text of each book, looking up every window in the new ones
if (!sansLivres) {
  if (!fs.existsSync(dossierLivres)) erreurs.push(`livres introuvables : ${dossierLivres} (--livres <dossier> ou --sans-livres)`)
  else {
    const vus = new Set()
    for (const livre of fs.readdirSync(dossierLivres).filter(n => n.endsWith(".txt"))) {
      const n = normaliser(fs.readFileSync(path.join(dossierLivres, livre), "utf8"))
      for (let i = 0; i + FENETRE <= n.length; i++) {
        const trouve = fenetresNouvelles.get(n.slice(i, i + FENETRE))
        if (!trouve) continue
        const [nom, cle, langue] = trouve
        const marque = `${cle}:${langue}:${livre}`
        if (vus.has(marque)) continue
        vus.add(marque)
        erreur(nom, cle, `${langue} reprend le livre ${livre.replace(/\.txt$/, "")} : « ${n.slice(i, i + FENETRE)} »`)
      }
    }
  }
}

for (const ligne of bilan) console.log(ligne)
if (alertes.length) console.log(`\n${alertes.length} alerte(s)${detail ? "" : " (--detail pour la liste)"}`)
if (detail) for (const a of alertes) console.log(`  ! ${a}`)
if (erreurs.length) {
  console.log(`\n${erreurs.length} erreur(s) :`)
  for (const e of erreurs) console.log(`  ✗ ${e}`)
  process.exit(1)
}
console.log("\nAucune erreur.")
