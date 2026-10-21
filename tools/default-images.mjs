/**
 * Images par défaut des CI, des sprites et des contacts (Rémi#2846, 21/10 ; sur le modèle de tools/spirits-images.mjs).
 * DjamZ a fait ces images sur Midjourney (ses images, libres d'usage). Ce script les convertit en WebP :
 *   - CI       : assets/img/ice/<deviceSubType>/portrait.webp et token.webp
 *   - sprites  : assets/img/sprites/<type>/portrait.webp et token.webp
 *   - contacts : assets/img/contacts/<n>.webp (portrait) et <n>-token.webp (jeton rond, Corentin#5590 le 21/10) et la
 *                liste modules/entities/actors/contact-images-list.js (métier, métatype, genre, jeton s'il existe)
 * Les sources ne sont ni renommées ni déplacées.
 *
 * Sources :
 *   - CI       : ...\CI\CI - originaux\ci-<nom>.png (portraits) ; ...\CI\Tokens CI - webp\ci-<nom>[-token].webp (jetons)
 *   - sprites  : ...\Sprites\PORTRAITS\Sprite - <Type>.png ; ...\Sprites\TOKENS\Token - webp\Sprite - <Type> - Token.webp
 *   - contacts : ...\Contacts\PORTRAITS\WEBP\<Métier> - <Métatype> - <Genre>.webp (les .webp seulement, DjamZ le 21/10) ;
 *                ...\Contacts\TOKENS\<même nom> - token.png (jetons ronds ; un portrait sans jeton garde son portrait pour jeton)
 *
 *   node tools/default-images.mjs [--racine <dossier Visuels>]
 *
 * Python et Pillow font la conversion, comme tools/spirits-images.mjs.
 */
import {
  spawnSync
} from "node:child_process"
import {
  mkdirSync, readdirSync, statSync, writeFileSync
} from "node:fs"
import {
  join
} from "node:path"

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const RACINE = arg("--racine") ?? "F:/FoundryVTT/Ressources Graphiques/Visuels"
const PORTRAIT = {
  taille: 400, qualite: 72
}
const JETON = {
  taille: 400, qualite: 75
}

// nom de fichier de la CI (VF) → deviceSubType
const CI = {
  acide: "iceAcid", blaster: "iceBlaster", bloqueuse: "iceJammer", "blue-goo": "iceBlueGoo", brouilleuse: "iceScramble",
  catapulte: "iceCatapult", choc: "iceShocker", clignoteuse: "iceFlicker", crash: "iceCrash", detective: "iceSleuther",
  fragmenteuse: "iceBinder", furie: "iceSparky", limier: "iceBloodhound", noire: "iceBlack", patrouilleuse: "icePatrol",
  "pot-de-colle": "iceTarBaby", rongeuse: "iceMarker", sonde: "iceProbe", traqueuse: "iceTrack", tueuse: "iceKiller",
}
// nom du sprite (VF) → system.type de l'acteur sprite
const SPRITES = {
  Compagnon: "companion", Coursier: "courier", Cracker: "crack", "Données": "data", Erreur: "fault",
  "Généraliste": "generalist", Machine: "machine",
}

const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
const METATYPES = [["humain", "human"], ["elfe", "elf"], ["nain", "dwarf"], ["ork", "ork"], ["troll", "troll"], ["enfant", "human"]]
const GENRES = [["femme", "female"], ["homme", "male"]]

const PY = `import sys
from PIL import Image
src, dst, size, q = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src)
im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
im.thumbnail((size, size), Image.LANCZOS)
im.save(dst, "WEBP", quality=q, method=6)`

let total = 0, n = 0
function convertir(src, dest, reglage) {
  const r = spawnSync("python", ["-c", PY, src, dest, String(reglage.taille), String(reglage.qualite)], {
    encoding: "utf8"
  })
  if (r.status !== 0) throw new Error(`${src} : conversion échouée\n${r.stderr}`)
  total += statSync(dest).size
  n++
}

