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
  sameActor, standsFor, diceShown, trustedHits, sheetValue
} from "./matrix-card.js"
import {
  energyAuraApplies, jugularToxin, laserDamageReduction, LASER_TRAIT
} from "./weapon-attack-rules.js"
import {
  hasWeaponTrait
} from "../../entities/items/weaponTraits.js"
import {
  redDotAttackBonus
} from "../../entities/items/weapon-accessory-rules.js"

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
  //Energy aura (SR5 p. 397): Magic added to the DV of a melee attack, AP -Magic, the aura's element
  if (a.specialProperties?.energyAura && energyAuraApplies(w.category)) {
    result.base += magic
    result.ap = -magic
    result.element = a.specialProperties.energyAura
    if (a.specialProperties.energyAura !== "electricity") result.type = "physical"
  }
  switch (calledShot) {
    case "bullsEye":
      result.ap += (Number(w.armorPenetration?.base) || 0) * bullsEyeBullets(choices.firingMode)
      break
    //Run & Gun p. 131: the toxin's Power +2 and speed -1, the DV does not change
    case "hitEmWhereItCounts":
      if (result.toxin) result.toxin = jugularToxin(result.toxin)
      break
    case "harderKnock":
      result.type = "physical"
      break
    case "vitals":
      result.base += 2
      break
  }
  result.base -= chokeDamageReduction(choices.choke, choices.range)
  //A laser loses DV with range and visibility (Run & Gun p. 64), as test-Attack.js takes it off
  const laser = hasWeaponTrait(w, LASER_TRAIT) ? laserDamageReduction(choices.range, choices.visibility) : 0
  if (laser) result.base = Math.max(0, result.base - laser)
  //Through and Into: the second target takes the DV less 1 (test-Defense.js)
  if (choices.secondTarget) result.base -= 1
  return result
}

/**
 * The Force a spell card's Drain stands for (SR5 p. 281-284): Drain = Force + modifiers, never under its floor, so
 * Force can be no more than Drain − modifiers. The spell's own modifier is read on the item, the others (reckless
 * casting, reagents, masteries…) on the card. Not a proof, a player writes both: an edited Force left with its Drain
 * shows. Returns the Force kept (the lower of the two) and the Drain that Force calls for.
 * A modifier that lowers the Drain would let a higher Force through: only those the sheet stands for count, Structured
 * Spellcasting (-1, Forbidden Arcana p. 43) if the caster has it, and a reagent tier no lower than -`reagentCap`
 * (what the world's reagent rules give that tier for a spell, Forbidden Arcana p. 181) nor than -`magic`; any other
 * lowering one counts for nothing. `floor` comes from the sheet, not the card. The reagent stock on the sheet proves
 * nothing here: it is spent when the spell is cast, before the GM reads the card (a known limit).
 */
export function spellDrainCheck({
  force, drainValue, modifiers = {
  }, itemDrain = 0, floor = 2, structured = false, magic = 0, reagentCap = 0
}) {
  const others = Object.entries(modifiers ?? {
  }).filter(([key]) => key !== "spell").reduce((sum, [key, m]) => {
    const value = Number(m?.value) || 0
    if (value >= 0) return sum + value
    if (key === "structuredSpellcasting") return sum + (structured ? -1 : 0)
    //A reagent tier lowers a spell's Drain only under Forbidden Arcana, by what its tier gives (p. 181: refined 2,
    //radical 4), never more than the Magic (Hyacinthe's limit)
    if (key === "reagentTier") return sum + Math.max(value, -Math.min(Math.max(0, Number(reagentCap) || 0), Math.max(0, Number(magic) || 0)))
    return sum
  }, 0)
  const sum = others + (Number(itemDrain) || 0)
  let kept = Math.max(0, Math.floor(Number(force)) || 0)
  //A card without a Drain proves nothing: read as the least Drain a spell can call for (Hyacinthe's review, L3-1)
  const read = drainValue === null || drainValue === undefined || drainValue === "" ? NaN : Number(drainValue)
  const drain = Number.isFinite(read) ? read : Math.max(0, Number(floor) || 0)
  kept = Math.max(0, Math.min(kept, drain - sum))
  return {
    force: kept, expected: Math.max(Number(floor) || 0, kept + sum)
  }
}

