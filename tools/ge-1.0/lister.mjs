// Lists the keys to rewrite for the 1.0 and shares them between the family files (run once; --verifier checks the split)
// Keys: every _GE description, and the long strings (> 200 characters) inherited unchanged from upstream
import fs from "node:fs"
import path from "node:path"
import {
  AMONT, BASE, DOSSIER, LANGUES, lireLangue, sansBalises 
} from "./commun.mjs"

// Shorter strings sharing a 45-character window with a book (balayer-livres.mjs on dc8f88fcd, FR only: the cache
// holds the VF): the labels of tables and short descriptions
export const COMPLEMENTS = new Set([
  "SR5.AssensingResult1a", "SR5.AssensingResult1b", "SR5.AssensingResult2a", "SR5.AssensingResult2b", "SR5.AssensingResult2c",
  "SR5.AssensingResult3a", "SR5.AssensingResult3b", "SR5.AssensingResult3c", "SR5.AssensingResult3d", "SR5.AssensingResult4a",
  "SR5.AssensingResult4c", "SR5.AssensingResult5a", "SR5.AssensingResult5b", "SR5.AssensingResult5c",
  "SR5.AttackModFiringWithImagingDevice", "SR5.CA_Maneuver_drillSergeant_Effect", "SR5.CA_Maneuver_hustle_Effect",
  "SR5.CFD_ScrubGlitch", "SR5.CHASE_TerrainBookBook_clear", "SR5.CHASE_TerrainBookBook_limited",
  "SR5.CHASE_TerrainBookBook_normal", "SR5.CHASE_TerrainBookBook_restricted", "SR5.CHASE_TerrainR5Book_r5Impossible",
  "SR5.CHASE_TerrainR5Book_r5Light", "SR5.CHASE_TerrainR5Book_r5Obstructed", "SR5.CHASE_TerrainR5Book_r5Open",
  "SR5.CHASE_TerrainR5Book_r5Restricted", "SR5.CHASE_TerrainR5Book_r5Tight", "SR5.CON_Step_evaluation_D",
  "SR5.HermeticElementalist_D", "SR5.MatrixActionSwapTwoPrograms", "SR5.PerceptionModFarAway",
  "SR5.PerceptionModSpecificallyLooking", "SR5.SETTINGS_CommcodeCipher_D", "SR5.SETTINGS_WithdrawalModifier_D",
  "SR5.SceneSpamMajorEvent", "SR5.SceneSpamMassiveGatering", "SR5.SceneStaticRemotePlace", "SR5.SceneStaticRuralArea",
  "SR5.SocialModAuthority", "SR5.SocialModBadLook", "SR5.SocialModBlackmailed", "SR5.SocialModEvaluateSituation",
  "SR5.SocialModEvidence", "SR5.SocialModFan", "SR5.SocialModLacksKnowledge", "SR5.SocialModNervous",
  "SR5.SocialModObliviousToDanger", "SR5.SocialModOutnumber", "SR5.SocialModOutnumberTarget", "SR5.SocialModReputation",
  "SR5.SocialModRomantic", "SR5.SocialModStrata", "SR5.SocialModTorture", "SR5.SocialModWieldingWeapon",
  "SR5.SocialModWieldingWeaponTarget", "SR5.VehicleModSpecialSkill"
])

// The four sprite descriptions found by Gaston#6620, written in the 1b file (Sprite*)
export const AJOUTS = [
  "SR5.SpriteCompanionDescription", "SR5.SpriteCourierDescription", "SR5.SpriteCrackDescription",
  "SR5.SpriteGeneralistDescription"
]

export const FAMILLES = [
  {
    fichier: "1d-complements.json", test: cle => COMPLEMENTS.has(cle)
  },
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
  for (const cle of [...COMPLEMENTS, ...AJOUTS]) cles.add(cle)
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
