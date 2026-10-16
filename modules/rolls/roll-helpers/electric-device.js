// Electric weapons against a device (SR5 p. 172-173): "Les équipements électroniques et les drones peuvent aussi être
// affectés par les dommages électriques. Ils ne souffrent jamais de dommages étourdissants […] résistent normalement aux
// dommages et subissent un effet secondaire […] des dommages matriciels égaux à la moitié des dommages physiques
// (arrondis à l'inférieur)". The drone goes through its own sheet (test-Defense.js, takeDamage). A device actor
// (camera, maglock, terminal) has neither a defense test, nor Body and Armor, nor a Physical monitor:
// - it does not dodge, as a barrier (SR5 p. 198): every hit of the attacker adds to the DV;
// - it resists with Device Rating x 2, the pool Street Lethal p. 57 gives a device whose Firewall is not given. The
//   book gives no physical resistance to a device: arbitrage, the gamemaster changes the pool in the dialog;
// - only the matrix half of the damage stays on it, it has no other monitor.
// A character hit by an electric weapon takes it alone: his gear is only reached by a called shot (SR5 p. 173, 196).

/** Whether this hit is an electric one on a device actor. */
export function isElectricHitOnDevice(actor, attack) {
  return actor?.type === "actorDevice" && attack?.damage?.element === "electricity"
}

/**
 * Whether this hit on a device actor carries no electricity: the device has no defense to roll, the gamemaster is told
 * that she rules on it (SR5.INFO_DeviceOnlyElectricity). « Se défendre » did nothing at all (Lucas#2058, R3).
 */
export function isPlainHitOnDevice(actor, attack) {
  return actor?.type === "actorDevice" && attack?.damage?.element !== "electricity"
}

/**
 * The resistance card of a device hit by an electric weapon, from the attack card already read again
 * (trustedAttackCard): no defense, the DV and all the hits, always Physical. Not an attack card any more, so the
 * resistance does not read it again as one (attack-card.js, attackFamily).
 */
export function deviceElectricResistanceData(attack) {
  const data = foundry.utils.deepClone(attack)
  const hits = Math.max(0, Number(attack.roll?.hits) || 0)
  data.test.type = "defense"
  data.roll.netHits = hits
  data.damage.value = (Number(attack.damage?.base) || 0) + hits
  data.damage.type = "physical"
  data.damage.resistanceType = "physicalDamage"
  data.damage.isAttack = true
  return data
}

/** The pool a device resists electricity with: Device Rating x 2 (see above). */
export function deviceElectricPool(actor, label) {
  const rating = Number(actor?.system?.matrix?.deviceRating) || 0
  return [{
    source: label, type: "linkedAttribute", value: rating
  }, {
    source: label, type: "linkedAttribute", value: rating
  }]
}

/** The matrix damage of an electric hit on a device or a drone: half the Physical damage, rounded down (SR5 p. 173). */
export function electricMatrixDamage(physical) {
  return Math.max(0, Math.floor((Number(physical) || 0) / 2))
}
