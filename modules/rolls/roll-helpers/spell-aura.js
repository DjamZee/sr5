// Aura of [element] (Street Grimoire p. 114, VF Grimoire des Ombres): "Chaque succès sur le test de Lancement de sort
// augmente la Valeur de Dommages de toutes les attaques de mêlée du sujet de 1. De plus les dommages deviennent des
// dommages élémentaires (p. 105 et p. 170, SR5), la Pénétration d'Armure étant inchangée. Enfin, toute personne réussissant
// une attaque contre le sujet subit des dommages élémentaires de la part de l'aura de VD égale aux succès excédentaires
// du sort." Each element is its own spell (Aura de feu, Aura d'électricité…): its effects name the element
// (system.specialProperties.spellAuraElement) and give the hits (system.specialProperties.spellAura).
// The subject is willing: the spell is not opposed, its net hits are its hits. The attack that burns its author is read
// as a melee one, as for the energy aura of the spirits (SR5 p. 397): the aura wraps the subject's body.

/** The effect targets whose value is a name held in the effect's type: a transferred copy keeps that type */
export const NAMED_BY_TYPE_TARGETS = ["system.specialProperties.energyAura", "system.specialProperties.spellAuraElement"]

/** The aura the actor wears: its value (the hits) and its element, or null */
export function spellAuraOf(actorSystem) {
  const value = Number(actorSystem?.specialProperties?.spellAura?.value) || 0
  const element = actorSystem?.specialProperties?.spellAuraElement
  return value > 0 && element ? {
    value, element
  } : null
}

/** The type of the elemental damage of the aura: fire, cold or acid are Physical (SR5 p. 170-173), electricity keeps the attack's */
export function spellAuraDamageType(element, type) {
  return element === "electricity" ? type : "physical"
}

/** The type of the damage the aura deals back: Stun for electricity, as most electric weapons, Physical otherwise */
export function spellAuraBackfireType(element) {
  return element === "electricity" ? "stun" : "physical"
}