/** The most a reagent tier may lower a spell's Drain under the world's reagent rules: Forbidden Arcana only (p. 181). */
async function spellReagentCap(tier, helpers = null) {
  const reagents = helpers?.reagents ?? await import("../../system/reagents.js")
  if (reagents.reagentSystem() !== "forbiddenArcana") return 0
  return reagents.tierDrainReduction(reagents.normalizeTier(tier, "forbiddenArcana"), "spell")
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

/**
 * The dice the sheet's pool may have lost to wounds since the roll (SR5 p. 171): the wound modifier, read now on the
 * roller, when the card is read again. Drain taken after a spell, a wound between the attack and the defense lower the
 * pool the sheet shows now, not the one rolled, and the honest hits were counted lower and the player accused (Élise,
 * from Lucrèce's review): given back to the ceiling, never more.
 */
export function woundAllowance(roller) {
  return Math.max(0, -(Number(roller?.system?.penalties?.condition?.actual?.value) || 0))
}

function poolWithEdge(roller, pool) {
  return (Number(pool) || 0) + (Number(roller?.system?.specialAttributes?.edge?.augmented?.value) || 0)
}

/**
 * The Visibility row a laser's DV loses to (Run & Gun p. 64): the air's on the card (scene and smoke, before any vision,
 * rollData-Weapon.js airVisibility), never clearer than the scene the attack was rolled on. A lower row raises the DV,
 * so the card may claim a thicker air than the scene's, not a clearer one; a smoke template is read on the card only.
 */
export function laserVisibility(chatData, scenes = globalThis.game?.scenes) {
  const claimed = Number(chatData.combat?.laser?.visibility) || 0
  const scene = chatData.target?.sceneId ? scenes?.get?.(chatData.target.sceneId) : null
  const sceneRow = Number(scene?.getFlag?.("sr5", "environModVisibility")) || 0
  return Math.max(claimed, sceneRow)
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
  let pool, limit = 0, drainInfo = null, overcast = null, vetted = {
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
      visibility: laserVisibility(chatData),
      targetIsDrone: defender?.type === "actorDrone", ammoEffects: weaponAmmoEffects(roller, item.system),
      secondTarget: !!chatData.combat?.calledShot?.secondTarget,
    })
    pool = item.system.weaponSkill?.dicePool
    //The limit of a weapon is its Accuracy, a grenade's the thrower's Physical limit (SR5 p. 182, rollData-Weapon.js)
    limit = item.system.category === "grenade" ? sheetValue(roller, "limits.physicalLimit.value") : Number(item.system.accuracy?.value) || 0
    //Red dot sight (Street Lethal p. 49): its die and Accuracy follow the range, as the roll dialog adds them
    if (family === "weapon" && item.system.category === "rangedWeapon") {
      const hasSmartlink = roller.type !== "actorDrone" && !!system.specialProperties?.smartlink?.value
      const sight = redDotAttackBonus(item.system, hasSmartlink, chatData.target?.range)
      pool = (Number(pool) || 0) + sight.dice
      limit += sight.accuracy
    }
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
        itemDrain: item.system.drain?.value, magic,
        //SR5 p. 284: never under 2; Structured Spellcasting (Forbidden Arcana p. 43): never under 1, read on the sheet
        structured: !!system.magic?.metamagics?.structuredSpellcasting,
        floor: system.magic?.metamagics?.structuredSpellcasting ? 1 : 2,
        //What the reagent tier the card names gives a spell under the world's rules (Forbidden Arcana p. 181), 0 otherwise
        reagentCap: await spellReagentCap(chatData.magic?.reagentTier, helpers),
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
    //The limit of a spell or a preparation is its Force (SR5 p. 281)
    limit = force
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
    limit = sheetValue(roller, "rammingTest.limit.value")
    vetted = {
      base: ramming.base, value: ramming.base, ap: -6, type: "physical",
    }
    data.combat.ramming = ramming.ramming
  }

  //The pool as rolled: what wounds took since is given back (woundAllowance)
  pool = (Number(pool) || 0) + woundAllowance(roller)
  //Without a granted push of the limit, no Rule of Six and the test's limit (Hyacinthe's review, D1; SR5 p. 58)
  const counted = await trustedHits({
    card, claimed: chatData.roll?.hits, pool, limit, label: item?.name ?? "", helpers,
  })
  vetted.hits = counted?.hits ?? 0
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

