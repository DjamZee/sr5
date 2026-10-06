/**
 * The attack card behind a defense or a resistance, read again by the browser that rolls it (Honoré's finding, 06/10).
 *
 * A player writes the flags of her own cards, and could write any damage value on them: what the GM's actor takes
 * never comes from them. The card is read again from the chat log: its author must be a GM or own the attacker, and
 * the weapon, spell or preparation must be on the attacker's sheet. The damage is worked out again from that item
 * (SR5 p. 171-173), the hits counted again on the dice within the pool worked out on the sheet, plus Chance (SR5 p. 56),
 * never more than the card announces. What differs from the card is told to the GM, and the value worked out wins.
 * A card a GM wrote stands as written.
 *
 * Pure rules first; vetAttackCard does the lookups.
 */
import {
  recountHits
} from "./socket-guard.js"
import {
  combatSpellMasteryBonus
} from "../../entities/items/magic-masteries.js"
import {
  SR5
} from "../../config.js"
import {
  SR5_ConverterHelpers
} from "./converter.js"
import {
  sameActor, diceShown
} from "./matrix-card.js"

const DAMAGE_TYPES = ["physical", "stun"]
const ENGULF_EFFECTS = ["engulfWater", "engulfFire", "engulfAir", "engulfEarth"]

/** The damage reduction of a shotgun's spread (SR5 p. 180), as roll-prepare-helpers.js chokeSettingsOnDamage. */
export function chokeDamageReduction(selected, range) {
  const table = {
    medium: {
      short: 1, medium: 3, long: 5, extreme: 7
    },
    wide: {
      short: 3, medium: 5, long: 7, extreme: 9
    },
  }
  return table[selected]?.[range] ?? 0
}

/** The bullets a firing mode fires (SR5 p. 179, as the roll dialog counts them), at most 3 for the Bull's Eye (Run & Gun p. 130). */
function bullsEyeBullets(firingMode) {
  return Math.min(Number(SR5_ConverterHelpers.firingModeToBullet(firingMode)) || 1, 3)
}

/**
 * The damage of a weapon attack, from the weapon and its wielder's sheet: what rollData-Weapon.js, the roll dialog
 * (called shots, choke) and test-Attack.js put on the card. `choices` are the attacker's choices in the dialog, read on
 * the card: they only pick among what the rules allow.
 */
export function weaponAttackDamage(weapon, actor, choices = {
}) {
  const w = weapon ?? {
  }
  const a = actor ?? {
  }
  const calledShot = choices.calledShot ?? ""
  const magic = Number(a.specialAttributes?.magic?.augmented?.value) || 0
  const result = {
    base: Number(w.damageValue?.value) || 0,
    ap: Number(w.armorPenetration?.value) || 0,
    type: w.damageType || (DAMAGE_TYPES.includes(choices.chosenType) ? choices.chosenType : "physical"),
    element: a.specialProperties?.anticoagulant === true ? "anticoagulant" : (w.damageElement ?? ""),
    source: w.isMagical ? "magical" : "",
    aggravated: !!a.specialProperties?.aggravatedWounds,
    isContinuous: false,
    originalValue: 0,
    toxin: null,
    damageFallOff: Number(w.blast?.damageFallOff) || 0,
  }
  if (w.damageElement === "toxin" && w.toxin) result.toxin = structuredClone(w.toxin)
  //Anti-vehicle rounds against a drone (rollData-Weapon.js)
  if (choices.targetIsDrone) {
    if (choices.ammoEffects?.antiVehicleAP) result.ap += Number(choices.ammoEffects.antiVehicleAP) || 0
    else if (w.ammunition?.type === "av") result.ap -= 4
  }
  //Engulf: continuous damage from the weapon's own value (rollData-Weapon.js)
  if (Object.values(w.systemEffects ?? {
  }).some(e => ENGULF_EFFECTS.includes(e?.value))) {
    result.isContinuous = true
    result.originalValue = result.base
  }
  //Energy aura (SR5 p. 397): Magic added to the DV, AP -Magic, the aura's element
  if (a.specialProperties?.energyAura) {
    result.base += magic
    result.ap = -magic
    result.element = a.specialProperties.energyAura
    if (a.specialProperties.energyAura !== "electricity") result.type = "physical"
  }
  switch (calledShot) {
    case "bullsEye":
      result.ap += (Number(w.armorPenetration?.base) || 0) * bullsEyeBullets(choices.firingMode)
      break
    case "hitEmWhereItCounts":
      if (result.toxin && Number(result.toxin.power) > 0) {
        result.toxin.power = Number(result.toxin.power) + 2
        if (result.base > 0) result.base += 2
      }
      if (result.toxin && Number(result.toxin.speed) > 0) result.toxin.speed = Number(result.toxin.speed) - 1
      break
    case "harderKnock":
      result.type = "physical"
      break
    case "vitals":
      result.base += 2
      break
  }
  result.base -= chokeDamageReduction(choices.choke, choices.range)
  //Through and Into: the second target takes the DV less 1 (test-Defense.js)
  if (choices.secondTarget) result.base -= 1
  return result
}

