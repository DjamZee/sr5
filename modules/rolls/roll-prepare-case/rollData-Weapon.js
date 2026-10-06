import {
  SR5
} from "../../config.js"
import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5_CombatHelpers 
} from "../roll-helpers/combat.js"
import {
  SR5_EffectArea
} from "../../system/effectArea.js"
import {
  isRecoilCarriedOver
} from "../roll-helpers/recoil.js"
import {
  SR5_RollMessage 
} from "../roll-message.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import {
  SR5_ConverterHelpers
} from "../roll-helpers/converter.js"
import {
  SR5_UtilityItem
} from "../../entities/items/utilityItem.js"
import {
  hasWeaponTrait, fanningTargetsLinked, FANNING_AMMO, FANNING_MAX_TARGETS
} from "../../entities/items/weaponTraits.js"
import {
  grapplingCalledShots, holdKindOn, clinchAttackPenalty, clinchCancelsReach, isHeldBy, isClinchFirearm
} from "../roll-helpers/grapple-rules.js"

//Add info for weapon Roll
export default async function weapon(rollData, actor, item){
  let actorData = actor.system,
    itemData = item.system

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.AttackWith")} ${item.name}`

  //Determine dicepool composition
  rollData.dicePool.composition = itemData.weaponSkill.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, itemData.weaponSkill.modifiers)

  //Determine limit
  if (itemData.category === "grenade") {
    rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actorData.limits.physicalLimit.value, actorData.limits.physicalLimit.modifiers)
    rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, actorData.limits.physicalLimit.modifiers)
    rollData.limit.type = "physicalLimit"
  } else {
    rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(itemData.accuracy.value, itemData.accuracy.modifiers)
    rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, itemData.accuracy.modifiers)
    rollData.limit.type = "accuracy"
  }

  //Recoil Compensation calculation
  rollData.combat.recoil.compensationActor = actorData.recoilCompensation.value
  rollData.combat.recoil.compensationWeapon = itemData.recoilCompensation.value
  rollData.combat.recoil.cumulative = actor.getFlag("sr5", "cumulativeRecoil") || 0
  // SR5 p. 179: a mounted weapon gets the vehicle's Body as compensation on top of the weapon's own (updateRecoil sets
  // the drone's compensation to its Body); the dialog (calculRecoil) already adds both, keep the stored value consistent
  rollData.combat.recoil.value = rollData.combat.recoil.compensationActor + rollData.combat.recoil.compensationWeapon - rollData.combat.recoil.cumulative
    
  //Handle Targets & range
  rollData = await handleTargetInfo(rollData, actor, item)
  if(!rollData) return

  //SR5 p. 178: outside combat there are no action phases, each shot stands alone
  if (!isRecoilCarriedOver(actor)){
    rollData.combat.recoil.value += rollData.combat.recoil.cumulative
    rollData.combat.recoil.cumulative = 0
  }

  //Handle Martial Arts for Called Shots
  rollData = await handleMartialArtsCalledShot(rollData, actor)

  //Handle ranged weapon current firing mode here too: handleTargetInfo skips it when no scene is viewed
  if (itemData.category === "rangedWeapon" && !rollData.combat.firingMode.selected) rollData.combat.firingMode.selected = SR5_ConverterHelpers.initialFiringMode(itemData.firingMode, rollData.target.fanning)
  //With a firing mode, the dialog replaces this action by the mode's own (same source)
  if (itemData.category === "rangedWeapon") rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, SR5_ConverterHelpers.rangedAttackAction(rollData.combat.firingMode.selected))

  //Handle Toxin
  if (itemData.damageElement === "toxin") rollData.damage.toxin = itemData.toxin

  //Handle Anticoagulant
  if (actorData.specialProperties.anticoagulant === true) itemData.damageElement = "anticoagulant"

  //Handle Actions
  if (itemData.category === "meleeWeapon") rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "attack"
  })
    
  //Add others informations
  rollData.test.typeSub = itemData.category
  rollData.test.type = "attack"
  rollData.damage.base = itemData.damageValue.value
  rollData.damage.value = itemData.damageValue.value
  rollData.damage.type = itemData.damageType
  //Every weapon deals Physical or Stun damage (SR5 p. 171): one entered without a type lets the attacker pick it
  //in the roll dialog, rather than a "4undefined" damage that no condition monitor takes
  if (!rollData.damage.type) rollData.dialogSwitch.chooseDamageType = true
  rollData.damage.element = itemData.damageElement
  if (itemData.isMagical) rollData.damage.source = "magical"
  //A weapon focus stays a physical attack: grey mana does not resist it (Better Than Bad p. 140)
  if (itemData.isMagical) rollData.damage.weaponFocus = true
  rollData.combat.armorPenetration = itemData.armorPenetration.value
  rollData.combat.ammo.type = itemData.ammunition.type
  rollData.combat.ammo.value = itemData.ammunition.value
  rollData.combat.ammo.max = itemData.ammunition.max

  // Resolve custom ammo effects for roll system (called shots, combat checks)
  rollData.combat.ammo.effects = null
  if (itemData.ammunition.type) {
    // Check actor's ammo items first
    if (actor) {
      const ammoItem = actor.items.find(i =>
        i.type === "itemAmmunition" &&
        i.system.type === itemData.ammunition.type &&
        (i.system.class === itemData.type || !i.system.class)
      )
      if (ammoItem?.system.ammunitionTypeUuid && ammoItem.system.ammunitionTypeUuid !== 'pending') {
        rollData.combat.ammo.effects = ammoItem.system.effects
      }
    }
    // Resolve from world ammo type items if not found on actor
    if (!rollData.combat.ammo.effects && !SR5.allAmmunitionTypes[itemData.ammunition.type] && game.items) {
      const slug = itemData.ammunition.type
      const ammoTypeItem = game.items.find(i => {
        if (i.type !== 'itemAmmunitionType') return false
        return i.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === slug
      })
      if (ammoTypeItem) {
        rollData.combat.ammo.effects = ammoTypeItem.system
      }
    }
  }

  // AV anti-drone AP bonus
  if (rollData.target.actorType === "actorDrone") {
    if (rollData.combat.ammo.effects?.antiVehicleAP) rollData.combat.armorPenetration += rollData.combat.ammo.effects.antiVehicleAP
    else if (itemData.ammunition.type === "av") rollData.combat.armorPenetration -= 4
  }
  rollData.combat.firingMode.singleShot = itemData.firingMode.singleShot
  rollData.combat.firingMode.semiAutomatic = itemData.firingMode.semiAutomatic
  rollData.combat.firingMode.burstFire = itemData.firingMode.burstFire
  rollData.combat.firingMode.fullyAutomatic = itemData.firingMode.fullyAutomatic

  rollData.lists.firingModes = {
  }
  if (rollData.combat.firingMode.singleShot) rollData.lists.firingModes.SS = `${game.i18n.localize("SR5.WeaponModeSS")} (${game.i18n.localize("SR5.WeaponModeSSShort")} [-1 ${game.i18n.localize("SR5.Bullet")}])`
  if (rollData.combat.firingMode.semiAutomatic) {
    rollData.lists.firingModes.SA = `${game.i18n.localize("SR5.WeaponModeSA")} (${game.i18n.localize("SR5.WeaponModeSAShort")} [-1 ${game.i18n.localize("SR5.Bullet")}])`
    rollData.lists.firingModes.SB = `${game.i18n.localize("SR5.WeaponModeSB")} (${game.i18n.localize("SR5.WeaponModeSBShort")} [-3 ${game.i18n.localize("SR5.Bullets")}])`
  }
  if (rollData.combat.firingMode.burstFire) {
    rollData.lists.firingModes.BF = `${game.i18n.localize("SR5.WeaponModeBF")} (${game.i18n.localize("SR5.WeaponModeBFShort")} [-3 ${game.i18n.localize("SR5.Bullets")}])`
    rollData.lists.firingModes.LB = `${game.i18n.localize("SR5.WeaponModeLB")} (${game.i18n.localize("SR5.WeaponModeLBShort")} [-6 ${game.i18n.localize("SR5.Bullets")}])`
  }
  if (rollData.combat.firingMode.fullyAutomatic) {
    rollData.lists.firingModes.FA = `${game.i18n.localize("SR5.WeaponModeFA")} (${game.i18n.localize("SR5.WeaponModeFAShort")} [-6 ${game.i18n.localize("SR5.Bullets")}])`
    rollData.lists.firingModes.FAc = `${game.i18n.localize("SR5.WeaponModeFA")} (${game.i18n.localize("SR5.WeaponModeFAShort")} [-10 ${game.i18n.localize("SR5.Bullets")}])`
    rollData.lists.firingModes.SF = `${game.i18n.localize("SR5.WeaponModeSF")} (${game.i18n.localize("SR5.WeaponModeSFShort")} [-20 ${game.i18n.localize("SR5.Bullets")}])`
  }
    
  //Flamethrower (Gun H(e)aven 3 p. 3): Suppressive Fire and the fanning sweep; several targets leave only the sweep
  if (hasWeaponTrait(itemData, "flamethrower")) {
    //Suppressive Fire (SR5 p. 179) with its 20 units, fuel rather than rounds
    rollData.lists.firingModes.SF = `${game.i18n.localize("SR5.WeaponModeSF")} (${game.i18n.localize("SR5.WeaponModeSFShort")} [-20 ${game.i18n.localize("SR5.FuelUnits")}])`
    const fanningLabel = `${game.i18n.localize("SR5.WeaponModeFN")} (${game.i18n.localize("SR5.WeaponModeFNShort")} [-${FANNING_AMMO} ${game.i18n.localize("SR5.FuelUnits")}])`
    if (rollData.target.fanning) rollData.lists.firingModes = {
      FN: fanningLabel
    }
    else rollData.lists.firingModes.FN = fanningLabel
  }

  rollData.combat.range.short = itemData.range.short.value
  rollData.combat.range.medium = itemData.range.medium.value
  rollData.combat.range.long = itemData.range.long.value
  rollData.combat.range.extreme = itemData.range.extreme.value
  rollData.combat.weaponType = itemData.type
  rollData.lists.weaponRanges = {
    short: `${game.i18n.localize("SR5.WeaponRangeShort")} (${game.i18n.localize("SR5.WeaponRangeUpTo")} ${rollData.combat.range.short}) ${game.i18n.localize("SR5.MeterUnit")}`,
    medium: `${game.i18n.localize("SR5.WeaponRangeMedium")} (${game.i18n.localize("SR5.WeaponRangeUpTo")} ${rollData.combat.range.medium}) ${game.i18n.localize("SR5.MeterUnit")}`,
    long: `${game.i18n.localize("SR5.WeaponRangeLong")} (${game.i18n.localize("SR5.WeaponRangeUpTo")} ${rollData.combat.range.long}) ${game.i18n.localize("SR5.MeterUnit")}`,
    extreme: `${game.i18n.localize("SR5.WeaponRangeExtreme")} (${game.i18n.localize("SR5.WeaponRangeUpTo")} ${rollData.combat.range.extreme}) ${game.i18n.localize("SR5.MeterUnit")}`,
  }

  //Special case for engulf
  if (itemData.systemEffects.length){
    for (let e of Object.values(itemData.systemEffects)){
      if (e.value === "engulfWater" || e.value === "engulfFire" || e.value === "engulfAir" || e.value === "engulfEarth") {
        rollData.damage.isContinuous = true
        rollData.damage.originalValue = itemData.damageValue.value
      }
    }
  }

  //Special case for Energy aura and melee weapon
  if (actorData.specialProperties.energyAura){
    rollData.damage.base = itemData.damageValue.value + actorData.specialAttributes.magic.augmented.value
    rollData.damage.value = itemData.damageValue.value + actorData.specialAttributes.magic.augmented.value
    rollData.combat.armorPenetration = -actorData.specialAttributes.magic.augmented.value
    rollData.damage.element = actorData.specialProperties.energyAura
    if (actorData.specialProperties.energyAura !== "electricity") rollData.damage.type = "physical"
  }

  // Aggravated Wounds (Howling Shadows p. 213): the critter's attacks leave boxes that count double for healing
  if (actorData.specialProperties?.aggravatedWounds) rollData.damage.aggravated = true

  _buildCalledShotList(rollData)
  //Aim for Perfection (Assassin's Primer p. 15): the dialog reminds that a Called Shot is expected
  rollData.combat.calledShot.aimForPerfection = aimForPerfectionReminder(actorData)
  if (game.settings.get("sr5", "sr5GrapplingRules")) {
    _addGrapplingCalledShots(rollData, actor)
    _addClinchModifiers(rollData, actor)
  }

  return rollData
}