// CI
const ciPortraits = join(RACINE, "CI", "CI - originaux"), ciJetons = join(RACINE, "CI", "Tokens CI - webp")
const jetonsCi = readdirSync(ciJetons)
for (const [nom, type] of Object.entries(CI)) {
  mkdirSync(join("assets/img/ice", type), {
    recursive: true
  })
  convertir(join(ciPortraits, `ci-${nom}.png`), join("assets/img/ice", type, "portrait.webp"), PORTRAIT)
  const jeton = jetonsCi.find((f) => f === `ci-${nom}-token.webp`) ?? jetonsCi.find((f) => f === `ci-${nom}.webp`)
  convertir(join(ciJetons, jeton), join("assets/img/ice", type, "token.webp"), JETON)
}

// Sprites
for (const [nom, type] of Object.entries(SPRITES)) {
  mkdirSync(join("assets/img/sprites", type), {
    recursive: true
  })
  convertir(join(RACINE, "Sprites", "PORTRAITS", `Sprite - ${nom}.png`), join("assets/img/sprites", type, "portrait.webp"), PORTRAIT)
  convertir(join(RACINE, "Sprites", "TOKENS", "Token - webp", `Sprite - ${nom} - Token.webp`), join("assets/img/sprites", type, "token.webp"), JETON)
}

// Contacts : « Métier - Métatype - Genre[ N] » ; « Nom - Métier » pour un personnage nommé
const srcContacts = join(RACINE, "Contacts", "PORTRAITS", "WEBP"), srcJetons = join(RACINE, "Contacts", "TOKENS")
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
// jetons par nom de portrait ; deux noms s'en écartent : sans « - token » (Propriétaire de magasin elfe femme) ou
// sans numéro (« Homme » pour « Homme 1 »)
const jetons = new Map(readdirSync(srcJetons).filter((x) => /\.png$/i.test(x))
  .map((x) => [slug(x.replace(/( - token)?\.png$/i, "")), x]))
const liste = [], sansJeton = []
mkdirSync("assets/img/contacts", {
  recursive: true
})
for (const f of readdirSync(srcContacts).filter((x) => /\.webp$/i.test(x)).sort()) {
  const parts = f.replace(/\.webp$/i, "").split(" - ").map((p) => p.trim())
  const metatype = METATYPES.find(([k]) => norm(parts[1] ?? "").startsWith(k))?.[1] ?? ""
  const gender = GENRES.find(([k]) => norm(parts[2] ?? "").startsWith(k))?.[1] ?? ""
  const named = parts.length === 2 && !metatype
  const base = slug(f.replace(/\.webp$/i, ""))
  const entry = {
    file: `${base}.webp`, job: norm(named ? parts[1] : parts[0]), metatype, gender,
  }
  if (named) entry.named = true
  convertir(join(srcContacts, f), join("assets/img/contacts", entry.file), PORTRAIT)
  const jeton = jetons.get(base) ?? jetons.get(base.replace(/-\d+$/, ""))
  if (jeton) {
    entry.token = `${base}-token.webp`
    convertir(join(srcJetons, jeton), join("assets/img/contacts", entry.token), JETON)
  } else sansJeton.push(f)
  liste.push(entry)
}
writeFileSync("modules/entities/actors/contact-images-list.js", `/** Generated by tools/default-images.mjs: DjamZ's contact pictures, their job (lowercase, no accent), metatype, gender and round token if any. */
export const CONTACT_IMAGES = [
${liste.map((e) => `  {\n    ${JSON.stringify(e).slice(1, -1)}\n  },`).join("\n")}
]
`)
console.log(`${n} images, ${(total / 1024).toFixed(0)} Ko au total ; ${liste.length} contacts`)
if (sansJeton.length) console.log(`Sans jeton rond (le portrait sert de jeton) : ${sansJeton.join(", ")}`)
