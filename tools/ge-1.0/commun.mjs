// Shared helpers of the 1.0 rewrite of the long descriptions (_GE): flat lang files, text normalisation, windows
import fs from "node:fs"
import path from "node:path"
import {
  execFileSync 
} from "node:child_process"
import {
  fileURLToPath 
} from "node:url"

export const DOSSIER = path.dirname(fileURLToPath(import.meta.url))
export const RACINE = path.resolve(DOSSIER, "../..")
export const LANGUES = ["fr", "en"]
// The alpha the rewrite starts from (local/storage, 22/10): the old texts are read from it, never copied into the repo
export const BASE = "dc8f88fcd726eccacab676d7d58fa40581e8db3b"
// The upstream the inherited texts come from
export const AMONT = "13c52fda5"
export const FENETRE = 45
export const BALISES = new Set(["p", "br", "em", "i", "strong", "b", "ul", "ol", "li", "hr"])

/** The lang file of a commit (or of the working tree when ref is null), flattened to "SR5.Key" → string */
export function lireLangue(langue, ref = null) {
  const texte = ref ?
    execFileSync("git", ["show", `${ref}:lang/${langue}.json`], {
      cwd: RACINE, encoding: "utf8", maxBuffer: 64 << 20 
    }) :
    fs.readFileSync(path.join(RACINE, "lang", `${langue}.json`), "utf8")
  return aplatir(JSON.parse(texte))
}

export function aplatir(objet, prefixe = "", resultat = {
}) {
  for (const [cle, valeur] of Object.entries(objet)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle
    if (valeur && typeof valeur === "object") aplatir(valeur, chemin, resultat)
    else resultat[chemin] = String(valeur)
  }
  return resultat
}

export function sansBalises(texte) {
  return String(texte ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

/** Lower case, no accents, no punctuation, single spaces: what two copies of one sentence share */
export function normaliser(texte) {
  return sansBalises(texte)
    .replace(/-\s+/g, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function fenetres(texte, taille = FENETRE) {
  const n = normaliser(texte)
  const resultat = new Set()
  for (let i = 0; i + taille <= n.length; i++) resultat.add(n.slice(i, i + taille))
  return resultat
}

export function lireJson(fichier) {
  return JSON.parse(fs.readFileSync(fichier, "utf8"))
}

/** The family files of the rewrite, in the folder */
export function fichiersFamilles() {
  return fs.readdirSync(DOSSIER).filter(nom => /^1[a-z]-.+\.json$/.test(nom)).sort()
}