/** The cards a defense writes in the attacker's name: an energy aura that burns him, the crash of his ramming. */
export const CROSS_CARDS = ["energeticAura", "accident"]

/**
 * The card a defense wrote in the attacker's name (test-Defense.js: energy aura, SR5 p. 397; ramming crash, Rigger 5
 * p. 179, SR5 p. 204), rebuilt by the GM from what justifies it, never read on it (Apollinaire's second review): the
 * attack card itself, the attacker's and his to resist; the defense card that answered it, written by a GM or an owner
 * of the defender, with net hits; the aura read on the defender's sheet, the crash worked out again on both vehicles.
 * The rebuilt data, vouched for; null when nothing stands behind the card.
 */
export async function rebuildCrossCard(chatData, actor, helpers = null) {
  const kind = chatData?.test?.typeSub
  if (chatData?.test?.type !== "falseTest" || !CROSS_CARDS.includes(kind)) return null
  const cardOf = helpers?.cardOf ?? (await import("./miscellaneous.js")).SR5_MiscellaneousHelpers.cardOf
  const messages = helpers?.messages ?? globalThis.game?.messages?.contents ?? []
  const attackId = chatData.previousMessage?.messageId, defenderId = chatData.previousMessage?.actorId
  const attack = cardOf(attackId)
  if (!attack || !standsFor(attack, actor) || !sameActor(attack.roller, actor)) return null
  const defenseMessage = messages.find(m => {
    const d = m.flags?.sr5data
    return ["defense", "rammingDefense"].includes(d?.test?.type) && d.previousMessage?.messageId === attackId && d.owner?.actorId === defenderId
  })
  const defense = defenseMessage ? cardOf(defenseMessage.id) : null
  if (!defense) return null
  //Net hits the defense cannot have more of than the attack had hits
  const netHits = Math.min(Number(defense.data.roll?.netHits) || 0, Math.max(0, Number(attack.data.roll?.hits) || 0))
  if (netHits <= 0) return null
  const defender = defense.roller
  //A blank roll for the attacker, as test-Defense.js builds these cards: nothing else the player wrote on hers (an
  //element, a toxin, a called shot, a limit…) is kept, only what links and names it (Élise's review)
  const base = helpers?.baseRollData ?? (await import("../roll-prepare.js")).SR5_PrepareRollTest.getBaseRollData
  const data = foundry.utils.deepClone(base(null, actor))
  data.test.type = "falseTest"
  data.test.typeSub = kind
  data.test.title = typeof chatData.test?.title === "string" ? chatData.test.title : ""
  data.owner.messageId = chatData.owner?.messageId ?? null
  data.previousMessage = {
    ...data.previousMessage, messageId: attackId, actorId: defenderId
  }
  if (kind === "energeticAura") {
    const aura = defender?.system?.specialProperties?.energyAura
    if (!aura || attack.data.test?.typeSub !== "meleeWeapon") return null
    const magic = Number(defender.system.specialAttributes?.magic?.augmented?.value) || 0
    data.damage.base = data.damage.value = magic * 2
    data.combat.armorPenetration = -magic
    data.damage.type = "physical"
    data.damage.source = "magical"
  } else {
    if (attack.data.test?.type !== "ramming" || attack.roller?.type !== "actorDrone") return null
    const ramming = await (helpers?.ramming ?? rammingOf)(attack.roller, defender, attack.data.combat?.ramming)
    const {
      SR5_ConverterHelpers: converter
    } = await import("./converter.js")
    const damages = converter.rammingDefenseDamages(ramming.ramming, {
      defenderIsVehicle: defender?.type === "actorDrone", defenderBody: Number(defender?.system?.attributes?.body?.augmented?.value) || 0,
      damageBase: ramming.base, netHits,
    })
    if (!(damages.initiator > 0)) return null
    data.damage.base = data.damage.value = damages.initiator
    data.combat.armorPenetration = 0
    data.damage.type = "physical"
  }
  data.damage.resistanceType = "physicalDamage"
  return vouch(data)
}

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
    return !!attack && standsFor(attack, actor) && sameActor(attack.roller, actor)
  }
  //Also its author must own the actor hurt: a drone's owner on its sheet is no proof (Hyacinthe's review, D2)
  return standsFor(card, actor)
}
