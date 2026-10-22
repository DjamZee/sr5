// Renvois de page dans un texte de lang/*.json : « SR5 p. 171 », « (Run & Gun p. 67-68) », « SR5 p. 68, 290, 312 »,
// « p. 420 » nu (livre = le dernier nommé avant dans la même chaîne).

// Code du livre -> noms anglais tels qu'ils figurent dans lang/en.json (le plus long d'abord à la recherche).
export const LIVRES_EN = {
  SR5: ["SR5", "Core Rulebook", "Core rulebook", "core rulebook", "Core"],
  RG: ["Run & Gun", "Run &amp; Gun", "RG"],
  RF: ["Run Faster", "RF"],
  R5: ["Rigger 5.0", "Rigger 5", "R5"],
  DTER: ["Dark Terrors"],
  DT: ["Data Trails", "DT"],
  HT: ["Hard Targets", "HT"],
  KC: ["Kill Code", "KC"],
  CA: ["Cutting Aces", "CA"],
  CF: ["Chrome Flesh", "CF"],
  ARC: ["Forbidden Arcana", "FA"],
  BTB: ["Better Than Bad", "BTB"],
  GO: ["Street Grimoire", "SG"],
  SL: ["Street Lethal", "SL"],
  HS: ["Howling Shadows", "HS"],
  BP: ["Bullets & Bandages", "Bullets &amp; Bandages", "BB"],
  SSP: ["Shadow Spells", "SSP"],
  AETH: ["Aetherology", "AETH"],
  TCT: ["The Complete Trog", "Complete Trog"],
  AV: ["Stolen Souls"],
  NF: ["No Future"],
  MP: ["Market Panic"],
  LD: ["Lockdown"],
  MA: ["Assassin's Primer", "Assassin’s Primer"],
  GH3: ["Gun H(e)aven 3", "Gun Heaven 3"]
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const NOMS = Object.entries(LIVRES_EN).flatMap(([code, noms]) => noms.map(nom => ({ code, nom })))
  .sort((a, b) => b.nom.length - a.nom.length)
const RX_LIVRE = new RegExp(`(?<![\\w-])(${NOMS.map(n => esc(n.nom)).join("|")})(?![\\w-])`, "g")
const CODE_DE = Object.fromEntries(NOMS.map(n => [n.nom, n.code]))

const PAGE = String.raw`(\d+)(?:\s*([-–])\s*(\d+))?`
// Une suite « , 290 » ou « and 312 » n'est une page que si rien d'autre qu'une ponctuation ne la suit.
const SUITE = String.raw`(\s*(?:,|and|et)\s*(?:pp?\.\s*)?)` + PAGE + String.raw`(?=\s*(?:[,;.):<]|and\b|et\b|$))`
const RX_GROUPE = new RegExp(String.raw`\bpp?\.\s*` + PAGE + `((?:${SUITE})*)`, "g")
const RX_SUITE = new RegExp(SUITE, "g")

/** Les pages d'un groupe « p. ... », chacune avec sa position dans le texte. */
function pagesDuGroupe(m) {
  const out = []
  const debut = m.index
  const tete = m[0].slice(0, m[0].length - m[4].length)
  const ofsA = tete.search(/\d/)
  out.push({ a: +m[1], sep: m[2] ?? null, b: m[3] ? +m[3] : null, start: debut + ofsA, end: debut + tete.length })
  const base = debut + tete.length
  for (const s of m[4].matchAll(RX_SUITE)) {
    const st = base + s.index + s[1].length
    out.push({ a: +s[2], sep: s[3] ?? null, b: s[4] ? +s[4] : null, start: st, end: base + s.index + s[0].length })
  }
  return out
}

// Chaînes dont le renvoi ne nomme aucun livre : le livre, lu dans le français et le contexte de la clé.
export const LIVRE_PAR_CLE = [
  [/^SR5\.FACTION_/, "CA"], // Réputation de faction, Cutting Aces p. 156-160
  [/^SR5\.ShopCommonGoods$/, "SR5"],
  [/^SR5\.COMMCODE_CipherHint$/, "SR5"] // Éditer un fichier
]

/** Tous les renvois d'un texte anglais : [{code|null, nom, ecart, mention, a, b, sep, start, end}]. */
export function renvoisEn(texte, cle = "") {
  const defaut = LIVRE_PAR_CLE.find(([rx]) => rx.test(cle))?.[1] ?? null
  const livres = [...texte.matchAll(RX_LIVRE)].map(m => ({ code: CODE_DE[m[1]], nom: m[1], start: m.index, end: m.index + m[1].length }))
  const out = []
  for (const g of texte.matchAll(RX_GROUPE)) {
    const avant = livres.filter(l => l.end <= g.index).at(-1)
    const entre = avant ? texte.slice(avant.end, g.index) : ""
    for (const p of pagesDuGroupe(g)) {
      out.push({
        code: avant?.code ?? defaut,
        nom: avant?.nom ?? null,
        ecart: avant ? entre.length : -1,
        mention: /French edition|édition française/i.test(entre),
        ...p
      })
    }
  }
  return out
}

/** Numéros de page cités dans un texte (toute langue), dans l'ordre : a, puis b s'il y a une plage. */
export function numeros(texte) {
  const out = []
  for (const g of texte.matchAll(RX_GROUPE)) for (const p of pagesDuGroupe(g)) out.push(p.a, ...(p.b ? [p.b] : []))
  return out
}
