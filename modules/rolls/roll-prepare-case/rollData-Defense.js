import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_CombatHelpers 
} from "../roll-helpers/combat.js"
import {
  clinchCancelsReach, holdsTarget
} from "../roll-helpers/grapple-rules.js"
import {
  trustedAttackCard, vouch
} from "../roll-helpers/attack-card.js"
import {
  isElectricHitOnDevice, isPlainHitOnDevice, deviceElectricResistanceData
} from "../roll-helpers/electric-device.js"
import {
  unarmedReachBonus
} from "../../entities/items/weaponTraits.js"
import {
  defenseUnlimitedHits
} from "../roll-helpers/limit.js"
import {
  SR5_SpellShapingHelpers
} from "../roll-helpers/spell-shaping.js"
import {
  rgOption, movementModifiers, phaseMeters
} from "../../system/rg-combat-options.js"
import {
  flashlightDazzles, WEAK_GLARE
} from "../roll-helpers/flashlight-glare.js"

//The defense modifier of RG3 for the defender's own token (its first one on the scene when the actor is linked)
export function defenderMovementModifier(actor, combat = globalThis.game?.combat){
  if (!rgOption("movement") || !combat?.started) return 0
  const token = actor.token ?? globalThis.canvas?.scene?.tokens?.find(t => t.actorId === actor.id && t.actorLink)
  const meters = phaseMeters(token?.getFlag?.("sr5", "runDistance"), combat.id, combat.round)
  return movementModifiers(meters).defense
}

//The resistance of a device hit by an electric weapon, from the attack card read again (attack-card.js); worked out
//here, vouched for as the rigger's biofeedback (entityActor-helpers.js)
async function electricHitOnDevice(actor, chatData){
  const attack = await trustedAttackCard(chatData, actor)
  if (!attack) return
  return actor.rollTest("resistanceCard", null, vouch(deviceElectricResistanceData(attack)))
}