//Run & Gun p. 133 (Saisie): melee weapons take a penalty equal to their Reach, firearms one equal to the net hits
//of the clinch; between the two fighters, Reach is cancelled
function _addClinchModifiers(rollData, actor){
  const penalty = clinchAttackPenalty(actor.effects, {
    category: rollData.test.typeSub,
    reach: rollData.combat.reach,
    isFirearm: isClinchFirearm(rollData.combat.weaponType),
  })
  if (penalty) rollData.dicePool.modifiers.push({
    type: "grappleClinch", label: game.i18n.localize("SR5.GrappleClinchPenalty"), value: penalty
  })
  if (clinchCancelsReach(actor.effects, rollData.target.actorId)) rollData.combat.reach = 0
}

//SR5 p. 195-196 (Maîtriser, renforcer sa prise): normal unarmed attacks, not called shots, hence no -4
//(convertCalledShotToMod gives 0) and no free action. They share the called shot's way to the defense card.
//Without the called shot rules, the list keeps only them: subduing belongs to the core book.
function _addGrapplingCalledShots(rollData, actor){
  const keys = grapplingCalledShots({
    unarmed: rollData.combat.weaponType === "unarmedCombat",
    holdKind: holdKindOn(actor.effects, rollData.target.actorId),
    melee: rollData.test.typeSub === "meleeWeapon",
    heldByTarget: isHeldBy(actor.effects, rollData.target.actorId),
    canReverse: !!rollData.combat.calledShot.martialArts.reversal,
  })
  if (!keys.length) return
  if (!rollData.systemRules.calledShots) {
    rollData.lists.calledShots = {
    }
    rollData.lists.calledShotsSpecific = {
    }
  }
  for (const key of keys) rollData.lists.calledShots[key] = game.i18n.localize(GRAPPLING_CALLED_SHOT_LABELS[key])
  rollData.systemRules.grappling = true
}

