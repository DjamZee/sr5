/**
 * What the GM's browser accepts from the generic sockets (updateItem, deleteItem, createItemEffect,
 * updateActorData). Security lot of Sixtine, ruled by DjamZ and Élise before the djamz.11.
 *
 * The server stamps the sender: a GM, or an owner of the target (the actor, or the actor that holds
 * the item), writes as before. Anyone else may only ask for one of the uses below, the effect of a
 * card on what she does not own. The GM reads that card again from the chat log (never from the
 * request): its author must be a GM or own the actor that rolled it, and what it changes is bounded
 * by the sheet (the pool the GM's browser prepares, plus Chance, SR5 p. 56) and by the item itself:
 * numbers only go down, switches only go off, a monitor never fills past its size.
 *
 * Pure rules here; the lookups are in miscellaneous.js.
 */

/** Whether `user` may write on `document` (an actor, or an item through the actor holding it). */
export function ownsTarget(user, document) {
  if (!user || !document) return false
  if (user.isGM) return true
  const holder = document.documentName === "Item" ? (document.parent ?? document) : document
  return !!holder?.testUserPermission?.(user, "OWNER")
}

/**
 * Whether a card may stand behind a request: written by a GM, or by an owner of the actor that
 * rolled it (`rollerOwned`, worked out by the caller from the card's owner.actorId).
 */
export function cardTrusted(author, rollerOwned) {
  if (!author) return false
  return author.isGM || !!rollerOwned
}

const isNumber = value => typeof value === "number" && Number.isFinite(value)

/**
 * The test types each use accepts (Zélia's review, B2: a Perception card opened a maglock). The card
 * must be the test the rule names, rolled by the actor the rule names.
 */
export const USE_TESTS = {
  // Matrix damage: the defender who wins hurts the attacker; the loser of a resistance takes it
  matrixDamage: ["matrixDefense", "matrixResistance", "iceDefense", "complexFormDefense"],
  deactivateFocus: ["enchantmentResistance"],
  reduceEffect: ["dispellResistance", "disjointingResistance", "complexFormResistance"],
  dispelledEffect: ["dispellResistance", "disjointingResistance", "complexFormResistance"],
  // A skill test is written "skillDicePool" on its card (rollData-Skill.js), measured in game
  maglock: ["skillDicePool"],
  support: ["matrixAction"],
}

/** Whether a card of this test type (and sub-type) may stand behind this use. */
export function testAllowed(use, test) {
  if (!(USE_TESTS[use] ?? []).includes(test?.type)) return false
  if (use === "maglock") return test.typeSub === "locksmith"
  if (use === "support") return ["iAmTheFirewall", "intervene"].includes(test.typeSub)
  return true
}

/**
 * The test a reducing card answers (dispelling, disenchanting, Kill Complex Form), and where the GM
 * reads its pool on the sheet of the actor who rolled it.
 */
export const REDUCER_POOLS = {
  counterspelling: "skills.counterspelling.test.dicePool",
  disenchanting: "skills.disenchanting.test.dicePool",
  killComplexForm: "matrix.resonanceActions.killComplexForm.test.dicePool",
}

/**
 * The hits of a card counted again on its dice (SR5 p. 44): only the first `allowed` dice of the pool
 * count, the rerolls of the Rule of Six after them (p. 58). null when the card shows no dice.
 */
export function recountHits(rollJSON, allowed) {
  let roll = rollJSON
  if (typeof roll === "string") {
    try {
      roll = JSON.parse(roll)
    } catch {
      return null
    }
  }
  const results = roll?.terms?.[0]?.results
  if (!Array.isArray(results)) return null
  const kept = results.filter(d => !d.ruleOfSix).slice(0, Math.max(0, Math.floor(Number(allowed)) || 0))
  const rerolls = results.filter(d => d.ruleOfSix)
  return [...kept, ...rerolls].filter(d => d.active !== false && d.discarded !== true && Number(d.result) >= 5).length
}

/** The key of a card spent on a use and a target: a card serves once per use (Zélia's review, B3). */
export function consumedKey(messageId, use, targetUuid = "") {
  return `${messageId}|${use}|${targetUuid}`
}

/** A whole number from 0 to `cap`: what a card's claimed hits count at most. */
export function bounded(claimed, cap) {
  const value = Math.floor(Number(claimed))
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(value, Math.max(0, Math.floor(Number(cap)) || 0))
}

/** A number that may only go down, and not below `floor`. */
function lowered(next, current, floor = 0) {
  return isNumber(next) && next >= floor && next <= (Number(current) || 0)
}

//An effect weakened (dispelling): a bonus goes down, a malus (Decrease Attribute) goes back up, neither past 0
function towardZero(next, current) {
  const c = Number(current) || 0
  return isNumber(next) && (c < 0 ? (next <= 0 && next >= c) : (next >= 0 && next <= c))
}

const off = next => next === false

/**
 * Matrix damage on a device (SR5 p. 228): its monitor only fills, by the card's damage at most
 * (plus one for a virtual machine, p. 247) and never past its size. Switched off when bricked.
 * @param {object} changes the fields that differ from the stored system
 * @param {object} stored the item's stored system
 * @param {number} size the monitor's prepared size
 * @param {number} damage the most boxes the card may fill
 */
