// Magic rules of the supplements the system had only as data (audit of the supplements, RESTE-A-FAIRE § 2, point 15).
// Pure functions, no Foundry: the hooks are in magic-supplements.js

const hasSpecialCase = (item, value) => Object.values(item?.system?.systemEffects ?? {
}).some(s => s?.category === "specialCase" && s?.value === value)

const hasSpiritPower = (item, value) => Object.values(item?.system?.systemEffects ?? {
}).some(s => s?.category === "spiritPower" && s?.value === value)

/* -------------------------------------------- */
// Harmonie élémentaire (Better Than Bad p. 145): "au début du Tour de Combat suivant l'activation du pouvoir, subissez
// 1 case de Drain non résisté. L'Adepte peut choisir à chaque fois s'il s'agit de dégâts Physiques ou Étourdissants".
// "À chaque fois" (VO "each time they suffer this damage"): one box at the start of each Combat Turn while Corps
// élémentaire (Street Grimoire p. 170) stays active

/** Corps élémentaire, known by its systemEffect, never by its name */
export function isElementalBody(item) {
  return item?.type === "itemAdeptPower" && hasSpecialCase(item, "elementalBody")
}

/** Whether `actor` takes the box of Harmonie élémentaire at this new Combat Turn */
export function elementalAttunementDue(actor) {
  if (!(Number(actor?.system?.magic?.masteries?.elementalAttunement?.value) > 0)) return false
  return listOf(actor?.items).some(i => isElementalBody(i) && i.system?.isActive)
}

/* -------------------------------------------- */
// Transmutation (Aetherologie p. 39), the rule of Transformation (Run Faster p. 75), the Mégapack's object: "les implants
// non-deltaware sont automatiquement rejetés lors de la transformation, causant des dégâts physiques équivalents à (coût
// total en Essence des implants × 10, arrondi à l'inférieur). Le personnage ne récupère pas l'Essence perdue". Deltaware
// "purement interne" stays: the system does not know which deltaware is external, the GM removes that one by hand

export function isTransmutation(item) {
  return item?.type === "itemPower" && hasSpiritPower(item, "transmutation")
}

/** The installed implants (not accessories, not stored away), each with whether the transformation rejects it */
export function transmutationImplants(items) {
  return listOf(items)
    .filter(i => i?.type === "itemAugmentation" && !i.system?.isAccessory && !i.system?.storedIn)
    .map(i => ({
      id: i.id, name: i.name, essence: Number(i.system?.essenceCost?.value) || 0, rejected: i.system?.grade !== "deltaware"
    }))
}

/** The Physical damage of the rejected implants: their Essence × 10, rounded down */
export function transmutationDamage(implants) {
  const essence = listOf(implants).filter(i => i.rejected).reduce((sum, i) => sum + (Number(i.essence) || 0), 0)
  return Math.floor(Math.round(essence * 100) / 10)
}

/* -------------------------------------------- */
// Pétrification (Street Grimoire p. 117-118, Shadow Spells p. 25): opposed test against Body; "la Puissance du sort doit
// également être égale ou supérieure à celle de la Constitution du sujet"; the subject is unconscious, and has "un indice
// d'Armure de Barrière (p. 198, SR5) égal à sa Constitution + les succès excédentaires". The barrier armor is carried
// as the hardened armor against weapons (a damage that does not exceed it does nothing, SR5 p. 197 and 397)

export const PETRIFICATION_ARMOR_TARGET = "system.specialProperties.hardenedArmors.normalWeapon"

export function isPetrification(item) {
  return item?.type === "itemSpell" && hasSpecialCase(item, "petrification")
}

/** Whether a spell of this Force petrifies a subject of this Body */
export function petrifies(force, body) {
  return (Number(force) || 0) >= (Number(body) || 0)
}

/** The barrier armor of the petrified subject: Body + net hits */
export function petrificationArmor(body, netHits) {
  return (Number(body) || 0) + Math.max(0, Number(netHits) || 0)
}

function listOf(items) {
  if (!items) return []
  return Array.isArray(items) ? items : [...(items.contents ?? items)]
}