//Add info for Defense Roll
export default async function defense(rollData, actor, chatData){
  //An electric weapon on a device (SR5 p. 172-173): no defense, its resistance comes at once (electric-device.js)
  if (isElectricHitOnDevice(actor, chatData)) return void await electricHitOnDevice(actor, chatData)
  //Any other hit on a device: no defense to roll, the gamemaster rules on it, and is told so (Lucas#2058, R3)
  if (isPlainHitOnDevice(actor, chatData)) return void ui.notifications.info(game.i18n.localize("SR5.INFO_DeviceOnlyElectricity"))
  if (actor.type === "actorSprite") return
  //SR5 p. 329: a Spell Shaping bubble leaves its occupant untouched, so there is no defense test to roll at all.
  //Checked here rather than inside the area template handler, which only runs for spells that have one
  if (SR5_SpellShapingHelpers.skips(actor, chatData)) return void SR5_SpellShapingHelpers.announceSpared(actor)
  //The attack card read again from the chat log: a player's card never sets the DV, AP or hits (attack-card.js)
  chatData = await trustedAttackCard(chatData, actor)
  if (!chatData) return
  let actorData = actor.system

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.PhysicalDefenseTest")} (${chatData.roll.hits})`

  //Determine dicepool composition
  rollData.dicePool.composition = actorData.defenses.defend.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup" || mod.type === "controler"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actorData.defenses.defend.modifiers.filter(mod => (mod.type !== "controler")))

  // SR5 p. 181: the suppressive fire zone penalty applies to every action except avoiding being hit,
  // and the actor's special penalty (which carries it) is already part of the defense modifiers
  let suppressiveFire = actor.items.find(i => i.type === "itemEffect" && i.system.type === "suppressiveFire")
  if (suppressiveFire && rollData.dicePool.modifiers.some(mod => mod.type === "penaltyspecial")) rollData.dicePool.modifiers.push({
    type: "suppressiveFireDefense",
    label: game.i18n.localize("SR5.SuppressiveFireDefenseExempt"),
    value: Math.abs(parseInt(suppressiveFire.system.value) || 0),
  })

  //Add others informations
  rollData.test.type = "defense"
  rollData.test.typeSub = chatData.test.typeSub
  rollData.dialogSwitch.cover = true
  rollData.combat.activeDefenses.full = actorData.specialProperties.fullDefenseValue || 0
  rollData.combat.activeDefenses.dodge = SR5_PrepareRollHelper.getActiveDefenseValue(actorData, "dodge", "gymnastics")
  rollData.combat.activeDefenses.block = SR5_PrepareRollHelper.getActiveDefenseValue(actorData, "block", "unarmedCombat")
  rollData.combat.activeDefenses.parryClubs = SR5_PrepareRollHelper.getActiveDefenseValue(actorData, "parryClubs", "clubs")
  rollData.combat.activeDefenses.parryBlades = SR5_PrepareRollHelper.getActiveDefenseValue(actorData, "parryBlades", "blades")
  // SR5 p. 191-192: dodge, block and parry add a skill, so the Physical limit applies to them
  rollData.combat.activeDefenses.limit = actorData.limits?.physicalLimit?.value || 0
  rollData.combat.activeDefenses.unlimited = defenseUnlimitedHits(actorData.defenses)

  //Transfering data from chatCard
  rollData.previousMessage.hits = chatData.roll.hits
  rollData.previousMessage.actorId = chatData.owner.actorId
  rollData.previousMessage.messageId = chatData.owner.messageId
  rollData.previousMessage.damage = chatData.damage.value
  rollData.previousMessage.userId = chatData.owner.userId
  rollData.damage.element = chatData.damage.element
  rollData.damage.value = chatData.damage.value
  rollData.damage.base = chatData.damage.base
  rollData.damage.type = chatData.damage.type
  rollData.damage.source = chatData.damage.source
  rollData.damage.isContinuous = chatData.damage.isContinuous
  rollData.damage.aggravated = chatData.damage.aggravated
  rollData.damage.originalValue = chatData.damage.originalValue
  //A weapon focus deals magical damage but stays a weapon; a spell's Force sets the AP of its fire (SR5 p. 173)
  rollData.damage.weaponFocus = chatData.damage.weaponFocus
  if (chatData.damage.source === "magical") rollData.magic.force = chatData.magic?.force
  //Electromancer (Forbidden Arcana p. 35): carried to the damage resistance, which lowers the Initiative
  if (chatData.magic?.electromancer) rollData.magic.electromancer = true
  rollData.combat.ammo.type = chatData.combat.ammo.type
  rollData.combat.calledShot = chatData.combat.calledShot
  rollData.combat.armorPenetration = chatData.combat.armorPenetration
  rollData.combat.firingMode.selected = chatData.combat.firingMode.selected
  rollData.target.actorType = chatData.target.actorType
  rollData.target.rangeInMeters = chatData.target.rangeInMeters
  rollData.target.sceneId = chatData.target.sceneId ?? null
  rollData.target.range = chatData.target.range 
  rollData.combat.choke = chatData.combat.choke  
  rollData.combat.weaponType = chatData.combat.weaponType
  //A net (Run & Gun p. 25): it lands on a hit, a graze included (test-Defense.js)
  if (chatData.combat.net) rollData.combat.net = {
    xl: !!chatData.combat.net.xl, shock: !!chatData.combat.net.shock
  }

  //Add special info for Suppressive fire
  if (chatData.combat.firingMode.selected === "SF"){
    rollData = await handleSuppressiveFire(rollData, actorData)
  }

  //Add special info for Melee Weapon modifiers
  if (chatData.test.typeSub === "meleeWeapon"){
    rollData = await handleMeleeWeaponModifiers(rollData, actor, chatData)
  }

  //SR5 p. 176: "Les jets d'attaque et de défense sont sujets aux modificateurs environnementaux". The defender
  //must see the shot coming: Visibility and Light/Glare, worked out with the defender's own vision. Wind is what
  //"the shooter will have to compensate" and range is the attacker's, so neither applies (DjamZ, 2026-10-03).
  //Suppressive fire has its own Reaction + Edge test (p. 181) and is left as it was.
  if (chatData.test.typeSub === "rangedWeapon" && chatData.combat.firingMode.selected !== "SF"){
    //Run & Gun p. 69: the target is in the beam of the flashlight on the weapon, weak glare if it suits its vision
    const dazzled = flashlightDazzles(chatData.combat.weaponLights, actor.system.visions)
    let environmentalMod = SR5_CombatHelpers.handleEnvironmentalModifiers(SR5_CombatHelpers.environmentScene(chatData.target.sceneId), actor.system, true, dazzled ? {
      visibility: 0, light: 0, glare: 0, wind: 0, glareAtLeast: WEAK_GLARE
    } : undefined)
    if (environmentalMod !== 0){
      rollData.dicePool.modifiers.push({
        type: "environmentalSceneMod",
        label: dazzled ? `${game.i18n.localize("SR5.EnvironmentalModifiers")} (${game.i18n.localize("SR5.FlashlightGlare")})` : game.i18n.localize("SR5.EnvironmentalModifiers"),
        value: environmentalMod,
      })
    }
  }

  //Run & Gun RG3 (RG p. 122-123, world setting): the defender who moved in his last Action Phase defends the worse
  //for it, by the speed table; ranged and melee attacks alike ("les tests de défense des personnages en mouvement")
  if ((chatData.test.typeSub === "rangedWeapon" || chatData.test.typeSub === "meleeWeapon") && chatData.combat.firingMode?.selected !== "SF"){
    const ownMovement = defenderMovementModifier(actor)
    if (ownMovement) rollData.dicePool.modifiers.push({
      type: "rgOwnMovement",
      label: game.i18n.localize("SR5.RG_OwnMovement"),
      value: ownMovement,
    })
  }

  //Handle Astral combat defense
  if (chatData.test.typeSub === "astralCombat"){
    if ((actor.type === "actorDevice" || actor.type === "actorSprite") || !actorData.visions.astral.isActive) return void ui.notifications.info(`${game.i18n.format("SR5.INFO_TargetIsNotInAstral", {
      name:actor.name
    })}`)
    rollData = await handleAstralCombat(rollData, actor, chatData)
  }
                
  //Manage spell area templates
  // Measured on the template's own scene, so it does not need a scene on the canvas
  if ((chatData.test.type === "spell" || chatData.test.type === "preparation") && chatData.magic.spell.range === "area"){
    rollData = await handleSpellAreaTemplate(rollData, actor, chatData)
    if (!rollData) return
  }
        
  //Spell damage source
  if (chatData.test.type === "spell") rollData.damage.source = "magical"

  //Add modifiers if actor is locked by sensorHandle sensor locked
  rollData = await handleSensorLocked(rollData, actor, chatData)
                
  //Handle toxin, if any
  if (chatData.damage.toxin.type) {
    if (chatData.damage.toxin.power > 0 && chatData.combat.calledShot.name === "downTheGullet") chatData.damage.toxin.power += 2 
    rollData.damage.toxin = chatData.damage.toxin
  }

  //Handle cumulative defense
  rollData = await SR5_PrepareRollHelper.handleCumulativeDefense(rollData, actor)
    
  return rollData
}

