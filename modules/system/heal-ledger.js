// Heal spell cards applied by the GM for a player (SR5 p. 291). The button lives in the card's flags, which its author
// can write again: the cards already applied are kept here, written by the active GM only, so a card heals once
export const HEAL_LEDGER = "sr5HealSpellLedger"
const KEEP = 200

export function registerHealLedger(){
  game.settings.register("sr5", HEAL_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
    },
  })
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

// The dice of a card, as the key of its cast: a copy of the card is a new message with the same dice, and must not
// heal again (Quitterie, S4). Two casts of the same spell by the same caster with the very same dice would share it:
// the GM then applies the second by hand. null when the card shows no dice
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
