/**
 * Images par défaut des esprits (Clémence#4382, 17/10 ; décision de DjamZ du 14/10). DjamZ a fait sur Midjourney
 * un portrait et un jeton par type d'esprit et par palier de taille (ses images, libres d'usage). Ce script les
 * convertit en WebP dans assets/img/spirits/<type>/portrait-<palier>.webp et token-<palier>.webp (palier 1 = Petit,
 * 2 = Moyen, 3 = Grand, 4 = Colossal). Les sources ne sont ni renommées ni déplacées.
 *
 * Sources (l'orthographe des noms varie, d'où la correspondance par mot-clé de TYPES) :
 *   - portraits : ...\Esprits\PORTRAITS\PNG\<famille>\<Type> - <N> - <Palier>.png (carrés 1024 px)
 *   - jetons    : ...\Esprits\TOKENS\PNG\<famille>\<Type> <N>.png (cadre rond sur fond transparent)
 * Une nouvelle famille (esprits sauvages, insectes…) = une entrée de FAMILLES et ses mots-clés dans TYPES ; le code
 * du système accepte déjà qu'un type n'ait pas d'image (SPIRIT_IMAGE_TYPES, spirit-default-image.js).
 * Les entités de Howling Shadows (anarch…) sont rangées avec les PNJ : ...\PNJ\PORTRAITS\12.Entités extraplanaires\
 * <Nom> <N>.png et ...\PNJ\TOKENS\12.Entités extraplanaires\<Nom> <N>.png ; seules celles d'ENTITES y sont lues, avec
 * autant de paliers que DjamZ a fait d'images (SPIRIT_IMAGE_TIERS ; Eudoxie#6075, 22/10).
 *
 *   node tools/spirits-images.mjs [--racine <dossier Esprits>]
 *
 * Python et Pillow font la conversion, comme tools/mentors-images.mjs du Mégapack.
 */
import {
  spawnSync 
} from "node:child_process"
import {
  mkdirSync, readdirSync, statSync 
} from "node:fs"
import {
  join 
} from "node:path"

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const RACINE = arg("--racine") ?? "F:/FoundryVTT/Ressources Graphiques/Visuels/Esprits"
// --familles "Esprits Toxiques,Esprits de l'Ombre" : ne refaire que celles-là. Les esprits nécrotiques (cadavre, carcasse,
// détritus, feu pâle, pourriture) et l'esprit des os n'ont pas de type dans le système : leur dossier n'est pas lu.
const ENTITES_PNJ = "12.Entités extraplanaires"
const FAMILLES = arg("--familles")?.split(",") ?? [".Esprits Naturels", "Esprits Toxiques", "Esprits de l'Ombre", ENTITES_PNJ]
// le dossier des entités porte aussi des esprits libres sans type d'acteur (blackjack, Alquitat « Homme Vert »…) : on n'y
// lit que ces mots-clés, sans passer par TYPES (« homme » y donnerait l'esprit de l'homme)
const ENTITES = [["anarch", "anarch"]]
const CIBLE = "assets/img/spirits"
const PORTRAIT = {
  taille: 400, qualite: 72 
}
const JETON = {
  taille: 256, qualite: 75 
}

// mot-clé du nom de fichier (normalisé : minuscules, sans accent) → valeur de system.type de l'acteur esprit
const TYPES = [
  ["air", "air"], ["eau", "water"], ["feu", "fire"], ["terre", "earth"], ["homme", "man"],
  ["betes", "beasts"], ["plantes", "plant"], ["gardien", "guardian"], ["guide", "guidance"],
  ["ouvrier", "task"], ["ouvirer", "task"],
  // toxiques, ombres et sang (Rémi#2846, 21/10)
  ["abomination", "abomination"], ["deletere", "noxious"], ["epidemie", "plague"], ["fange", "sludge"],
  ["nucleaire", "nuclear"], ["sterilite", "barren"], ["cauchemar", "shadowNightmare"], ["muse", "shadowMuse"],
  ["noirceur", "shadowShade"], ["spectre", "shadowWraith"], ["succube", "shadowSuccubus"], ["sang", "blood"],
]

const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
const typeDe = (f) => TYPES.find(([k]) => new RegExp(`\\b${k}\\b`).test(norm(f)))?.[1]
const palierDe = (f) => Number(norm(f).match(/(?:^|\s)([1-4])(?:\s|\.png$)/)?.[1])

const PY = `import sys
from PIL import Image
src, dst, size, q = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src)
im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
im.thumbnail((size, size), Image.LANCZOS)
im.save(dst, "WEBP", quality=q, method=6)`

let total = 0, n = 0
const manque = []
for (const famille of FAMILLES) {
  for (const [genre, dossier, reglage] of [["portrait", "PORTRAITS", PORTRAIT], ["token", "TOKENS", JETON]]) {
    const pnj = famille === ENTITES_PNJ
    const src = pnj ? join(RACINE, "..", "PNJ", dossier, famille) : join(RACINE, dossier, "PNG", famille)
    for (const f of readdirSync(src).filter((x) => /\.png$/i.test(x))) {
      const type = pnj ? ENTITES.find(([k]) => new RegExp(`^${k}\\b`).test(norm(f)))?.[1] : typeDe(f), palier = palierDe(f)
      if (pnj && !type) continue
      if (!type || !palier) { manque.push(`${dossier}/${f}`); continue }
      mkdirSync(join(CIBLE, type), {
        recursive: true 
      })
      const dest = join(CIBLE, type, `${genre}-${palier}.webp`)
      const r = spawnSync("python", ["-c", PY, join(src, f), dest, String(reglage.taille), String(reglage.qualite)], {
        encoding: "utf8" 
      })
      if (r.status !== 0) throw new Error(`${f} : conversion échouée\n${r.stderr}`)
      total += statSync(dest).size
      n++
    }
  }
}
console.log(`${n} images, ${(total / 1024).toFixed(0)} Ko au total`)
if (manque.length) console.log(`Non reconnues :\n  ${manque.join("\n  ")}`)