async function handleSuppressiveFire(rollData, actorData){
  //Determine base dicepool
  rollData.dicePool.base = actorData.attributes.reaction.augmented.value + (actorData.specialAttributes?.edge?.augmented?.value || 0)

  //Determine dicepool composition
  rollData.dicePool.composition = [
    {
      source: game.i18n.localize("SR5.Reaction"), type: "linkedAttribute", value: actorData.attributes.reaction.augmented.value
    },
    {
      source: game.i18n.localize("SR5.Edge"), type: "linkedAttribute", value: (actorData.specialAttributes?.edge?.augmented?.value || 0)
    },
  ]

  //Add others informations
  rollData.dialogSwitch.cover = false
  rollData.combat.firingMode.selected = "SF"

  return rollData
}

async function handleMeleeWeaponModifiers(rollData, actor, chatData){
  //Add reach modifiers
  //Bare-handed, the defender adds its "Weapons / Reach" effects on Unarmed Combat to its own Reach
  let reach = (actor.system.reach?.value || 0) + unarmedReachBonus(actor.system) - chatData.combat.reach
  let weaponUsedToDefend = actor.items.find(i => (i.type === "itemWeapon") && (i.system.category === "meleeWeapon") && (i.system.isActive))
  if (weaponUsedToDefend) reach = weaponUsedToDefend.system.reach.value - chatData.combat.reach
  //Run & Gun p. 133 (Saisie): the Reach of both fighters is cancelled between them (grappling rules only)
  if (globalThis.game?.settings?.get?.("sr5", "sr5GrapplingRules") && clinchCancelsReach(actor.effects, chatData.owner.actorId)) reach = 0
  rollData.combat.reach = reach
  //Run & Gun p. 126: against a reversal, the one who holds keeps the superior position (+2, SR5 p. 188)
  if (globalThis.game?.settings?.get?.("sr5", "sr5GrapplingRules") && chatData.combat.calledShot?.name === "reversal" && holdsTarget(actor.effects, chatData.owner.actorId)){
    rollData.dicePool.modifiers.push({
      type: "defenseSuperiorPosition",
      label: game.i18n.localize("SR5.AttackModSuperiorPosition"),
      value: 2,
    })
  }
  if (reach !== 0){
    rollData.dicePool.modifiers.push({
      type: "reach", 
      label: game.i18n.localize("SR5.CharacterReach"),
      value: reach,
    })
  }
    
  //Add environmental modifiers
  let environmentalMod = SR5_CombatHelpers.handleEnvironmentalModifiers(SR5_CombatHelpers.environmentScene(chatData.target.sceneId), actor.system, true, undefined, true)
  // SR5 p. 188 option: compared with the attacker's own modifier, kept on the attack card
  if (SR5_CombatHelpers.meleeDefenseEnvironmentBalanced(environmentalMod, chatData)) environmentalMod = 0
  if (environmentalMod !== 0){
    rollData.dicePool.modifiers.push({
      type: "environmentalSceneMod",
      label: game.i18n.localize("SR5.EnvironmentalModifiers"),
      value: environmentalMod,
    })
  }

  return rollData
}

