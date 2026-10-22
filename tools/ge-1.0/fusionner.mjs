// Writes the checked family files into lang/fr.json and lang/en.json, line by line (tabs, CRLF and key order kept).
// Refuses to run while verifier.mjs reports an error. An entry left empty keeps its current text; « garder » too.
// Usage : node tools/ge-1.0/fusionner.mjs [--sec]   (--sec : count what would change, write nothing)
import fs from "node:fs"
import path from "node:path"
import {
  execFileSync 
} from "node:child_process"
import {
  DOSSIER, LANGUES, RACINE, fichiersFamilles, lireJson 
} from "./commun.mjs"

const sec = process.argv.includes("--sec")
try {
  execFileSync(process.execPath, [path.join(DOSSIER, "verifier.mjs")], {
    stdio: "inherit" 
  })
} catch {
  console.error("verifier.mjs signale des erreurs : rien n'est fusionné.")
  process.exit(1)
}

const nouveaux = Object.fromEntries(LANGUES.map(l => [l, {
}]))
for (const nom of fichiersFamilles()) for (const [cle, e] of Object.entries(lireJson(path.join(DOSSIER, nom)).entrees)) {
  if (e.garder) continue
  for (const l of LANGUES) if (String(e[l] ?? "").trim()) nouveaux[l][cle] = e[l]
}

const echapper = cle => cle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
for (const langue of LANGUES) {
  const fichier = path.join(RACINE, "lang", `${langue}.json`)
  let texte = fs.readFileSync(fichier, "utf8")
  let n = 0
  for (const [cle, valeur] of Object.entries(nouveaux[langue])) {
    // The lang files are flat: one "key": "value" per line
    const motif = new RegExp(`^(\\t"${echapper(cle)}": )"(?:[^"\\\\]|\\\\.)*"(,?)(\\r?)$`, "m")
    if (!motif.test(texte)) { console.error(`${langue} ${cle} : ligne introuvable`); process.exit(1) }
    texte = texte.replace(motif, (_, debut, virgule, cr) => `${debut}${JSON.stringify(valeur)}${virgule}${cr}`)
    n++
  }
  JSON.parse(texte)
  if (!sec) fs.writeFileSync(fichier, texte)
  console.log(`${langue}.json : ${n} texte(s) ${sec ? "à remplacer" : "remplacé(s)"}`)
}
