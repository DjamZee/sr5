// Heal spell cards applied by the GM for a player (SR5 p. 291). The button lives in the card's flags, which its author
// can write again: the cards already applied are kept here, written by the active GM only, so a card heals once
export const HEAL_LEDGER = "sr5HealSpellLedger"
const KEEP = 200

// The groups of wounds a player treated on a patient she does not own, by patient: written by the active GM only
export const WOUND_GROUP_LEDGER = "sr5WoundGroupLedger"

export function registerHealLedger(){
  game.settings.register("sr5", HEAL_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
    },
  })
  game.settings.register("sr5", WOUND_GROUP_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
    },
  })
}

// The boxes of damage a patient carries, on every monitor that holds wounds
export function woundTotal(actor){
  const monitors = actor?.system?.conditionMonitors ?? {
  }
  return ["physical", "stun", "condition", "overflow"].reduce((sum, key) => sum + (Number(monitors[key]?.actual?.value) || 0), 0)
}

/**
 * Whether a group of wounds may still be treated (SR5 p. 207-208): first aid and the Heal spell once per group of
 * wounds, no first aid after Heal; damage taken afterwards is a new group. The ledger keeps the boxes the patient
 * carried after each treatment: more boxes now is new damage. A bound read on the patient, never on the card: a
 * retouched copy of a card treats nothing more (Harriet's second review). Damage healed naturally then taken again
 * below that mark is not seen: the GM treats it by hand.
 * @param {object} entry the patient's entry: { firstAid, heal } boxes after each treatment
 * @param {string} kind "firstAid" or "heal"
 * @param {number} total the boxes the patient carries now
 */
export function treatmentAllowed(entry, kind, total){
  const newGroup = mark => mark === undefined || mark === null || total > mark
  if (kind === "heal") return newGroup(entry?.heal)
  return newGroup(entry?.firstAid) && newGroup(entry?.heal)
}

function readWoundLedger(){
  try {
    return game.settings.get("sr5", WOUND_GROUP_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

// The patient's entry in the ledger
export function woundEntry(uuid){
  return readWoundLedger()[uuid] ?? null
}

// A treatment done: the boxes the patient carries afterwards. The active GM only; a new group overwrites the old one
export async function recordTreatment(uuid, kind, total){
  if (!uuid || !game.user.isGM || game.users.activeGM?.id !== game.user.id) return
  const ledger = readWoundLedger()
  const entry = {
    ...(ledger[uuid] ?? {
    })
  }
  //First aid is only allowed on a new group: the Heal of the old group no longer counts
  if (kind === "firstAid") delete entry.heal
  entry[kind] = total
  await game.settings.set("sr5", WOUND_GROUP_LEDGER, {
    ...ledger, [uuid]: entry
  })
}

// Undo a claim (the effect was refused after the GM's yes): the card may be shown again
export async function releaseHealCard(keys){
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return
  const ledger = {
    ...readLedger()
  }
  for (const key of [keys].flat().filter(Boolean)) delete ledger[key]
  await game.settings.set("sr5", HEAL_LEDGER, ledger)
}

export function healCardUsed(ledger, messageId){
  return !!messageId && Object.hasOwn(ledger ?? {
  }, messageId)
}

// The ledger once a card is applied; the oldest entries go beyond KEEP cards
export function ledgerAfterHeal(ledger, messageId, now){
  const entries = Object.entries({
    ...(ledger ?? {
    }), [messageId]: now
  }).sort((a, b) => a[1] - b[1])
  return Object.fromEntries(entries.slice(-KEEP))
}

// The dice of a card, as the key of its cast: an EXACT copy of the card is a new message with the same dice, and must
// not heal again (Quitterie, S4). A copy whose dice were touched (one die added) is not caught here: the dice are read
// on the card its author writes, and only the GM's confirmation stands then (Harriet's second review, measured).
// Two casts of the same spell by the same caster with the very same dice would share it: the GM then applies the
// second by hand. null when the card shows no dice
export function healCardDiceKey(data){
  let roll = data?.roll?.r
  if (typeof roll === "string") {
    try {
      roll = JSON.parse(roll)
    } catch {
      return null
    }
  }
  const results = roll?.terms?.[0]?.results
  if (!Array.isArray(results) || !results.length) return null
  return `dice|${data.owner?.actorId ?? ""}|${data.owner?.itemUuid ?? ""}|${results.map(d => `${d.result}${d.ruleOfSix ? "!" : ""}`).join(",")}`
}

function readLedger(){
  try {
    return game.settings.get("sr5", HEAL_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

// Whether one of these keys (the card, its dice) was applied already
export function healCardClaimed(keys){
  const ledger = readLedger()
  return [keys].flat().filter(Boolean).some(key => healCardUsed(ledger, key))
}

// Records the card under each of its keys, for the active GM only. False when one was already applied, or when this
// user cannot write it. Nothing is awaited between the test and the write
export async function claimHealCard(keys){
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return false
  keys = [keys].flat().filter(Boolean)
  let ledger = readLedger()
  if (!keys.length || keys.some(key => healCardUsed(ledger, key))) return false
  const now = Date.now()
  for (const key of keys) ledger = ledgerAfterHeal(ledger, key, now)
  await game.settings.set("sr5", HEAL_LEDGER, ledger)
  return true
}
