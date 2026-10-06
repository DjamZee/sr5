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

// Records the card, for the active GM only. False when it was already applied, or when this user cannot write it
export async function claimHealCard(messageId){
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return false
  let ledger
  try {
    ledger = game.settings.get("sr5", HEAL_LEDGER) ?? {
    }
  } catch {
    ledger = {
    }
  }
  if (healCardUsed(ledger, messageId)) return false
  await game.settings.set("sr5", HEAL_LEDGER, ledgerAfterHeal(ledger, messageId, Date.now()))
  return true
}