/**
 * The Force a spell card's Drain stands for (SR5 p. 281-284): Drain = Force + modifiers, never under its floor, so
 * Force can be no more than Drain − modifiers. The spell's own modifier is read on the item, the others (reckless
 * casting, reagents, masteries…) on the card. Not a proof, a player writes both: an edited Force left with its Drain
 * shows. Returns the Force kept (the lower of the two) and the Drain that Force calls for.
 */
export function spellDrainCheck({
  force, drainValue, modifiers = {
  }, itemDrain = 0, floor = 2
}) {
  const others = Object.entries(modifiers ?? {
  }).filter(([key]) => key !== "spell").reduce((sum, [, m]) => sum + (Number(m?.value) || 0), 0)
  const sum = others + (Number(itemDrain) || 0)
  let kept = Math.max(0, Math.floor(Number(force)) || 0)
  const drain = Number(drainValue)
  if (Number.isFinite(drain)) kept = Math.max(0, Math.min(kept, drain - sum))
  return {
    force: kept, expected: Math.max(Number(floor) || 0, kept + sum)
  }
}

/** The highest Force a spell is cast at: twice the caster's Magic (SR5 p. 281). */
export function spellForceCap(magic) {
  return Math.max(0, 2 * (Number(magic) || 0))
}

/**
 * The damage of a combat spell or preparation (test-Spell.js): an indirect one hits at Force + bonus, AP -Force
 * (SR5 p. 284); a direct one at its hits + bonus (SR5 p. 283).
 */
export function spellAttackDamage({
  indirect, force, hits, bonus = 0
}) {
  const f = Math.max(0, Math.floor(Number(force)) || 0)
  const b = Math.max(0, Number(bonus) || 0)
  if (indirect) return {
    base: f + b, value: f + b, ap: -f
  }
  const value = Math.max(0, Math.floor(Number(hits)) || 0) + b
  return {
    base: value, value, ap: 0
  }
}

/**
 * The hits the defense or the resistance stands by: the card's own when a GM wrote it; otherwise counted again on its
 * dice within `pool` (the pool on the sheet plus Chance), never more than the card announces. 0 when it shows no dice.
 */
export function vettedHits({
  byGM, claimed, rollJSON, pool
}) {
  const announced = Math.max(0, Math.floor(Number(claimed)) || 0)
  if (byGM) return announced
  const counted = recountHits(rollJSON, pool)
  return counted === null ? 0 : Math.min(announced, counted)
}

/**
 * The ramming of a card, its speeds bounded by the vehicles' sheets (Rigger 5 p. 179, SR5 p. 204): the angle and the
 * gait are the driver's choice, a speed never goes beyond the vehicle's own.
 */
export function vettedRamming(card = {
}, {
  attackerSpeed, attackerLocomotion, targetIsVehicle, targetSpeed, targetLocomotion, metersPerTurn
}) {
  const angles = ["rear", "side", "front"]
  const ramming = {
    angle: angles.includes(card.angle) ? card.angle : "side",
    gait: card.gait === "run" ? "run" : "walk",
    attackerSpeed: Math.min(Math.max(0, Number(card.attackerSpeed) || 0), Math.max(0, Number(attackerSpeed) || 0)),
    attackerLocomotion,
    targetIsVehicle: !!targetIsVehicle,
    targetSpeed: targetIsVehicle ? Math.min(Math.max(0, Number(card.targetSpeed) || 0), Math.max(0, Number(targetSpeed) || 0)) : 0,
    targetLocomotion: targetIsVehicle ? targetLocomotion : "ground",
  }
  const fastest = metersPerTurn(ramming.attackerSpeed, ramming.gait)
  ramming.relativeSpeed = card.relativeSpeed == null ? fastest : Math.min(Math.max(0, Number(card.relativeSpeed) || 0), fastest)
  return ramming
}