export function matrixDamageAllowed(changes, stored, size, damage) {
  const allowed = ["conditionMonitors", "isActive", "wirelessTurnedOn"]
  if (Object.keys(changes).some(key => !allowed.includes(key))) return false
  if ("isActive" in changes && !off(changes.isActive)) return false
  if ("wirelessTurnedOn" in changes && !off(changes.wirelessTurnedOn)) return false
  const monitor = changes.conditionMonitors
  if (monitor === undefined) return true
  if (Object.keys(monitor).some(key => key !== "matrix")) return false
  if (!monitor.matrix || Object.keys(monitor.matrix).some(key => key !== "actual")) return false
  const before = stored?.conditionMonitors?.matrix?.actual ?? {
  }
  for (const [key, value] of Object.entries(monitor.matrix.actual ?? {
  })) {
    if (!["base", "value"].includes(key)) return false
    const was = Number(before[key]) || 0
    if (!isNumber(value) || value < was || value > size || value - was > damage) return false
  }
  return true
}

/** A focus switched off by disenchanting (SR5 p. 304): that switch, nothing else. */
export function deactivateAllowed(changes) {
  return Object.keys(changes).length === 1 && off(changes.isActive)
}

/**
 * A spell, complex form or preparation weakened by a card (dispelling, SR5 p. 299; Kill Complex Form,
 * p. 252; disjointing, Street Grimoire): its hits (or potency) go down by the card's net hits at most,
 * and the effects it held up lose their value with them.
 * @param {object} changes the fields that differ from the stored system
 * @param {object} stored the item's stored system
 * @param {number} netHits the most the card may take away
 * @param {boolean} linked an effect the item held up, rather than the item itself
 * @param {string} key "hits", or "potency" for a preparation
 */
export function reduceAllowed(changes, stored, netHits, linked = false, key = "hits") {
  for (const [field, value] of Object.entries(changes)) {
    if (!linked && field === key) {
      if (!lowered(value, stored?.[key], Math.max(0, (Number(stored?.[key]) || 0) - netHits))) return false
    } else if (linked && field === "value") {
      if (!towardZero(value, stored?.value)) return false
    } else if (field === "isActive") {
      if (!off(value)) return false
    } else if (!linked && field === "targetOfEffect") {
      const kept = Array.isArray(stored?.targetOfEffect) ? stored.targetOfEffect : []
      if (!Array.isArray(value) || value.some(uuid => !kept.includes(uuid))) return false
    } else if (linked && field === "customEffects") {
      //Stored as a list, the change of one value comes as the whole entry: everything but the value must stay as stored
      for (const [id, effect] of Object.entries(value ?? {
      })) {
        const before = stored?.customEffects?.[id]
        if (!effect || !before) return false
        if (Object.keys(effect).some(k => k !== "value" && JSON.stringify(effect[k]) !== JSON.stringify(before[k]))) return false
        if (!towardZero(effect.value, before.value)) return false
      }
    } else return false
  }
  return true
}

/**
 * A Kill Code support effect (I Am the Firewall, Intervene, p. 43-44) on an ally: an itemEffect of
 * that kind, of the hacker the card names, its value the card's hits within the hacker's pool, and
 * replacing only that hacker's earlier effects of that kind.
 * @param {object} effect the effect, flat keys allowed ("system.type")
 * @param {string} hackerId the id of the actor that rolled the card
 * @param {number} hits the card's hits, already bounded by the hacker's pool
 * @param {object[]} replaced the items to remove first
 */
export function supportEffectAllowed(effect, hackerId, hits, replaced) {
  if (!effect || effect.type !== "itemEffect") return false
  const flat = foundry.utils.flattenObject(effect)
  const type = flat["system.type"]
  if (!["iAmTheFirewall", "intervene"].includes(type) || flat["system.ownerID"] !== hackerId) return false
  if (!isNumber(flat["system.value"]) || flat["system.value"] > hits) return false
  for (const [keyPath, value] of Object.entries(flat)) {
    if (/^system\.customEffects\.[^.]+\.value$/.test(keyPath) && (!isNumber(value) || value > hits)) return false
  }
  return replaced.every(item => item && item.type === "itemEffect" && item.system?.ownerID === hackerId && item.system?.type === type)
}

/** One service spent of a spirit (SR5 p. 300): exactly one, and none when it has none left. */
export function serviceSpentAllowed(changes, storedServices) {
  const keys = Object.keys(changes)
  if (keys.length !== 1 || keys[0] !== "services") return false
  const services = changes.services ?? {
  }
  const current = Number(storedServices) || 0
  return Object.keys(services).length === 1 && services.value === current - 1 && current > 0
}

/** A maglock opened by a card (SR5 p. 365): its casing comes off, its anti-tamper goes. */
export function maglockAllowed(changes, storedMaglock) {
  const keys = Object.keys(changes)
  if (keys.length !== 1 || keys[0] !== "maglock") return false
  const stored = storedMaglock ?? {
  }
  const entries = Object.entries(changes.maglock ?? {
  })
  return entries.length > 0 && entries.every(([key, value]) =>
    (key === "caseRemoved" && value === true && stored.caseRemoved !== true) ||
    (key === "hasAntiTamper" && value === false && stored.hasAntiTamper === true))
}
