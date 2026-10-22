// Renvois de page de lang/en.json : pages des livres français -> pages des livres anglais (VO).
//
//   node tools/pages-vo/convertir.mjs            bilan seul (rien n'est écrit)
//   node tools/pages-vo/convertir.mjs --ecrire   réécrit lang/en.json
//
// Un renvoi n'est converti que s'il porte encore la page du livre français : même numéro, à la même place, que le
// renvoi de lang/fr.json pour la même clé. Rejouer le script ne change donc plus rien.
// Les descriptions réécrites pour la 1.0 (tools/ge-1.0/*.json) ont déjà leurs pages anglaises : jamais touchées.
// Livre sans VO (Assassin's Primer) ou passage absent de la VO : la page française reste, « (French edition) » est dit.
//
// Table : concordance.json. Chaque page y a été établie sur les PDF des deux éditions, pas par un décalage :
// alignement des pages du livre entier (chiffres, noms propres, sigles), puis le terme de règle cité (action, trait,
// sort, pouvoir, table) cherché dans le texte et les titres de la VO, puis contrôle croisé avec la table du manuel
// anglais et les descriptions 1.0. Dans les listes alphabétiques (actions matricielles, traits, sorts, pouvoirs)
// l'ordre VF n'est pas celui de la VO : Gourou (FA VF p. 37) = Worship Leader, VO p. 42 ; Craquer un fichier (SR5 VF
// p. 242) = Crack File, VO p. 238. D'où les exceptions par clé de `cles`.
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { renvoisEn, numeros } from "./renvois.mjs"

const ici = dirname(fileURLToPath(import.meta.url))
const racine = join(ici, "..", "..")
const ecrire = process.argv.includes("--ecrire")
const lireJson = f => JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""))

const table = lireJson(join(ici, "concordance.json"))
const fr = lireJson(join(racine, "lang", "fr.json"))
const brut = readFileSync(join(racine, "lang", "en.json"), "utf8")

const ge = new Set()
for (const f of readdirSync(join(racine, "tools", "ge-1.0")).filter(f => f.endsWith(".json"))) {
  for (const [cle, e] of Object.entries(lireJson(join(racine, "tools", "ge-1.0", f)).entrees ?? {})) if (e.en) ge.add(cle)
}

/**
 * Page VO d'une page VF : d'abord l'exception de la clé (une liste se lit renvoi après renvoi : `rang` = combien de
 * fois cette page a déjà été citée dans la chaîne), puis la table. "VF" : contenu absent de la VO.
 */
function pageVo(cle, code, vf, rang) {
  let v = table.cles?.[cle]?.[`${code} ${vf}`]
  if (Array.isArray(v)) v = v[Math.min(rang, v.length - 1)]
  v ??= table.pages[code]?.[vf]
  return v === undefined ? null : String(v)
}

const bilan = { convertis: 0, memePage: 0, identiques: 0, mention: 0, dejaVo: 0, ge: 0, douteux: [], cles: new Set() }