async function handleAstralCombat(rollData, actor, chatData){
  let actorData = actor.system

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.AstralDefenseTest")} (${chatData.roll.hits})`
  //Determine dicepool composition
  rollData.dicePool.composition = actorData.magic.astralDefense.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actorData.magic.astralDefense.modifiers)
  //Add others informations
  rollData.dialogSwitch.cover = false

  return rollData
}

async function handleSpellAreaTemplate(rollData, actor, chatData){
  // Measured on the scene of the cast, in meters: the spell's area is a radius in meters equal to its Force (SR5 p. 283)
  let distance = SR5_CombatHelpers.spellAreaDistance(chatData, actor)

  // No template to measure from: the GM rules, the defense goes on
  if (distance === null) ui.notifications.warn(game.i18n.localize("SR5.WARN_SpellAreaNoTemplate"))
  else if (chatData.magic.spell.area < distance) {
    ui.notifications.info(`${game.i18n.localize("SR5.WARN_TargetIsTooFar")}`)
    return false
  }
  rollData.magic.spell.range = chatData.magic.spell.range
  rollData.magic.spell.areaThreshold = chatData.magic.spell.areaThreshold

  return rollData
}

async function handleSensorLocked(rollData, actor, chatData){
  let sensorLocked = actor.items.find(i => (i.type === "itemEffect") && (i.system.type === "sensorLock") && (i.system.ownerID === chatData.owner.speakerId) )
  if(sensorLocked){
    rollData.dicePool.modifiers.push({
      type: "sensorLockMod", 
      label: game.i18n.localize("SR5.EffectSensorLock"),
      value: sensorLocked.system.value,
    })
  }

  return rollData
}