/** What an attack card is, for the GM: the family that tells where its damage comes from, or null. */
export function attackFamily(data) {
  const test = data?.test ?? {
  }
  if (test.type === "attack") return "weapon"
  if (test.type === "spell" || test.type === "preparation") return test.type
  if (test.type === "ramming") return "ramming"
  if (test.typeSub === "astralCombat") return "astral"
  return null
}

/**
 * The attack a second target of Through and Into defends against (Run & Gun p. 131): the attack card itself, read from
 * the chat log, never the copy a defense card carries (Apollinaire's review, D2). The defense card must stand (a GM's,
 * or one an owner of the first target wrote) and answer an attack with this called shot. The second target takes the DV
 * less 1 only when the first one was hit (D3): a dodged shot goes on whole. null when refused.
 */
export function throughAndIntoData(defenseMessageId, _defenseData, {
  cardOf, messageOf
}) {
  const defense = cardOf(defenseMessageId)
  if (!defense || defense.data.test?.type !== "defense") return null
  const attackMessage = messageOf(defense.data.previousMessage?.messageId)
  const attack = attackMessage?.flags?.sr5data
  if (!attack || !attackFamily(attack) || attack.combat?.calledShot?.name !== "throughAndInto") return null
  const data = foundry.utils.deepClone(attack)
  data.owner.messageId = attackMessage.id
  data.combat.calledShot.name = ""
  data.combat.calledShot.secondTarget = (Number(defense.data.roll?.netHits) || 0) > 0
  return data
}

/** The differences between what the card announced and what was worked out again, for the GM. */
export function attackCardMismatches(claimed, vetted) {
  const keys = ["base", "value", "ap", "type", "element", "source", "hits", "force", "damageFallOff", "toxinPower"]
  return keys.filter(key => key in vetted && vetted[key] !== undefined && String(claimed[key] ?? "") !== String(vetted[key] ?? ""))
    .map(key => ({
      key, claimed: claimed[key], value: vetted[key]
    }))
}

//-----------------------------------//
//        Lookups (Foundry)          //
//-----------------------------------//

