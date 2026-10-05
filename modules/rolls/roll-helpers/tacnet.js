// Personal integrated tactical network, RP-Tac or tacnet (Run & Gun p. 118-119). One unit serves a team: at
// most Device Rating x 1.5 members at a time, drones included; its bearer is one of them. Its members get:
// - level I: +1 die to all Perception tests;
// - level II: +2 Perception, +1 Sneaking, combat mode +1 die to one combat skill each member picks;
// - level III: +3 Perception, +2 Sneaking and Tracking, combat mode +2.
// Street Lethal p. 176: any bonus from an RP-Tac also applies to the Small Unit Tactics and Mixed Unit
// Tactics tests (knowledge skills here, recognised by their name). Team coordination, the upgrade unit and
// the vehicle access are left to the table.
// Who is a member lives in a hidden world setting written by the active GM alone (a roster the GM must
// trust); the combat skill a member picks is that member's own choice, kept on his actor.

export const TACNET_LEVELS = {
  1: {
    perception: 1
  },
  2: {
    perception: 2, sneaking: 1, combat: 1
  },
  3: {
    perception: 3, sneaking: 2, tracking: 2, combat: 2
  },
}

// Run & Gun p. 119: the combat skills the combat mode may pick from
export const TACNET_COMBAT_SKILLS = ["automatics", "clubs", "blades", "unarmedCombat", "longarms", "pistols"]

const TACTICS_NAMES = /tactiques?\s+d['’]\s*(escouade|unit[ée]s?\s+mixtes?|petites?\s+unit[ée]s?)|(small|mixed)\s+unit\s+tactics|squad\s+tactics/i

export function isTacticsKnowledge(name){
  return TACTICS_NAMES.test(name || "")
}

export function tacnetCapacity(deviceRating){
  return Math.floor((Number(deviceRating) || 0) * 1.5)
}

export function tacnetLevel(level){
  const n = parseInt(level)
  return TACNET_LEVELS[n] ? n : 0
}

// The members of a network: its bearer first, then the roster the GM keeps
export function tacnetMembers(ledger, deviceUuid, bearerUuid){
  const roster = (ledger?.[deviceUuid] ?? []).filter(u => u !== bearerUuid)
  return bearerUuid ? [bearerUuid, ...roster] : roster
}

// The roster once a member joins, or why he cannot: the network is full, he is already in
export function ledgerAfterJoin(ledger, deviceUuid, memberUuid, {
  deviceRating, bearerUuid
}){
  const next = {
    ...(ledger ?? {
    })
  }
  const members = tacnetMembers(ledger, deviceUuid, bearerUuid)
  if (!deviceUuid || !memberUuid) return {
    ledger: next, error: "invalid"
  }
  if (members.includes(memberUuid)) return {
    ledger: next, error: "already"
  }
  if (members.length >= tacnetCapacity(deviceRating)) return {
    ledger: next, error: "full"
  }
  next[deviceUuid] = [...(ledger?.[deviceUuid] ?? []).filter(u => u !== bearerUuid), memberUuid]
  return {
    ledger: next, error: null
  }
}

export function ledgerAfterLeave(ledger, deviceUuid, memberUuid){
  const next = {
    ...(ledger ?? {
    })
  }
  if (next[deviceUuid]) next[deviceUuid] = next[deviceUuid].filter(u => u !== memberUuid)
  return next
}

// The bonus dice an RP-Tac gives a roll: the best network the roller is a member of (two networks do not add up)
// networks: [{name, level, active, members: [uuids]}]
// roll: {skill (the skill key, a weapon's skill for an attack), knowledgeName, combatChoice}
export function tacnetBonus(networks, memberUuid, roll){
  let best = null
  for (const net of networks ?? []){
    if (!net.active || !net.members?.includes(memberUuid)) continue
    const bonus = TACNET_LEVELS[tacnetLevel(net.level)]
    if (!bonus) continue
    let value = 0
    if (roll.skill === "perception" || isTacticsKnowledge(roll.knowledgeName)) value = bonus.perception
    else if (roll.skill === "sneaking") value = bonus.sneaking ?? 0
    else if (roll.skill === "tracking") value = bonus.tracking ?? 0
    else if (bonus.combat && TACNET_COMBAT_SKILLS.includes(roll.skill) && roll.skill === roll.combatChoice) value = bonus.combat
    if (value > 0 && (!best || value > best.value)) best = {
      value, name: net.name, level: tacnetLevel(net.level)
    }
  }
  return best
}

export function tacnetOffer(bonus, label){
  if (!bonus) return null
  return {
    key: "indirect_tacnet", kind: "dicePool", label, when: "", value: bonus.value, isMalus: false,
    checked: true, hidden: false, indirect: true
  }
}