const GRAPPLING_CALLED_SHOT_LABELS = {
  subdue: "SR5.CS_Subdue",
  strengthenHold: "SR5.CS_StrengthenHold",
  reversal: "SR5.CS_Reversal",
}



//-----------------------------------//
//               Helpers             //
//-----------------------------------//

async function handleTargetInfo(rollData, actor, item){
  let itemData = item.system
  // No scene on the canvas: no distance and no environment to read. Say so rather than roll as if all were normal.
  if (!SR5_CombatHelpers.environmentScene()) {
    ui.notifications.warn(game.i18n.localize("SR5.WARN_NoSceneForEnvironment"))
    return rollData
  }
  //Keep the scene the attack is rolled on, so the defense reads its conditions and not the clicker's canvas
  rollData.target.sceneId = SR5_CombatHelpers.environmentScene().id
  let target = 0,
    sceneEnvironmentalMod,
    targetActor
  rollData.target.range = "short"
    
  //Initialize area environmental modifiers
  let areaEffect = {
    visibility:0, light:0, glare:0, wind:0
  }

  //Get attacker position
  let attacker = SR5_EntityHelpers.getActorCanvasPosition(actor)

  //Handle Targets
  if (game.user.targets.size) {
    //Flamethrower fanning (Gun H(e)aven 3 p. 3): up to three targets, linked within 4 m, all in range
    const isFanning = game.user.targets.size > 1 && hasWeaponTrait(itemData, "flamethrower")
    if (isFanning) {
      const fanning = await checkFanningTargets(Array.from(game.user.targets), attacker, itemData.range.extreme.value)
      if (!fanning) return false
      rollData.target.fanning = fanning.actorIds
      rollData.target.fanningFarthest = fanning.farthest
      rollData.combat.firingMode.selected = "FN"
      rollData.combat.ammo.fired = FANNING_AMMO
    }
    //Otherwise, only allow one target for attack;
    else if (game.user.targets.size > 1) {
      ui.notifications.warn(`${game.i18n.localize("SR5.WARN_TargetTooMany")}`)
      return false
    }

    //Get target actor
    targetActor = await SR5_PrepareRollHelper.getTargetedActor()

    //check if actor is in a template effect
    areaEffect = await checkIfTargetIsInTemplate(actor, targetActor, areaEffect)

    //Add actor type and ID to chatMessage
    rollData.target.hasTarget = true
    rollData.target.actorType = targetActor.type
    rollData.target.actorId = await SR5_PrepareRollHelper.getTargetedActorID()

    //Get target position
    const targeted = game.user.targets
    const targets = Array.from(targeted)
    for (let t of targets) {
      // game.user.targets holds Token placeables, whose own x/y are the PIXI position and stay at 0 in V13.
      // The grid coordinates live on the document, as they do for the attacker in getActorCanvasPosition.
      target = {
        x: t.document.x,
        y: t.document.y,
      }
    }
    //Fanning: the range modifier is the farthest target's
    if (rollData.target.fanning) target = rollData.target.fanningFarthest
  }

  //Add specific data for grenade & missile
  if (itemData.category === "grenade"|| itemData.type === "grenadeLauncher" || itemData.type === "missileLauncher") {
    target = await SR5_SystemHelpers.getTemplateItemPosition(item.id)
    rollData.chatCard.templateRemove = true
    rollData.combat.grenade.isGrenade = true
    rollData.combat.grenade.damageFallOff = itemData.blast.damageFallOff
    rollData.combat.grenade.blastRadius = itemData.blast.radius
    // The template just placed for this shot, so that scatter and blast later move and measure this one
    rollData.combat.grenade.templateId = SR5_SystemHelpers.findItemTemplate(item.id)?.id ?? ""
  }

  //Calcul distance between Attacker and Target
  // The field is named rangeInMeters and it is compared to the weapon's range table, which is headed
  // "RANGE IN METERS" (SR5 p. 186). The canvas measures in the scene's own unit, so it is converted here.
  rollData.target.rangeInMeters = await SR5_SystemHelpers.getDistanceInMetersBetweenTwoPoint(attacker, target)

  //A flashlight lights where its own weapon points (Run & Gun p. 69): only this weapon's counts
  const weaponLight = SR5_UtilityItem.getWeaponLightCompensation(itemData, actor)
  const weaponLightCap = SR5_UtilityItem.getWeaponLightCap(itemData)

  //Handle Melee specifics
  if (itemData.category === "meleeWeapon") {
    rollData.combat.reach = itemData.reach.value
    // Melee range is a number of grid spaces: the adjacent one, diagonal included, plus one per point of
    // Reach (SR5 p. 187). It is counted between the spaces both tokens cover rather than compared to a
    // distance, which would depend on the scene's scale, its diagonal rule and the tokens' sizes. Only a
    // measured distance is checked, as for ranged weapons: with no target or no token there is nothing to
    // refuse. A gridless scene has no space to count, so it falls back to (Reach + 1) grid units.
    const attackerDocument = actor.token ?? canvas.scene.tokens.find(t => t.actorId === actor.id)
    const targetDocument = Array.from(game.user.targets).at(-1)?.document
    let inReach = SR5_SystemHelpers.isInMeleeRange(canvas.grid, attackerDocument?.getOccupiedGridSpaceOffsets(), targetDocument?.getOccupiedGridSpaceOffsets(), itemData.reach.value)
    if (inReach === null) inReach = rollData.target.rangeInMeters <= (itemData.reach.value + 1) * SR5_SystemHelpers.convertSceneUnitsToMeters(canvas.scene.grid.distance)
    if (Number.isFinite(rollData.target.rangeInMeters) && !inReach) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetIsTooFar"))
      return false
    }
    sceneEnvironmentalMod = SR5_CombatHelpers.handleEnvironmentalModifiers(SR5_CombatHelpers.environmentScene(), actor.system, true, areaEffect, true, weaponLight, weaponLightCap)
    // Kept on the card for the defense to compare with (SR5 p. 188 option), before the option clears it here
    rollData.combat.environmentalMod = sceneEnvironmentalMod
    const targetMod = SR5_CombatHelpers.meleeEnvironmentalMod(SR5_CombatHelpers.environmentScene(), targetActor)
    if (SR5_CombatHelpers.meleeEnvironmentBalanced(sceneEnvironmentalMod, targetMod)) sceneEnvironmentalMod = 0
  } else { // Handle weapon ranged based on distance
    // SR5 p. 186: the range bands of the Weapon Ranges table are inclusive of their upper bound (0-5, 6-10,
    // 11-15, 16-20; 0-STR, up to STR x n for the Strength-based rows), so a target exactly at short range is at
    // short range. Comparing with < also left the distance exactly equal to extreme range in no band at all,
    // and the roll kept the initial "short".
    if (rollData.target.rangeInMeters <= itemData.range.short.value) rollData.target.range = "short"
    else if (rollData.target.rangeInMeters <= itemData.range.medium.value) rollData.target.range = "medium"
    else if (rollData.target.rangeInMeters <= itemData.range.long.value) rollData.target.range = "long"
    else if (rollData.target.rangeInMeters <= itemData.range.extreme.value) rollData.target.range = "extreme"
    // Only refuse a distance that was actually measured. A ranged attack does not require a designated
    // target: suppressive fire (SR5 p. 181) is rolled with no target at all, and an actor with no token on
    // the scene has no position either. In both cases the point stays 0, measurePath returns NaN, and NaN
    // compares false against every band above - so without this condition the bare else would refuse the
    // roll as "target too far", which is wrong twice over: there is no target, and nothing is far. An
    // unmeasurable distance carries no range modifier, which is short range (+0, SR5 p. 186); the GM
    // applies a band by hand if the fiction calls for one.
    else if (Number.isFinite(rollData.target.rangeInMeters)) {
      // removeTemplate matches on flags.sr5.itemUuid, which AbilityTemplate.fromItem fills from
      // item.uuid; flags.sr5.item holds the id and is what getTemplateItemPosition looks up.
      if (itemData.category === "grenade"|| itemData.type === "grenadeLauncher" || itemData.type === "missileLauncher") SR5_RollMessage.removeTemplate(null, item.uuid)
      ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetIsTooFar"))
      return false
    }
    const environmentalColumns = SR5_CombatHelpers.environmentalColumns(SR5_CombatHelpers.environmentScene(), actor.system, false, areaEffect, false, weaponLight, weaponLightCap)
    if (environmentalColumns) {
      // Range is an environmental modifier (SR5 p. 176): the roll dialog weighs the range line against these
      rollData.combat.environmentalColumns = environmentalColumns
      sceneEnvironmentalMod = SR5_ConverterHelpers.environmentalLineToMod(SR5_CombatHelpers.environmentalLine(environmentalColumns))
    }
  }

  //Handle ranged weapon current firing mode (several targets for a flamethrower: the sweep, set above)
  if (itemData.category === "rangedWeapon") {
    rollData.combat.firingMode.selected = SR5_ConverterHelpers.initialFiringMode(itemData.firingMode, rollData.target.fanning)
  }
    
  //Handle shotgun current choke settings
  if (itemData.type === "shotgun") {
    rollData.combat.choke.selected = SR5_ConverterHelpers.chokeToCode(itemData.choke)
  }

  //Add environmental modifiers
  if (sceneEnvironmentalMod !== 0){
    rollData.dicePool.modifiers.push({
      type: "environmentalSceneMod", 
      label: game.i18n.localize("SR5.EnvironmentalModifiers"),
      value: sceneEnvironmentalMod,
    })
  }

  return rollData
}