function convertir(cle, texte) {
  const r = renvoisEn(texte, cle)
  if (!r.length) return texte
  if (ge.has(cle)) {
    bilan.ge += r.length
    return texte
  }
  const nf = numeros(fr[cle] ?? "")
  const ne = r.flatMap(x => [x.a, ...(x.b ? [x.b] : [])])
  const memePlace = nf.length === ne.length
  const rempl = []
  const rangs = {}
  const rang = (code, n) => (rangs[`${code} ${n}`] = (rangs[`${code} ${n}`] ?? -1) + 1)
  let i = 0
  for (const x of r) {
    const nums = [x.a, ...(x.b ? [x.b] : [])]
    // Rang de la page VF dans la chaîne, compté sur chaque renvoi, converti ou non (lu côté français quand les
    // renvois se répondent un à un) : un second passage relit les mêmes rangs.
    const pageFr = k => (memePlace ? nf[i + k] : nums[k])
    const ra = rang(x.code, pageFr(0)), rb = x.b ? rang(x.code, pageFr(1)) : 0
    const encoreVf = nums.every(n => (memePlace ? nf[i++] === n : nf.includes(n)))
    if (!memePlace) i += nums.length
    const ici = `${cle} : ${x.nom ?? "?"} p. ${x.a}${x.b ? "-" + x.b : ""}`
    if (x.mention) { bilan.mention++; continue }
    if (!encoreVf) { bilan.dejaVo++; continue }
    const livre = table.livres[x.code]
    if (!x.code || !livre) { bilan.douteux.push(`${ici} (livre non reconnu)`); continue }
    if (livre.vo === "identique") { bilan.identiques++; continue }
    const pa = livre.vo === "absente" ? "VF" : pageVo(cle, x.code, x.a, ra)
    const pb = x.b && livre.vo !== "absente" ? pageVo(cle, x.code, x.b, rb) : null
    if (pa === "VF" || pb === "VF") {
      // Pas de VO (livre ou passage) : la page française reste, l'édition est dite, comme « No Future (French
      // edition) p. 152 ».
      if (x.nom && x.ecart <= 25) rempl.push({ start: x.start, mention: x })
      else bilan.douteux.push(`${ici} (sans VO, livre non nommé près du renvoi)`)
      bilan.mention++
      continue
    }
    if (pa === null || (x.b && pb === null)) { bilan.douteux.push(`${ici} (page absente de la table)`); continue }
    const [a1, a2] = pa.split("-").map(Number), [b1, b2] = (pb ?? pa).split("-").map(Number)
    const lo = Math.min(a1, b1), hi = Math.max(a2 ?? a1, b2 ?? b1)
    const par = lo === hi ? String(lo) : `${lo}${x.sep ?? "-"}${hi}`
    if (par === texte.slice(x.start, x.end)) { bilan.memePage++; continue }
    rempl.push({ start: x.start, end: x.end, par })
    bilan.convertis++
  }
  let out = texte
  for (const m of rempl.sort((p, q) => q.start - p.start)) {
    if (m.mention) {
      // « Assassin's Primer p. 15 » -> « Assassin's Primer (French edition) p. 15 »
      const x = m.mention
      const fin = out.lastIndexOf(x.nom, x.start) + x.nom.length
      if (out.startsWith(" (French edition)", fin)) continue
      out = out.slice(0, fin) + " (French edition)" + out.slice(fin)
      continue
    }
    out = out.slice(0, m.start) + m.par + out.slice(m.end)
  }
  if (out !== texte) bilan.cles.add(cle)
  return out
}

// Une ligne = une clé ; la fin de ligne (CRLF ou LF, le fichier mêle les deux) et l'espacement sont gardés tels quels.
const RX_LIGNE = /^(\s*"((?:[^"\\]|\\.)*)":\s*)("(?:[^"\\]|\\.)*")(,?\s*)$/
const lignes = brut.split(/(?<=\n)/)
let changees = 0
const sortie = lignes.map(l => {
  const m = l.match(RX_LIGNE)
  if (!m) return l
  const cle = JSON.parse(`"${m[2]}"`), val = JSON.parse(m[3])
  const neuf = convertir(cle, val)
  if (neuf === val) return l
  if (JSON.stringify(val) !== m[3]) throw new Error(`encodage inattendu, ligne laissée : ${cle}`)
  changees++
  return m[1] + JSON.stringify(neuf) + m[4]
})

// Toute chaîne à renvoi doit avoir été lue ligne à ligne ; sinon elle est signalée, jamais convertie en silence.
const lues = new Set(lignes.map(l => l.match(RX_LIGNE)?.[2]).filter(Boolean).map(k => JSON.parse(`"${k}"`)))
for (const [cle, val] of Object.entries(lireJson(join(racine, "lang", "en.json")))) {
  if (!lues.has(cle) && renvoisEn(String(val), cle).length) bilan.douteux.push(`${cle} : ligne de lang/en.json non reconnue`)
}

const rapport = [
  "# Renvois de page de lang/en.json : bilan de la conversion VF -> VO",
  "",
  `Produit par \`node tools/pages-vo/convertir.mjs --ecrire\` (table : concordance.json).`,
  "",
  "| | Renvois |",
  "|---|---|",
  `| Convertis en page VO | ${bilan.convertis} |`,
  `| Vérifiés, la page VO est la même que la VF | ${bilan.memePage} |`,
  `| Livre déjà en VO (Gun H(e)aven 3) | ${bilan.identiques} |`,
  `| Laissés en page VF, édition française dite (pas de VO pour ce livre ou ce passage) | ${bilan.mention} |`,
  `| Déjà en page VO avant ce script (différents du français) | ${bilan.dejaVo} |`,
  `| Descriptions 1.0 (tools/ge-1.0), non touchées | ${bilan.ge} |`,
  `| Douteux, laissés tels quels | ${bilan.douteux.length} |`,
  "",
  `Clés modifiées : ${bilan.cles.size}.`,
  "",
  ...(bilan.douteux.length ? ["## Douteux", "", ...bilan.douteux.map(d => `- ${d}`), ""] : [])
].join("\n")
console.log(rapport)
if (ecrire) {
  writeFileSync(join(racine, "lang", "en.json"), sortie.join(""), "utf8")
  console.log(`\nlang/en.json réécrit (${changees} lignes).`)
}