/** The ammunition effects of a weapon, as rollData-Weapon.js reads them. */
export function weaponAmmoEffects(actor, itemData) {
  const type = itemData?.ammunition?.type
  if (!type) return null
  const ammoItem = actor?.items?.find?.(i => i.type === "itemAmmunition" && i.system.type === type && (i.system.class === itemData.type || !i.system.class))
  if (ammoItem?.system.ammunitionTypeUuid && ammoItem.system.ammunitionTypeUuid !== "pending") return ammoItem.system.effects
  if (!SR5.allAmmunitionTypes?.[type] && globalThis.game?.items) {
    const ammoTypeItem = game.items.find(i => i.type === "itemAmmunitionType" && i.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") === type)
    if (ammoTypeItem) return ammoTypeItem.system
  }
  return null
}

function poolWithEdge(roller, pool) {
  return (Number(pool) || 0) + (Number(roller?.system?.specialAttributes?.edge?.augmented?.value) || 0)
}

function itemOn(roller, data) {
  const id = data?.owner?.itemId ?? String(data?.owner?.itemUuid ?? "").split(".").pop()
  return id ? roller?.items?.get?.(id) ?? null : null
}

/**
 * The attack card behind a defense or a resistance, as the browser that rolls it may trust it.
 * @param {object} chatData the card's data, as the button hands it (a copy for a second target)
 * @param {object} options
 * @param {string} options.messageId the attack card in the chat log
 * @param {Actor} options.defender the actor who defends or resists
 * @param {object} options.helpers the lookups: cardOf (miscellaneous.js), ramming (roller, defender, card's ramming) =>
 *   {ramming, base}
 * @returns {Promise<{data: object, mismatches: Array, card: object, item: Item}|null>} null when refused
 */
export async function vetAttackCard(chatData, {
  messageId, defender, helpers
}) {
  const card = helpers.cardOf(messageId)
  if (!card) return null
  if (card.byGM) {
    //A GM's card stands as written; the second target of Through and Into still takes 1 less (Run & Gun p. 131)
    if (!chatData.combat?.calledShot?.secondTarget) return {
      data: chatData, mismatches: [], card
    }
    const second = foundry.utils.deepClone(chatData)
    second.damage.base = (Number(second.damage.base) || 0) - 1
    second.damage.value = (Number(second.damage.value) || 0) - 1
    return {
      data: second, mismatches: [], card
    }
  }
  const family = attackFamily(card.data)
  if (!family) return null
  const roller = card.roller, system = roller.system ?? {
  }
  const data = foundry.utils.deepClone(chatData)
  const item = itemOn(roller, card.data)
  const claimed = {
    base: chatData.damage?.base, value: chatData.damage?.value, ap: chatData.combat?.armorPenetration,
    type: chatData.damage?.type, element: chatData.damage?.element ?? "", source: chatData.damage?.source ?? "",
    hits: chatData.roll?.hits,
  }
  //The second target of Through and Into reads the attack card itself: its DV less 1 is the expected one, no gap
  if (chatData.combat?.calledShot?.secondTarget) {
    claimed.base = (Number(claimed.base) || 0) - 1
    claimed.value = (Number(claimed.value) || 0) - 1
  }
  let pool, drainInfo = null, overcast = null, vetted = {
  }
  const extra = []

  if (family === "weapon" || (family === "astral" && item)) {
    if (!item || item.type !== "itemWeapon") return null
    const damage = family === "astral" ? {
      base: Number(item.system.damageValue?.value) || 0, ap: 0, type: DAMAGE_TYPES.includes(chatData.damage?.type) ? chatData.damage.type : "physical",
      element: "", source: "", aggravated: false, isContinuous: false, originalValue: 0, toxin: null, damageFallOff: 0,
    } : weaponAttackDamage(item.system, system, {
      calledShot: chatData.combat?.calledShot?.name, chosenType: chatData.damage?.type,
      choke: chatData.combat?.choke?.selected, range: chatData.target?.range, firingMode: chatData.combat?.firingMode?.selected,
      targetIsDrone: defender?.type === "actorDrone", ammoEffects: weaponAmmoEffects(roller, item.system),
      secondTarget: !!chatData.combat?.calledShot?.secondTarget,
    })
    pool = item.system.weaponSkill?.dicePool
    vetted = {
      base: damage.base, value: damage.base, ap: damage.ap, type: damage.type, element: damage.element ?? "", source: damage.source,
    }
    data.damage.aggravated = damage.aggravated
    data.damage.isContinuous = damage.isContinuous
    data.damage.originalValue = damage.originalValue
    if (damage.toxin) {
      claimed.toxinPower = chatData.damage?.toxin?.power
      vetted.toxinPower = damage.toxin.power
      data.damage.toxin = damage.toxin
    }
    if (chatData.combat?.grenade?.isGrenade) {
      claimed.damageFallOff = chatData.combat.grenade.damageFallOff
      vetted.damageFallOff = damage.damageFallOff
      data.combat.grenade.damageFallOff = damage.damageFallOff
    }
    //What a called shot does (effects, DV limit, initiative) is read on the shot chosen, as the roll dialog sets it
    const calledShot = family === "weapon" ? chatData.combat?.calledShot?.name : ""
    if (calledShot) {
      const cs = helpers.calledShot ?? (await import("./calledShot.js")).SR5_CalledShotHelpers
      const ammoType = item.system.ammunition?.type, ammoEffects = weaponAmmoEffects(roller, item.system)
      const effects = cs.convertCalledShotToEffect(calledShot, ammoType, ammoEffects) ?? {
      }
      const limitDV = cs.convertCalledShotToLimitDV(calledShot, ammoType, ammoEffects) ?? 0
      const initiative = calledShot === "shakeUp" ? cs.convertCalledShotToInitiativeMod(ammoType, ammoEffects) : null
      const was = chatData.combat.calledShot
      const same = JSON.stringify(Object.values(was.effects ?? {
      })) === JSON.stringify(Object.values(effects)) && (Number(was.limitDV) || 0) === (Number(limitDV) || 0) &&
        (calledShot !== "shakeUp" || Number(was.initiative) === Number(initiative))
      if (!same) extra.push({
        key: "calledShot", claimed: calledShot, value: calledShot
      })
      data.combat.calledShot.effects = effects
      data.combat.calledShot.limitDV = limitDV
      if (calledShot === "shakeUp") data.combat.calledShot.initiative = initiative
    }
  } else if (family === "astral") {
    pool = system.skills?.astralCombat?.test?.dicePool
    vetted = {
      base: Number(system.magic?.astralDamage?.value) || 0, ap: 0,
      type: DAMAGE_TYPES.includes(chatData.damage?.type) ? chatData.damage.type : "physical",
    }
    vetted.value = vetted.base
  } else if (family === "spell" || family === "preparation") {
    if (!item || item.type !== (family === "spell" ? "itemSpell" : "itemPreparation")) return null
    const magic = system.specialAttributes?.magic?.augmented?.value
    let force = family === "preparation" ? Number(item.system.force) || 0 :
      Math.min(Math.max(0, Math.floor(Number(chatData.magic?.force)) || 0), spellForceCap(magic))
    //The Drain the caster resists follows the Force (SR5 p. 281-284): a Force the card's Drain cannot stand for is
    //lowered to what it can (decided by DjamZ through Élise, 06/10), and the GM is shown both
    if (family === "spell") {
      const drain = spellDrainCheck({
        force, drainValue: chatData.magic?.drain?.value, modifiers: chatData.magic?.drain?.modifiers,
        itemDrain: item.system.drain?.value, floor: chatData.magic?.drainFloor ?? 2,
      })
      force = drain.force
      drainInfo = {
        announced: chatData.magic?.force, expected: drain.expected, drainValue: chatData.magic?.drain?.value
      }
      //Above the Magic, the Drain turns Physical (SR5 p. 281): where a forged Force pays most, said to the GM
      if (force > (Number(magic) || 0)) overcast = {
        force, magic: Number(magic) || 0
      }
    }
    const masteries = system.magic?.masteries
    const bonus = family === "spell" ? combatSpellMasteryBonus(item.system.category, masteries?.mageHunter?.value, masteries?.deathSower?.value).damage : 0
    pool = family === "preparation" ? item.system.test?.dicePool : system.skills?.spellcasting?.spellCategory?.[item.system.category]?.dicePool
    const indirect = item.system.subCategory === "indirect"
    const damage = spellAttackDamage({
      indirect, force, hits: 0, bonus
    })
    claimed.force = chatData.magic?.force
    //A direct spell carries its DV in its value alone (test-Spell.js)
    if (!indirect) claimed.base = claimed.value
    vetted = {
      base: damage.base, value: damage.value, ap: damage.ap,
      type: item.system.damageType, element: item.system.damageElement ?? "", source: "magical", force,
    }
    data.magic.force = force
    data.magic.spell.damageBonus = bonus
    data.magic.spell.category = item.system.category
    data.test.typeSub = item.system.subCategory
    data.damage.elementSecond = item.system.damageElementSecond
  } else if (family === "ramming") {
    if (roller.type !== "actorDrone") return null
    const ramming = await helpers.ramming(roller, defender, chatData.combat?.ramming)
    pool = system.rammingTest?.test?.dicePool
    vetted = {
      base: ramming.base, value: ramming.base, ap: -6, type: "physical",
    }
    data.combat.ramming = ramming.ramming
  }

  vetted.hits = vettedHits({
    byGM: false, claimed: chatData.roll?.hits, rollJSON: card.data.roll?.r, pool: poolWithEdge(roller, pool),
  })
  //A direct spell's DV is its hits (SR5 p. 283): worked out with the hits counted again
  if ((family === "spell" || family === "preparation") && data.test.typeSub !== "indirect") {
    vetted.base = vetted.value = spellAttackDamage({
      indirect: false, hits: vetted.hits, bonus: data.magic.spell.damageBonus
    }).value
  }
  data.damage.base = vetted.base
  data.damage.value = vetted.value
  data.combat.armorPenetration = vetted.ap
  if (vetted.type) data.damage.type = vetted.type
  if ("element" in vetted) data.damage.element = vetted.element
  if ("source" in vetted) data.damage.source = vetted.source
  data.roll.hits = vetted.hits
  //More dice on the card than the pool worked out on the sheet allows: the ones beyond are not counted, and said
  //(situational bonuses of the roll dialog are not on the sheet)
  const cap = poolWithEdge(roller, pool), shown = diceShown(card.data.roll?.r)
  const overPool = shown > cap ? {
    dice: shown, cap
  } : null
  return {
    data, mismatches: [...attackCardMismatches(claimed, vetted), ...extra], card, item,
    direct: (family === "spell" || family === "preparation") && data.test.typeSub !== "indirect", drainInfo, overcast, overPool,
  }
}

//The ramming of a card bounded by the two vehicles' sheets, and its base DV (rollData-Ramming.js)
async function rammingOf(roller, defender, cardRamming) {
  const {
    SR5_ConverterHelpers
  } = await import("./converter.js")
  const {
    vehicleSpeed, locomotionData
  } = await import("../roll-prepare-case/rollData-Ramming.js")
  const targetIsVehicle = defender?.type === "actorDrone"
  const ramming = vettedRamming(cardRamming, {
    attackerSpeed: vehicleSpeed(roller),
    attackerLocomotion: SR5_ConverterHelpers.rammingLocomotion(locomotionData(roller)),
    targetIsVehicle,
    targetSpeed: targetIsVehicle ? vehicleSpeed(defender) : 0,
    targetLocomotion: targetIsVehicle ? SR5_ConverterHelpers.rammingLocomotion(locomotionData(defender)) : "ground",
    metersPerTurn: (speed, gait) => SR5_ConverterHelpers.vehicleMetersPerTurn(speed, gait),
  })
  return {
    ramming, base: SR5_ConverterHelpers.rammingAttackDamage(ramming, Number(roller.system?.attributes?.body?.augmented?.value) || 0)
  }
}

const MISMATCH_KEYS = {
  base: "SR5.AttackCardDV", value: "SR5.AttackCardDV", ap: "SR5.AttackCardAP", type: "SR5.AttackCardType",
  element: "SR5.AttackCardElement", source: "SR5.AttackCardSource", hits: "SR5.AttackCardHits", force: "SR5.AttackCardForce",
  damageFallOff: "SR5.AttackCardFallOff", toxinPower: "SR5.AttackCardToxinPower", calledShot: "SR5.AttackCardCalledShot",
}

function shown(key, value) {
  if (key === "source") return game.i18n.localize(value === "magical" ? "SR5.AttackCardMagical" : "SR5.AttackCardMundane")
  if (value === undefined || value === null || value === "") return "—"
  if (key === "type") return game.i18n.localize(SR5.damageTypes?.[value] ?? String(value))
  if (key === "element") return game.i18n.localize(SR5.specialDamageTypes?.[value] ?? String(value))
  if (key === "calledShot") return game.i18n.localize(SR5.calledShots?.[value] ?? String(value))
  return String(value)
}

//« Puissance annoncée / Drain attendu / Drain résisté », the Drain read on the caster's resistance card to this spell
function spellDrainLine(info, messageId) {
  const drainCard = game.messages?.find?.(m => m.flags?.sr5data?.test?.type === "drain" && m.flags.sr5data.previousMessage?.messageId === messageId)
  const resisted = drainCard ? game.i18n.format("SR5.AttackCardDrainResisted", {
    value: drainCard.flags.sr5data.magic?.drain?.value ?? "?", hits: drainCard.flags.sr5data.roll?.hits ?? 0
  }) : game.i18n.localize("SR5.AttackCardDrainNotYet")
  return game.i18n.format("SR5.AttackCardDrainInfo", {
    force: info.announced ?? "?", expected: info.expected, drain: info.drainValue ?? "?", resisted
  })
}

/**
 * The attack card behind a defense or a resistance, read again (vetAttackCard): its data as the roll may use it, or
 * null when it is refused. What it announced beyond what the attacker's sheet allows is told to the GM.
 */
export async function trustedAttackCard(chatData, defender, messageId = chatData?.owner?.messageId) {
  const {
    SR5_MiscellaneousHelpers
  } = await import("./miscellaneous.js")
  const {
    SR5_ActorHelper
  } = await import("../../entities/actors/entityActor-helpers.js")
  const message = messageId ? game.messages?.get(messageId) : null
  const user = message?.author?.name ?? "?"
  const result = await vetAttackCard(chatData, {
    messageId, defender, helpers: {
      cardOf: id => SR5_MiscellaneousHelpers.cardOf(id), ramming: rammingOf,
    }
  })
  if (!result) {
    const text = game.i18n.format("SR5.AttackCardRefused", {
      user
    })
    ui.notifications.warn(text)
    await SR5_ActorHelper.whisperGM(text)
    return null
  }
  //The DV is said once: the value follows the base on a weapon
  const lines = result.mismatches.filter(m => !(m.key === "value" && result.mismatches.some(o => o.key === "base")))
  //A player's spell: the Force announced, the Drain it calls for and the Drain its caster resisted, if already rolled
  const drainLine = result.drainInfo ? spellDrainLine(result.drainInfo, messageId) : null
  //Beyond Magic (Physical Drain), and dice beyond the pool worked out: always said, never cut silently
  const overcastLine = result.overcast ? game.i18n.format("SR5.AttackCardOvercast", result.overcast) : null
  const overPoolLine = result.overPool ? game.i18n.format("SR5.AttackCardOverPool", result.overPool) : null
  const alert = lines.length || overcastLine || overPoolLine
  if (drainLine && !alert && game.user?.isGM) ui.notifications.info(drainLine)
  if (alert) {
    const text = [game.i18n.format("SR5.AttackCardReread", {
      user, actor: result.card.roller?.name ?? "?", item: result.item?.name ?? "—"
    }), ...lines.map(m => game.i18n.format(result.direct && (m.key === "base" || m.key === "value") ? "SR5.AttackCardDVDirect" : MISMATCH_KEYS[m.key], {
      value: shown(m.key, m.value), claimed: shown(m.key, m.claimed)
    })), overPoolLine, overcastLine, drainLine].filter(Boolean).join(" ")
    if (game.user?.isGM) ui.notifications.warn(text, {
      permanent: true
    })
    await SR5_ActorHelper.whisperGM(text)
  }
  return result.data
}

/**
 * Whether a resistance may stand on a card that is no attack, whatever its type (a list of the types allowed, never of
 * the ones refused: Apollinaire's review, D1). A card a GM wrote stands; a player's only for the actor it was rolled for
 * (or the rigger of that drone). An energy aura burns the attacker of the melee attack the defense card answers.
 * Data the system builds itself has no card behind it; a cross resistance it works out (the biofeedback a defender
 * deals back, a rigged drone's) is vouched for by the code that bounds it, never by anything a card can carry.
 */
const VOUCHED = new WeakSet()

/** Vouch for roll data the system worked out itself for another actor than the card's (see trustedResistanceCard). */
export function vouch(data) {
  if (data && typeof data === "object") VOUCHED.add(data)
  return data
}

export async function trustedResistanceCard(chatData, actor, rollType = "", helpers = null) {
  if (VOUCHED.has(chatData)) return true
  const messageId = chatData?.owner?.messageId
  //No card behind it: built by the system (acid, fire, a drug's crash, a sprint, a crush, dumpshock); a chat button
  //always names its card (roll-message.js)
  if (!messageId) return true
  const cardOf = helpers?.cardOf ?? (await import("./miscellaneous.js")).SR5_MiscellaneousHelpers.cardOf
  const card = cardOf(messageId)
  if (!card) return false
  if (card.byGM) return true
  if (rollType === "resistanceCardAura") {
    if (card.data.test?.type !== "defense") return false
    const attack = cardOf(card.data.previousMessage?.messageId)
    return !!attack && sameActor(attack.roller, actor)
  }
  return sameActor(card.roller, actor)
}