//A linked target carries the effects of templates on every scene it stands on: only those of the scene the
//attack is made on count (the scene on the canvas, the one handleEnvironmentalModifiers reads too)
export async function checkIfTargetIsInTemplate(actor, targetActor, areaEffect, sceneId = SR5_CombatHelpers.environmentScene()?.id){
  let targetActorItems = targetActor.items.filter(i => i.type === "itemEffect" && i.system.type === "areaEffect" && !SR5_EffectArea.isAreaEffectOffScene(i, sceneId))
  for (let i of targetActorItems){
    //Check if current actors is not inside the same area effect
    if (!actor.items.find(actorItem => actorItem.system.ownerID === i.system.ownerID)){
      //iterate through customEffects and add modifiers to areaEffect variable
      for (let e of i.system.customEffects){
        if (e.category === "environmentalModifiers") areaEffect[e.target.slice(40)] = e.value
      }
    }
  }

  return areaEffect
}

export async function handleMartialArtsCalledShot(rollData, actor){
  for (let [key, value] of Object.entries(actor.system.itemsProperties.martialArts)){
    if (value.isActive) rollData.combat.calledShot.martialArts[key] = true
    // A technique lowers the penalty on its own (Run & Gun p. 125): no unlocking flag needed
    if (value.modifier?.value) rollData.combat.calledShot.martialArtsModifiers[key] = value.modifier.value
  }
  return rollData
}

// Run & Gun p. 125: Pin is a general called shot for bows, crossbows and throwing weapons only,
// whatever the ammo; the Capture précise technique (p. 148) only lowers its penalty
const PIN_WEAPON_TYPES = ["throwing", "bow", "lightCrossbow", "mediumCrossbow", "heavyCrossbow"]
export function canPin(weaponType){
  return PIN_WEAPON_TYPES.includes(weaponType)
}

export function _buildCalledShotList(rollData){
  rollData.lists.calledShots = {
  }
  rollData.lists.calledShotsSpecific = {
  }

  let ammoType = rollData.combat.ammo.type

  if (ammoType === "explosive" || ammoType ==="exExplosive" || ammoType === "flechette" || ammoType === "arrow" || ammoType === "bolt" || ammoType === "gel" || ammoType === "hollowPoint") {
    rollData.lists.calledShots.blastOutOfHand = game.i18n.localize("SR5.CS_AS_FingerPopper")
  } else {
    rollData.lists.calledShots.blastOutOfHand = game.i18n.localize("SR5.CS_BlastOutOfHand")
  }

  if (rollData.test.typeSub === "meleeWeapon" && rollData.combat.calledShot.martialArts.breakWeapon){
    rollData.lists.calledShots.breakWeapon = game.i18n.localize("SR5.CS_BreakWeapon")
  }

  if (rollData.damageType === "stun"){
    rollData.lists.calledShots.harderKnock = game.i18n.localize("SR5.CS_HarderKnock")
  }

  rollData.lists.calledShots.specificTarget = game.i18n.localize("SR5.CS_SpecificTarget")

  if (ammoType === "explosive" || ammoType ==="exExplosive" || ammoType === "frangible" || ammoType === "gel" || ammoType === "gyrojet" || ammoType === "gyrojetTaser" || ammoType === "hollowPoint") {
    rollData.lists.calledShots.dirtyTrick = game.i18n.localize("SR5.CS_AS_HereMuckInYourEye")
  } else {
    rollData.lists.calledShots.dirtyTrick = game.i18n.localize("SR5.CS_DirtyTrick")
  }

  if (canPin(rollData.combat.weaponType)){
    rollData.lists.calledShots.pin = game.i18n.localize("SR5.CS_Pin")
  }
    
  if (rollData.combat.weaponType === "unarmedCombat"){
    rollData.lists.calledShots.disarm = game.i18n.localize("SR5.CS_Disarm")
  }

  if ((rollData.combat.weaponType === "exoticRangedWeapon" || rollData.combat.weaponType === "exoticMeleeWeapon") && rollData.combat.calledShot.martialArts.entanglement){
    rollData.lists.calledShots.entanglement = game.i18n.localize("SR5.CS_Entanglement")
  }

  if (ammoType === "explosive" || ammoType ==="exExplosive") {
    rollData.lists.calledShots.shakeUp = game.i18n.localize("SR5.CS_AS_ShakeRattle")
  } else {
    rollData.lists.calledShots.shakeUp = game.i18n.localize("SR5.CS_ShakeUp")
  }

  if (rollData.test.typeSub === "meleeWeapon"){
    rollData.lists.calledShots.feint = game.i18n.localize("SR5.CS_Feint")
  }

  rollData.lists.calledShots.splittingDamage = game.i18n.localize("SR5.CS_SplittingDamage")

  if (rollData.test.typeSub === "meleeWeapon"){
    rollData.lists.calledShots.knockdown = game.i18n.localize("SR5.CS_Knockdown")
  }

  rollData.lists.calledShots.trickShot = game.i18n.localize("SR5.CS_TrickShot")

  if (rollData.test.typeSub === "meleeWeapon" && rollData.combat.calledShot.martialArts.reversal){
    rollData.lists.calledShots.reversal = game.i18n.localize("SR5.CS_Reversal")
  }

  rollData.lists.calledShots.vitals = game.i18n.localize("SR5.CS_Vitals")

  //Ammo specifics called shots — tag-based path for custom ammo, fallback to string checks
  const ammoEffects = rollData.combat.ammo.effects
  const tags = ammoEffects?.calledShotTags
  if (tags?.length) {
    // Tag-based called shot eligibility (custom ammo)
    const tagMap = {
      bellringer: "SR5.CS_AS_Bellringer",
      ricochetShot: "SR5.CS_AS_RicochetShot",
      bullsEye: "SR5.CS_AS_BullsEye",
      downTheGullet: "SR5.CS_AS_DownTheGullet",
      extremeIntimidation: "SR5.CS_AS_ExtremeIntimidation",
      warningShot: "SR5.CS_AS_WarningShot",
      hitEmWhereItCounts: "SR5.CS_AS_HitEmWhereItCounts",
      flameOn: "SR5.CS_AS_FlameOn",
      flashBlind: "SR5.CS_AS_FlashBlind",
      onPinsAndNeedles: "SR5.CS_AS_OnPinsAndNeedles",
      shreddedFlesh: "SR5.CS_AS_ShreddedFlesh",
      tag: "SR5.CS_AS_Tag",
      throughAndInto: "SR5.CS_AS_ThroughAndInto",
      upTheAnte: "SR5.CS_AS_UpTheAnte",
    }
    for (const t of tags) {
      if (tagMap[t]) rollData.lists.calledShotsSpecific[t] = game.i18n.localize(tagMap[t])
    }
    // Variant labels based on tags
    if (tags.includes("fingerPopper")) {
      rollData.lists.calledShots.blastOutOfHand = game.i18n.localize("SR5.CS_AS_FingerPopper")
    }
    if (tags.includes("hereMuckInYourEye")) {
      rollData.lists.calledShots.dirtyTrick = game.i18n.localize("SR5.CS_AS_HereMuckInYourEye")
    }
    if (tags.includes("shakeRattle")) {
      rollData.lists.calledShots.shakeUp = game.i18n.localize("SR5.CS_AS_ShakeRattle")
    }
    // A "pin" tag adds nothing: Pin depends on the weapon, not on the ammo (Run & Gun p. 125)
  } else {
    // Legacy string-based called shot eligibility
    if (ammoType === "gel") rollData.lists.calledShotsSpecific.bellringer = game.i18n.localize("SR5.CS_AS_Bellringer")
    if (ammoType === "gel" || ammoType === "gyrojet" || ammoType === "gyrojetTaser") rollData.lists.calledShotsSpecific.ricochetShot = game.i18n.localize("SR5.CS_AS_RicochetShot")
    if (ammoType === "apds") rollData.lists.calledShotsSpecific.bullsEye = game.i18n.localize("SR5.CS_AS_BullsEye")
    if (ammoType === "capsule" || ammoType === "capsuleDmso") rollData.lists.calledShotsSpecific.downTheGullet = game.i18n.localize("SR5.CS_AS_DownTheGullet")
    if (ammoType === "assaultCannon") rollData.lists.calledShotsSpecific.extremeIntimidation = game.i18n.localize("SR5.CS_AS_ExtremeIntimidation")
    if (ammoType === "injection" || ammoType === "boltInjection" || ammoType === "arrowInjection") {
      rollData.lists.calledShotsSpecific.warningShot = game.i18n.localize("SR5.CS_AS_WarningShot")
      rollData.lists.calledShotsSpecific.hitEmWhereItCounts = game.i18n.localize("SR5.CS_AS_HitEmWhereItCounts")
    }
    if (ammoType === "flare" || ammoType === "gyrojet" || ammoType === "gyrojetTaser" || ammoType === "tracer") rollData.lists.calledShotsSpecific.flameOn = game.i18n.localize("SR5.CS_AS_FlameOn")
    if (ammoType === "flare") rollData.lists.calledShotsSpecific.flashBlind = game.i18n.localize("SR5.CS_AS_FlashBlind")
    if (ammoType === "flechette" || ammoType === "arrow" || ammoType === "arrowBarbedHead" || ammoType === "arrowExplosiveHead" ||
         ammoType === "arrowHammerhead" || ammoType === "arrowIncendiaryHead" || ammoType === "arrowScreamerHead" ||
         ammoType === "arrowStickNShock" || ammoType === "arrowStaticShaft" || ammoType === "bolt") {
      rollData.lists.calledShotsSpecific.onPinsAndNeedles = game.i18n.localize("SR5.CS_AS_OnPinsAndNeedles")
      rollData.lists.calledShotsSpecific.shreddedFlesh = game.i18n.localize("SR5.CS_AS_ShreddedFlesh")
    }
    if (ammoType === "tracker") rollData.lists.calledShotsSpecific.tag = game.i18n.localize("SR5.CS_AS_Tag")
    if (ammoType === "apds" || ammoType === "gauss") rollData.lists.calledShotsSpecific.throughAndInto = game.i18n.localize("SR5.CS_AS_ThroughAndInto")
    if (ammoType === "av" || ammoType === "assaultCannon") rollData.lists.calledShotsSpecific.upTheAnte = game.i18n.localize("SR5.CS_AS_UpTheAnte")
  }

  rollData.lists.calledShotsSpecificDroneTarget = {
    engineBlock: game.i18n.localize("SR5.CS_ST_EngineBlock"),
    fuelTankBattery: game.i18n.localize("SR5.CS_ST_FuelTankBattery"),
    axle: game.i18n.localize("SR5.CS_ST_Axle"),
    antenna: game.i18n.localize("SR5.CS_ST_Antenna"),
    doorLock: game.i18n.localize("SR5.CS_ST_DoorLock"),
    windowMotor: game.i18n.localize("SR5.CS_ST_WindowMotor"),
  }

  rollData.lists.calledShotsSpecificTarget = {
    ankle: game.i18n.localize("SR5.CS_ST_Ankle"),
    ear: game.i18n.localize("SR5.CS_ST_Ear"),
    eye: game.i18n.localize("SR5.CS_ST_Eye"),
    foot: game.i18n.localize("SR5.CS_ST_Foot"),
    forearm: game.i18n.localize("SR5.CS_ST_Forearm"),
    genitals: game.i18n.localize("SR5.CS_ST_Genitals"),
    gut: game.i18n.localize("SR5.CS_ST_Gut"),
    hand: game.i18n.localize("SR5.CS_ST_Hand"),
    hip: game.i18n.localize("SR5.CS_ST_Hip"),
    jaw: game.i18n.localize("SR5.CS_ST_Jaw"),
    knee: game.i18n.localize("SR5.CS_ST_Knee"),
    neck: game.i18n.localize("SR5.CS_ST_Neck"),
    shin: game.i18n.localize("SR5.CS_ST_Shin"),
    shoulder: game.i18n.localize("SR5.CS_ST_Shoulder"),
    sternum: game.i18n.localize("SR5.CS_ST_Sternum"),
    thigh: game.i18n.localize("SR5.CS_ST_Thigh"),
  }

  return rollData
}
//Flamethrower fanning (Gun H(e)aven 3 p. 3): at most three targets, all in range, linked within 4 m of one another.
//Distances are measured on the scene in meters, a grid space being 1.5 m.
async function checkFanningTargets(tokens, attacker, maxRange){
  if (tokens.length > FANNING_MAX_TARGETS) {
    ui.notifications.warn(game.i18n.localize("SR5.WARN_FanningTooMany"))
    return false
  }
  const points = tokens.map(t => ({
    x: t.document.x, y: t.document.y
  }))
  const fromAttacker = []
  for (const point of points) fromAttacker.push(await SR5_SystemHelpers.getDistanceInMetersBetweenTwoPoint(attacker, point))
  if (fromAttacker.some(d => d > maxRange)) {
    ui.notifications.warn(game.i18n.localize("SR5.WARN_FanningOutOfRange"))
    return false
  }
  const distances = []
  for (const a of points) {
    const row = []
    for (const b of points) row.push(a === b ? 0 : await SR5_SystemHelpers.getDistanceInMetersBetweenTwoPoint(a, b))
    distances.push(row)
  }
  if (!fanningTargetsLinked(distances)) {
    ui.notifications.warn(game.i18n.localize("SR5.WARN_FanningTooFar"))
    return false
  }
  const farthest = fromAttacker.indexOf(Math.max(...fromAttacker))
  return {
    actorIds: tokens.map(t => t.actor.isToken ? t.actor.token.id : t.actor.id),
    farthest: points[farthest],
  }
}

//Aim for Perfection (Assassin's Primer p. 15): only a reminder, the book leaves the exceptions to the GM
export function aimForPerfectionReminder(actorData){
  return !!actorData?.specialProperties?.calledShotHalved
}
