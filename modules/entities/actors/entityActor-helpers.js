import {
  SR5 
} from "../../config.js"
import {
  SR5_EntityHelpers 
} from "../helpers.js"
import {
  isStorable, isStoredAway 
} from "../../interface/storage-rules.js"
import {
  SR5Combat 
} from "../../system/srcombat.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5_CompendiumUtility 
} from "./utilityCompendium.js"
import {
  SR5_CombatHelpers 
} from "../../rolls/roll-helpers/combat.js"
import {
  SR5_CalledShotHelpers 
} from "../../rolls/roll-helpers/calledShot.js"
import {
  SR5_MarkHelpers 
} from "../../rolls/roll-helpers/mark.js"
import {
  SR5_PrepareRollTest 
} from "../../rolls/roll-prepare.js"
import {
  SR5_SocketHandler 
} from "../../socket.js"
import {
  _getSRStatusEffect
} from "../../system/effectsList.js"
import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"
import {
  isAreaSpellTemplateGone
} from "../../system/areaEffectScene.js"

export class SR5_ActorHelper {
    
  //Apply Damage to actor
  static async takeDamage(actorId, options) {
    let realActor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let damage = options.damage.value,
      damageType = options.damage.type,
      // Read prepared data: monitor maxima, limits and armor are computed, not stored in the source
      actor = realActor.toObject(false),
      actorData = actor.system,
      gelAmmo = 0,
      damageReduction = 0,
      realDamage,
      isDead = false

    if (options.combat.ammo.effects?.gelDamageReduction) gelAmmo = options.combat.ammo.effects.gelDamageReduction
    else if (options.combat.ammo.type === "gel") gelAmmo = -2
    if (actorData.specialProperties?.damageReduction) damageReduction = actorData.specialProperties.damageReduction.value
    if (damage > 1) damage -= damageReduction

    // Single condition monitor on a PC or spirit sheet: AI core (Data Trails p. 161), homunculus, watcher
    let singleMonitor = (actor.type === "actorPc" || actor.type === "actorSpirit") && realActor.system.conditionMonitors.condition && !realActor.system.conditionMonitors.physical

    switch (actor.type){
      case "actorPc":
      case "actorSpirit":
        if (singleMonitor) {
          // Matrix damage has no Physical or Stun letter: it fills the condition monitor as is
          const isMatrixDamage = options.damage.matrix.value > 0
          if (isMatrixDamage) damage = options.damage.matrix.value
          actorData.conditionMonitors.condition.actual.base += damage
          SR5_EntityHelpers.updateValue(actorData.conditionMonitors.condition.actual, 0)
          const unit = isMatrixDamage ? "" : game.i18n.localize(SR5.damageTypesShort[damageType] ?? "")
          ui.notifications.info(`${realActor.name}${game.i18n.localize("SR5.Colons")} ${damage}${unit} ${game.i18n.localize("SR5.Applied")}.`)
          break
        }
        if (options.damage.matrix.value > 0) {
          damage = options.damage.matrix.value
          damageType = "stun"
        }
        if (damageType === "stun") {
          actorData.conditionMonitors.stun.actual.base += damage
          SR5_EntityHelpers.updateValue(actorData.conditionMonitors[damageType].actual, 0)
          if (actorData.conditionMonitors.stun.actual.value > actorData.conditionMonitors.stun.value){
            realDamage = damage - (actorData.conditionMonitors.stun.actual.value - actorData.conditionMonitors.stun.value)
          } else realDamage = damage        
        } else if (damageType === "physical") {
          actorData.conditionMonitors.physical.actual.base += damage
          SR5_EntityHelpers.updateValue(actorData.conditionMonitors[damageType].actual, 0)
          if (actorData.conditionMonitors.physical.actual.value > actorData.conditionMonitors.physical.value) {
            realDamage = damage - (actorData.conditionMonitors.physical.actual.value - actorData.conditionMonitors.physical.value)
          } else realDamage = damage 
        }
        if (realDamage > 0) ui.notifications.info(`${realActor.name}${game.i18n.localize("SR5.Colons")} ${realDamage}${game.i18n.localize(SR5.damageTypesShort[damageType])} ${game.i18n.localize("SR5.Applied")}.`)
        if (damageType === "physical" && realDamage > 0) SR5_ActorHelper.addAggravatedWounds(realActor, actorData.conditionMonitors.physical, realDamage, options)

        {
          const overflow = SR5_ActorHelper.carryMonitorOverflow(actorData.conditionMonitors, actor.type)
          if (overflow.carriedDamage > 0) ui.notifications.info(`${realActor.name}${game.i18n.localize("SR5.Colons")} ${overflow.carriedDamage}${game.i18n.localize(SR5.damageTypesShort.physical)} ${game.i18n.localize("SR5.Applied")}.`)
          isDead = overflow.isDead
        }
        break
      case "actorGrunt":
        actorData.conditionMonitors.condition.actual.base += damage
        SR5_EntityHelpers.updateValue(actorData.conditionMonitors.condition.actual, 0)
        ui.notifications.info(`${realActor.name}${game.i18n.localize("SR5.Colons")} ${damage}${game.i18n.localize(SR5.damageTypesShort[damageType])} ${game.i18n.localize("SR5.Applied")}.`)
        if (damageType === "physical" && damage > 0) SR5_ActorHelper.addAggravatedWounds(realActor, actorData.conditionMonitors.condition, damage, options)
        break
      case "actorDrone":
        if (damageType === "physical") {
          actorData.conditionMonitors.condition.actual.base += damage
          SR5_EntityHelpers.updateValue(actorData.conditionMonitors.condition.actual, 0)
          ui.notifications.info(`${realActor.name}${game.i18n.localize("SR5.Colons")} ${damage}${game.i18n.localize(SR5.damageTypesShort[damageType])} ${game.i18n.localize("SR5.Applied")}.`)
          if (actorData.controlMode === "rigging"){
            let controler = SR5_EntityHelpers.getRealActorFromID(actorData.vehicleOwner.id)
            let chatData = SR5_PrepareRollTest.getBaseRollData(null, controler)
            chatData.damage.resistanceType = "biofeedback"
            chatData.damage.value = Math.ceil(damage/2)
            chatData.owner.messageId = options.owner.messageId
            controler.rollTest("resistanceCard", null, chatData)
          }
        }
        // Drones short out (matrix damage); vehicles take the damage without side effect (SR5 p. 173)
        if (options.damage.element === "electricity" && actorData.type !== "vehicle") options.damage.matrix.value = Math.floor(options.damage.value / 2)
        if (options.damage.matrix.value > 0) {
          actorData.conditionMonitors.matrix.actual.base += options.damage.matrix.value
          SR5_EntityHelpers.updateValue(actorData.conditionMonitors.matrix.actual, 0)
          ui.notifications.info(`${realActor.name}${game.i18n.localize("SR5.Colons")} ${options.damage.matrix.value} ${game.i18n.localize("SR5.AppliedMatrixDamage")}.`)
        }
        break
      case "actorAgent":
      case "actorSprite":
      case "actorDevice":
        if (options.damage.matrix.value > 0) {
          actorData.conditionMonitors.matrix.actual.base += options.damage.matrix.value
          SR5_EntityHelpers.updateValue(actorData.conditionMonitors.matrix.actual, 0)
          ui.notifications.info(`${realActor.name}${game.i18n.localize("SR5.Colons")} ${options.damage.matrix.value} ${game.i18n.localize("SR5.AppliedMatrixDamage")}.`)
        }
        break
    }

    // Only write the damage taken, so computed values never end up frozen in the source
    let monitorUpdates = {
    }
    for (let [key, monitor] of Object.entries(actorData.conditionMonitors)) {
      // Boxes beyond the monitor are not kept: they would eat the next healing (SR5 p. 171, 381)
      if (monitor?.actual) monitorUpdates[`system.conditionMonitors.${key}.actual.base`] = Math.min(monitor.actual.base, monitor.value ?? monitor.actual.base)
    }
    await realActor.update(monitorUpdates)

    //Status
    switch (actor.type){
      case "actorPc":
      case "actorSpirit":
        if (singleMonitor) {
          // A full core monitor dissipates the AI (Data Trails p. 161)
          if (actorData.conditionMonitors.condition.actual.value >= realActor.system.conditionMonitors.condition.value) await SR5_ActorHelper.createDeadEffect(actorId)
          break
        }
        if (actorData.conditionMonitors.physical.actual.value >= actorData.conditionMonitors.physical.value) {
          // SR5 p. 172: a full physical monitor knocks the character out; death needs an overflow greater than Body
          if (isDead || actor.type === "actorSpirit") await SR5_ActorHelper.createDeadEffect(actorId)
          else await SR5_ActorHelper.createKoEffect(actorId)
        } else if (actorData.conditionMonitors.stun.actual.value >= actorData.conditionMonitors.stun.value) {
          // SR5 p. 305: a spirit is dissipated when either of its monitors is full, Stun included
          if (actor.type === "actorSpirit") await SR5_ActorHelper.createDeadEffect(actorId)
          else await SR5_ActorHelper.createKoEffect(actorId)
        }
        else if (SR5_ActorHelper.knocksDown(damage, actorData.limits.physicalLimit.value, gelAmmo, options.damage.isAttack) &&
                  actorData.conditionMonitors.stun.actual.value < actorData.conditionMonitors.stun.value &&
                  actorData.conditionMonitors.physical.actual.value < actorData.conditionMonitors.physical.value) await SR5_ActorHelper.createProneEffect(actorId, damage, gelAmmo)
        break
      case "actorGrunt":
        // SR5 p. 381: a full monitor puts the grunt out of the fight; it dies only from a final Physical attack above its Body
        if (actorData.conditionMonitors.condition.actual.value >= actorData.conditionMonitors.condition.value) {
          if (SR5_ActorHelper.killsGrunt(damage, damageType, actorData.attributes.body.augmented.value)) await SR5_ActorHelper.createDeadEffect(actorId)
          else await SR5_ActorHelper.createKoEffect(actorId)
        }
        else if (SR5_ActorHelper.knocksDown(damage, actorData.limits.physicalLimit.value, gelAmmo, options.damage.isAttack)){ await SR5_ActorHelper.createProneEffect(actorId, damage, gelAmmo)}
        break
      case "actorDrone":
        if (actorData.conditionMonitors.condition.actual.value >= actorData.conditionMonitors.condition.value) await SR5_ActorHelper.createDeadEffect(actorId)
        break
      case "actorSprite":
      case "actorDevice":
        if (actorData.conditionMonitors.matrix.actual.value >= actorData.conditionMonitors.matrix.value) await SR5_ActorHelper.createDeadEffect(actorId)
        break
    }

    //Special Element Damage
    // A drone's side effect from electricity is the matrix damage above (SR5 p. 173), not the dice and Initiative penalty
    if (options.damage.element === "electricity" && actor.type !== "actorDrone") await SR5_ActorHelper.electricityDamageEffect(actorId)
    if (options.damage.element === "anticoagulant" && actor.type !== "actorDrone") await SR5_ActorHelper.anticoagulantDamageEffect(actorId)
    if (options.damage.element === "acid") await SR5_ActorHelper.acidDamageEffect(actorId, damage, options.damage.source)
    if (options.damage.element === "fire"){
      if (actorData.itemsProperties.armor.value <= 0) await SR5_ActorHelper.fireDamageEffect(actorId)
      else await SR5_ActorHelper.checkIfCatchFire(actorId, options.threshold.value, options.damage.source, options.combat.armorPenetration)
    }
  }

  /**
   * Carry damage beyond a full monitor, on prepared Stun/Physical monitors updated in place.
   * SR5 p. 171: half (rounded down) of the excess Stun goes to Physical; p. 172: excess Physical
   * fills a PC's overflow, and the character dies when it exceeds their Body.
   * @return {{carriedDamage: number, isDead: boolean}} Physical boxes carried from Stun, and death
   */
  static carryMonitorOverflow(monitors, actorType) {
    let carriedDamage = 0, isDead = false
    if (monitors.stun.actual.value > monitors.stun.value) {
      carriedDamage = Math.floor((monitors.stun.actual.value - monitors.stun.value) / 2)
      monitors.physical.actual.base += carriedDamage
      SR5_EntityHelpers.updateValue(monitors.physical.actual, 0)
      monitors.stun.actual.base = monitors.stun.value
      SR5_EntityHelpers.updateValue(monitors.stun.actual, 0)
    }

    if ((monitors.physical.actual.value > monitors.physical.value) && actorType === "actorPc") {
      monitors.overflow.actual.base += monitors.physical.actual.value - monitors.physical.value
      SR5_EntityHelpers.updateValue(monitors.overflow.actual, 0)
      monitors.physical.actual.base = monitors.physical.value
      SR5_EntityHelpers.updateValue(monitors.physical.actual, 0)
      if (monitors.overflow.actual.value > monitors.overflow.value){
        isDead = true
        monitors.overflow.actual.base = monitors.overflow.value
        SR5_EntityHelpers.updateValue(monitors.overflow.actual, 0)
      }
    }
    return {
      carriedDamage, isDead
    }
  }

  static async _socketTakeDamage(message){
    await SR5_ActorHelper.takeDamage(message.data.actorId, message.data.options)
  }

  //Handle prone effect
  static async createProneEffect(actorId, damage, gelAmmo, duration, source){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId),
      actorData = actor.system
            
    for (let e of actor.effects){
      if (e.statuses.has("prone")) return
    }

    //Currently, if duration is null, prone is comming from Damage
    if (!duration){
      duration = {
        type: "special",
        duration: 0,
      }
      source = "damage"
    }

    let effect = {
      name: `${game.i18n.localize("SR5.STATUSES_Prone")}`,
      type: "itemEffect",
      "system.type": "prone",
      "system.source": source,
      "system.target": game.i18n.localize("SR5.Special"),
      "system.value": 0,
      "system.durationType": duration.type,
      "system.duration": duration.duration,
      "system.statuses": ["prone"]
    }

    let statusEffect = await _getSRStatusEffect("prone")
    await actor.createEmbeddedDocuments('ActiveEffect', [statusEffect])
    await actor.createEmbeddedDocuments("Item", [effect])
    if (damage >= 10) ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DamageDropProneTen", {
      damage: damage
    })}`)
    else if (gelAmmo < 0) ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DamageDropProneGel", {
      damage: damage, limit: actorData.limits.physicalLimit.value
    })}`)
    else if (damage > 0) ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DamageDropProne", {
      damage: damage, limit: actorData.limits.physicalLimit.value
    })}`)
    else ui.notifications.info(`${actor.name} ${game.i18n.format("SR5.INFO_DropProne")}`)
  }

  //A player may not write on the actor that dies (an AI dissipated by matrix damage it was dealt): the GM does it
  //The GM checks the request first: only an AI whose device has a full matrix monitor (Data Trails p. 161)
  static async _socketCreateDeadEffect(message){
    let actor = SR5_EntityHelpers.getRealActorFromID(message.data.actorId)
    if (actor?.system.activeSpecialAttribute !== "depth") return
    let device = message.data.itemUuid ? await fromUuid(message.data.itemUuid) : null
    if (!device || device.actor?.id !== actor.id) return
    //The update of the device was sent just before: give it a moment to land
    const isFull = () => {
      let monitor = device.system.conditionMonitors?.matrix
      return !!monitor && monitor.value > 0 && monitor.actual.base >= monitor.value
    }
    for (let i = 0; i < 20 && !isFull(); i++) await new Promise(r => setTimeout(r, 100))
    if (!isFull()) return
    await SR5_ActorHelper.createDeadEffect(message.data.actorId)
  }

  //Handle death effect
  static async createDeadEffect(actorId){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    for (let e of actor.effects){
      if (e.statuses.has("dead")) return
    }
    let effect = await _getSRStatusEffect("dead")
    await actor.createEmbeddedDocuments('ActiveEffect', [effect])
    ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.INFO_DamageActorDead")}`)
    await SR5_ActorHelper.dropSpoilsOnDeath(actor)
  }

  /**
   * Leave a bag on the body holding part of what the dead was carrying, each
   * piece taken or left at random. No rule asks for this, so a table opts in.
   */
  static async dropSpoilsOnDeath(actor){
    if (!game.user?.isGM) return
    if (!game.settings.get("sr5", "sr5StorageDropOnDeath")) return
    const share = Number(game.settings.get("sr5", "sr5StorageDropOnDeathShare")) || 0
    if (share <= 0) return

    const carried = actor.items.filter(i => isStorable(i, null) && !isStoredAway(i, actor))
    const spoils = carried.filter(() => Math.random() * 100 < share)
    if (!spoils.length) return

    const bag = {
      name: game.i18n.format("SR5.StorageSpoilsOf", {
        actor: actor.name 
      }),
      type: "actorStorage",
      img: "systems/sr5/assets/img/actors/actorStorage.svg",
      "system.type": "cache",
      "prototypeToken.width": 0.5,
      "prototypeToken.height": 0.5,
      "prototypeToken.movementAction": "displace",
      items: spoils.map(i => i.toObject(false)),
    }
    const [dropped] = await Actor.createDocuments([foundry.utils.expandObject(bag)])
    await actor.deleteEmbeddedDocuments("Item", spoils.map(i => i.id))
    await SR5_ActorHelper.dropStorageAtOwnerFeet(dropped, actor)
    ui.notifications.info(game.i18n.format("SR5.StorageSpoilsDropped", {
      actor: actor.name, count: spoils.length 
    }))
  }

  //Handle ko effect
  static async createKoEffect(actorId){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    for (let e of actor.effects){
      if (e.statuses.has("unconscious")) return
    }
    let effect = await _getSRStatusEffect("unconscious")
    await actor.createEmbeddedDocuments('ActiveEffect', [effect])
    ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.INFO_DamageActorKo")}`)
  }

  /**
   * SR5 p. 381: the grunt is dead when the attack that took it out was Physical and "plus importants"
   * than its Body, alive when it was Stun or Physical "inférieure" to its Body. The book says nothing
   * of damage equal to Body: read here as alive, like the overflow rule (p. 172) that needs more than Body.
   */
  static killsGrunt(damage, damageType, body){
    return damageType === "physical" && damage > body
  }

  /**
   * SR5 p. 195: a character is knocked down when a single attack deals, after the resistance test, more boxes
   * than their Physical limit (lowered by gel rounds), or 10 boxes or more. Damage that does not come from an
   * attack (drug crash, drain, fading, toxin, fall, burning, acid, dumpshock...) never knocks down.
   */
  static knocksDown(damage, physicalLimit, gelAmmo, isAttack){
    if (!isAttack) return false
    return damage > (physicalLimit + gelAmmo) || damage >= 10
  }

  /**
   * Wake up a character knocked out by damage once no monitor is full any more (SR5 p. 171: a full monitor
   * knocks out). Only the effect laid by createKoEffect is removed, never one the GM set by hand, and death
   * is never undone by healing (p. 209).
   */
  static async clearDamageKnockout(actor){
    if (actor.effects.some(e => e.statuses.has("dead"))) return
    let monitors = actor.system.conditionMonitors
    let knockoutMonitors = monitors.physical ? ["physical", "stun"] : ["condition"]
    if (knockoutMonitors.some(key => monitors[key] && monitors[key].actual.value >= monitors[key].value)) return
    let knockouts = actor.effects.filter(e => e.origin === "unconscious" && e.statuses.has("unconscious")).map(e => e.id)
    if (!knockouts.length) return
    await actor.deleteEmbeddedDocuments('ActiveEffect', knockouts)
  }

  //Handle Elemental Damage : Electricity
  static async electricityDamageEffect(actorId){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let existingEffect = actor.items.find((item) => item.type === "itemEffect" && item.system.type === "electricityDamage")

    if (existingEffect){
      let updatedEffect = existingEffect.toObject(false)
      updatedEffect.system.duration += 1
      await actor.updateEmbeddedDocuments("Item", [updatedEffect])
      ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${existingEffect.name} ${game.i18n.localize("SR5.INFO_DurationExtendOneRound")}.`)
    } else {
      let effect = {
        name: `${game.i18n.localize("SR5.ElementalDamage")} (${game.i18n.localize("SR5.ElementalDamageElectricity")})`,
        type: "itemEffect",
        "system.type": "electricityDamage",
        "system.target": game.i18n.localize("SR5.GlobalPenalty"),
        "system.value": -1,
        "system.durationType": "round",
        "system.duration": 1,
        "system.gameEffect": game.i18n.localize("SR5.ElementalDamageElectricity_GE"),
        "system.customEffects": {
          "0": {
            "category": "penaltyTypes",
            "target": "system.penalties.special.actual",
            "type": "value",
            "value": -1,
            "forceAdd": true,
          }
        }
      }
      ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${effect.name} ${game.i18n.localize("SR5.Applied")}.`)
      await SR5Combat.changeInitInCombatHelper(actorId, -5)
      await actor.createEmbeddedDocuments("Item", [effect])

      let statusEffect = await _getSRStatusEffect("electricityDamage")
      await actor.createEmbeddedDocuments('ActiveEffect', [statusEffect])
    }
  }

  //Handle dumpshock disorientation (SR5 p. 231): -2 dice to every action for (10 - Willpower) minutes
  static async dumpshockEffect(actorId){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let duration = Math.max(1, 10 - (actor.system.attributes?.willpower?.augmented?.value || 0))
    let existingEffect = actor.items.find((item) => item.type === "itemEffect" && item.system.type === "dumpshock")

    if (existingEffect){
      if (existingEffect.system.duration < duration) await existingEffect.update({
        "system.duration": duration
      })
      return
    }

    let effect = {
      name: game.i18n.localize("SR5.Dumpshock"),
      type: "itemEffect",
      "system.type": "dumpshock",
      "system.target": game.i18n.localize("SR5.GlobalPenalty"),
      "system.value": -2,
      "system.durationType": "minute",
      "system.duration": duration,
      "system.customEffects": {
        "0": {
          "category": "penaltyTypes",
          "target": "system.penalties.special.actual",
          "type": "value",
          "value": -2,
          "forceAdd": true,
        }
      }
    }
    await actor.createEmbeddedDocuments("Item", [effect])
    ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${effect.name} ${game.i18n.localize("SR5.Applied")}.`)
  }

  //Handle suppressive fire zone (SR5 p. 181): -hits dice to every action other than defending, until the end of the combat turn
  static async suppressiveFireEffect(actorId, hits){
    if (!(hits > 0)) return
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let existingEffect = actor.items.find((item) => item.type === "itemEffect" && item.system.type === "suppressiveFire")
    if (existingEffect && existingEffect.system.value <= -hits) return
    if (existingEffect) await actor.deleteEmbeddedDocuments("Item", [existingEffect.id])

    let effect = {
      name: game.i18n.localize("SR5.WeaponModeSF"),
      type: "itemEffect",
      "system.type": "suppressiveFire",
      "system.target": game.i18n.localize("SR5.GlobalPenalty"),
      "system.value": -hits,
      "system.durationType": "round",
      "system.duration": 1,
      "system.customEffects": {
        "0": {
          "category": "penaltyTypes",
          "target": "system.penalties.special.actual",
          "type": "value",
          "value": -hits,
          "forceAdd": true,
        }
      }
    }
    await actor.createEmbeddedDocuments("Item", [effect])
    ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${effect.name} (${-hits}) ${game.i18n.localize("SR5.Applied")}.`)
  }

  //Handle Special Damage : Anticoagulant
  static async anticoagulantDamageEffect(actorId){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let existingEffect = actor.items.find((item) => item.type === "itemEffect" && item.system.type === "anticoagulantDamage")

    if (existingEffect) return 

    let effect = {
      name: `${game.i18n.localize("SR5.Anticoagulant")}`,
      type: "itemEffect",
      "system.type": "anticoagulantDamage",
      "system.target": game.i18n.localize("SR5.ConditionMonitorStunShort"),
      "system.value": -2,
      "system.durationType": "minute",
      "system.duration": 1,
      "system.gameEffect": game.i18n.localize("SR5.Anticoagulant_GE")
    }

    ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${effect.name} ${game.i18n.localize("SR5.Applied")}.`)
    await SR5Combat.changeInitInCombatHelper(actorId, -5)
    await actor.createEmbeddedDocuments("Item", [effect])

    let statusEffect = await _getSRStatusEffect("anticoagulantDamage")
    await actor.createEmbeddedDocuments('ActiveEffect', [statusEffect])
  }

  //Handle Elemental Damage : Acid
  static async acidDamageEffect(actorId, damage, source){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let existingEffect = actor.items.find((item) => item.type === "itemEffect" && item.system.type === "acidDamage")
    if (existingEffect) return

    let armor = actor.items.find((item) => item.type === "itemArmor" && item.system.isActive && !item.system.isAccessory)
    if (armor){
      let updatedArmor = armor.toObject(false)
      let armorEffect = {
        "name": `${game.i18n.localize("SR5.ElementalDamage")} (${game.i18n.localize("SR5.ElementalDamageAcid")})`,
        "target": "system.armorValue",
        "wifi": false,
        "type": "value",
        "value": -1,
        "multiplier": 1
      }
      updatedArmor.system.itemEffects.push(armorEffect)
      await actor.updateEmbeddedDocuments("Item", [updatedArmor])
      ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_AcidReduceArmor", {
        armor: armor.name
      })}`)
    }

    let duration
    if (source === "spell") duration = 1
    else duration = damage
    let effect = {
      name: `${game.i18n.localize("SR5.ElementalDamage")} (${game.i18n.localize("SR5.ElementalDamageAcid")})`,
      type: "itemEffect",
      "system.type": "acidDamage",
      "system.target": `${game.i18n.localize("SR5.Armor")}, ${game.i18n.localize("SR5.Damage")}`,
      "system.value": damage,
      "system.durationType": "round",
      "system.duration": duration,
    }
		
    ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${effect.name} ${game.i18n.localize("SR5.Applied")}.`)
    await SR5Combat.changeInitInCombatHelper(actorId, -5)
    await actor.createEmbeddedDocuments("Item", [effect])

    let statusEffect = await _getSRStatusEffect("acidDamage")
    await actor.createEmbeddedDocuments('ActiveEffect', [statusEffect])
  }

  //Handle Elemental Damage : Fire
  static async fireDamageEffect(actorId){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let existingEffect = actor.items.find((item) => item.type === "itemEffect" && item.system.type === "fireDamage")
    if (existingEffect) return

    let effect = {
      name: `${game.i18n.localize("SR5.ElementalDamage")} (${game.i18n.localize("SR5.ElementalDamageFire")})`,
      type: "itemEffect",
      "system.type": "fireDamage",
      "system.target": game.i18n.localize("SR5.PenaltyValuePhysical"),
      "system.value": 3,
      "system.durationType": "special",
      "system.duration": 0,
    }
    ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${effect.name} ${game.i18n.localize("SR5.Applied")}.`)
    await actor.createEmbeddedDocuments("Item", [effect])

    let statusEffect = await _getSRStatusEffect("fireDamage")
    await actor.createEmbeddedDocuments('ActiveEffect', [statusEffect])
  }

  //Check if an actor catch fire
  static async checkIfCatchFire (actorId, firethreshold, source, force){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let ap = (source === "spell") ? force : -6
    let fireType = (source === "spell") ? "fireMagical" : "fire"
        
    let rollInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
    rollInfo.threshold.type = fireType
    rollInfo.combat.armorPenetration = ap
    rollInfo.threshold.value = firethreshold

    actor.rollTest("resistFire", null, rollInfo)
  }

  //Raise owerwatch score
  static async overwatchIncrease(defenseHits, actorId) {
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let actorData = foundry.utils.duplicate(actor.system)

    //A negative value can lower the score (Emulate swapped for the hits, Data Trails p. 159), never below 0, where it
    //starts and where a reboot brings it back (SR5 p. 244): the direct call and the GM side of the socket both end here
    actorData.matrix.overwatchScore = Math.max(0, (actorData.matrix.overwatchScore || 0) + defenseHits)
    actor.update({
      system: actorData
    })
    ui.notifications.info(`${actor.name}, ${game.i18n.localize("SR5.OverwatchScoreActual")} ${actorData.matrix.overwatchScore}`)
  }

  //Socket for increasing overwatch score;
  static async _socketOverwatchIncrease(message) {
    await SR5_ActorHelper.overwatchIncrease(message.data.defenseHits, message.data.actorId)
  }

  //Delete Marks on Other actors
  static async deleteMarksOnActor(actorData, actorId){
    for (let m of actorData.matrix.markedItems){
      let itemToClean = await fromUuid(m.uuid)
      //The persona of an AI outside any device carries its marks itself (Data Trails p. 157)
      if (itemToClean?.documentName === "Actor") {
        await itemToClean.update({
          "system.matrix.marks": (itemToClean._source.system.matrix.marks ?? []).filter(mark => mark.ownerId !== actorId)
        }, {
          sr5PersonaMarks: true
        })
      } else if (itemToClean) {
        let cleanData = foundry.utils.duplicate(itemToClean.system)
        for (let i = 0; i < cleanData.marks.length; i++){
          if (cleanData.marks[i].ownerId === actorId) {
            cleanData.marks.splice(i, 1)
            i--
          }
        }
        await itemToClean.update({
          "system" : cleanData
        })
        //For Host, keep slaved device marks synchro
        if (itemToClean.parent.system.matrix.deviceType === "host") SR5_MarkHelpers.markSlavedDevice(itemToClean.parent.id)
      } else {
        SR5_SystemHelpers.srLog(1, `No Item to Clean in deleteMarksOnActor()`)
      }
    }
  }

  //Socket for deletings marks on other actors;
  static async _socketDeleteMarksOnActor(message) {
    await SR5_ActorHelper.deleteMarksOnActor(message.data.actorData, message.data.actorId)
  }

  //Delete Mark info from deck
  //exact: item is a whole uuid, matched as is. A persona's uuid begins the uuid of its own devices, so a
  //partial match would also forget the marks placed on them
  static async deleteMarkInfo(actorId, item, exact = false){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    if (!actor) return SR5_SystemHelpers.srLog(1, `No Actor in deleteMarkInfo()`)

    let deck = actor.items.find(d => d.type === "itemDevice" && d.system.isActive)
    //The marker has no deck any more: no trace of the mark is left to remove
    if (!deck) return
    let deckData = foundry.utils.duplicate(deck.system),
      index=0

    if (exact) deckData.markedItems = deckData.markedItems.filter(m => m.uuid !== item)
    else for (let m of deckData.markedItems){
      if (m.uuid.includes(item)){
        deckData.markedItems.splice(index, 1)
        index--
      }
      index++
    }

    await deck.update({
      "system": deckData
    })

    //For host, update all unlinked token with same marked items
    if (actor.system.matrix.deviceType === "host" && canvas.scene){
      for (let token of canvas.tokens.placeables){
        if (token.actor.id === actorId) {
          let tokenDeck = token.actor.items.find(i => i.type === "itemDevice" && i.system.isActive)
          let tokenDeckData = foundry.utils.duplicate(tokenDeck.system)
          tokenDeckData.markedItems = deckData.markedItems
          await tokenDeck.update({
            "system": tokenDeckData
          })
        }
      }
    }
  }

  //Socket for deletings marks info other actors;
  static async _socketDeleteMarkInfo(message) {
    await SR5_ActorHelper.deleteMarkInfo(message.data.actorId, message.data.item, message.data.exact)
  }

  //Create a Sidekick
  static async createSidekick(item, userId, actorId){
    let permissionPath, petType, img,
      itemData = item.system,
      ownerActor = SR5_EntityHelpers.getRealActorFromID(actorId)

    if (item.type === "itemSpirit") petType = "actorSpirit"
    else if (item.type === "itemVehicle") petType = "actorDrone"
    else if (item.type === "itemSprite") petType = "actorSprite"
    else if (item.type === "itemProgram") petType = "actorAgent"
    else if (item.type === "itemContact") petType = "actorGrunt"
    else if (item.type === "itemStorage") petType = "actorStorage"

    if (item.img === `systems/sr5/assets/img/items/${item.type}.svg`) img = `systems/sr5/assets/img/actors/${petType}.svg`
    else img = item.img

    // Handle base data for Actor Creation
    let sideKickData = {
      "name": item.name,
      "type": petType,
      "img": img,
      // The token picture picked on the item, or the portrait when left empty
      "prototypeToken.texture.src": itemData.tokenImg || img,
    }

    // Give permission to player
    if (userId) {
      permissionPath = 'ownership.' + userId
      sideKickData = foundry.utils.mergeObject(sideKickData, {
        [permissionPath]: 3
      })
    }

    // Handle specific data for Actor creation
    if (item.type === "itemSpirit") {
      let baseItems = await SR5_CompendiumUtility.getBaseItems("actorSpirit", itemData.type, itemData.itemRating)
      baseItems = await SR5_CompendiumUtility.addOptionalSpiritPowersFromItem(baseItems, itemData.optionalPowers)

      for (let power of baseItems){
        if (power.system.systemEffects.length){
          for (let syseffect of power.system.systemEffects){
            if (syseffect.value === "noxiousBreath" && power.type === "itemPower"){
              let newWeapon = await SR5_CompendiumUtility.getWeaponFromCompendium("noxiousBreath")
              if (newWeapon) baseItems.push(newWeapon)
            }
            if (syseffect.value === "corrosiveSpit" && power.type === "itemPower"){
              let newWeapon = await SR5_CompendiumUtility.getWeaponFromCompendium("corrosiveSpit", itemData.itemRating)
              if (newWeapon) baseItems.push(newWeapon)
            }
          }
        }
      }

      sideKickData = foundry.utils.mergeObject(sideKickData, {
        "system.sideKickPrototypeToken": itemData.sideKickPrototypeToken,
        "system.type": itemData.type,
        "system.force.base": itemData.itemRating,
        "system.isBounded": itemData.isBounded,
        "system.services.value": itemData.services.value,
        "system.services.max": itemData.services.max,
        "system.summonerMagic": itemData.summonerMagic,
        "system.creatorId": actorId,
        "system.creatorItemId": item._id,
        "system.magic.tradition": itemData.magic.tradition,
        "system.conditionMonitors.physical.actual": itemData.conditionMonitors.physical.actual,
        "system.conditionMonitors.stun.actual": itemData.conditionMonitors.stun.actual,
        "items": baseItems,
      })
      // A single-monitor spirit's damage is kept in the item's Physical monitor (see dismissal)
      if (SR5_SpiritTypes.hasSingleMonitor(itemData.type)) sideKickData = foundry.utils.mergeObject(sideKickData, {
        "system.conditionMonitors.condition.actual": itemData.conditionMonitors.physical.actual,
      })
    }

    if (item.type === "itemSprite") {
      let baseItems = await SR5_CompendiumUtility.getBaseItems("actorSprite", itemData.type, itemData.itemRating)
      baseItems = await SR5_CompendiumUtility.addOptionalSpritePowersFromItem(baseItems, itemData.optionalPowers)
			
      for (let deck of itemData.decks) {
        deck.system.marks = []
        baseItems.push(deck)
      }

      sideKickData = foundry.utils.mergeObject(sideKickData, {
        "system.sideKickPrototypeToken": itemData.sideKickPrototypeToken,
        "system.type": itemData.type,
        "system.level": itemData.itemRating,
        "system.isRegistered": itemData.isRegistered,
        "system.tasks.value": itemData.tasks.value,
        "system.tasks.max": itemData.tasks.max,
        "system.compilerResonance": itemData.compilerResonance,
        "system.creatorId": actorId,
        "system.creatorItemId": item._id,
        "system.conditionMonitors.matrix.actual": itemData.conditionMonitors.matrix.actual,
        "items": baseItems,
      })
    }

    if (item.type === "itemContact") {	
      let baseItems = await SR5_CompendiumUtility.getBaseItems("actorGrunt", itemData.type)
      for (let language of itemData.language) baseItems.push(language)
      for (let knowledge of itemData.knowledge) baseItems.push(knowledge)
      for (let weapon of itemData.weapons) baseItems.push(weapon)
      for (let ammunitions of itemData.ammunitions) baseItems.push(ammunitions)
      for (let armor of itemData.armors) baseItems.push(armor)
      for (let decks of itemData.decks) baseItems.push(decks)
      for (let vehicles of itemData.vehicles) baseItems.push(vehicles)

      sideKickData = foundry.utils.mergeObject(sideKickData, {
        "system.sideKickPrototypeToken": itemData.sideKickPrototypeToken,
        "system.biography.description": itemData.description,
        "system.biography.background": itemData.gameEffect,
        "system.biography.metatype": itemData.metatype,
        "system.biography.gender": itemData.gender,
        "system.biography.age": itemData.age,
        "system.biography.nickname": itemData.nickname,
        "system.biography.metatypeVariant": itemData.metatypeVariant,
        "system.biography.ethnicalGroup": itemData.ethnicalGroup,
        "system.biography.nationality": itemData.nationality,
        "system.biography.paymentMethod": itemData.paymentMethod,
        "system.biography.hobby": itemData.hobby,
        "system.biography.familySituation": itemData.familySituation,
        "system.sheetPreferences": itemData.sheetPreferences,
        "system.skills": itemData.skills,
        "system.skillGroups": itemData.skillGroups,
        "system.attributes": itemData.attributes,
        "system.specialAttributes.edge.natural.base": itemData.connection,
        "system.conditionMonitors": itemData.conditionMonitors,
        "system.creatorId": actorId,
        "system.creatorItemId": item._id,
        "items": baseItems,
      })
    }

    if (item.type === "itemProgram") {
      let baseItems = []
      let ownerDeck = ownerActor.items.find(i => i.type === "itemDevice" && i.system.isActive)
      if(!ownerDeck) return
      for (let deck of itemData.decks) {
        deck.system.marks = []
        baseItems.push(deck)
      }

      let creatorData = SR5_EntityHelpers.getRealActorFromID(actorId)
      creatorData = creatorData.toObject(false)
      sideKickData = foundry.utils.mergeObject(sideKickData, {
        "system.creatorId": actorId,
        "system.creatorItemId": item._id,
        "system.creatorData": creatorData,
        "system.conditionMonitors.matrix": ownerDeck.system.conditionMonitors.matrix,
        "system.rating": itemData.itemRating,
        "items": baseItems,
      })
    }

    if (item.type === "itemVehicle") {
      let baseItems = []
      for (let autosoft of itemData.autosoft) baseItems.push(autosoft)
      for (let ammo of itemData.ammunitions) baseItems.push(ammo)
      for (let weapon of itemData.weapons) baseItems.push(weapon)
      for (let armor of itemData.armors) baseItems.push(armor)
      for (let vehicleMod of itemData.vehiclesMod) baseItems.push(vehicleMod)
      for (let deck of itemData.decks) {
        deck.system.marks = []
        baseItems.push(deck)
      }
      let ownerActorObject = ownerActor.toObject(false)

      sideKickData = foundry.utils.mergeObject(sideKickData, {
        "system.sideKickPrototypeToken": itemData.sideKickPrototypeToken,
        "system.creatorId": actorId,
        "system.creatorItemId": item._id,
        "system.type": itemData.type,
        "system.model": itemData.model,
        "system.attributes.handling.natural.base": itemData.attributes.handling,
        "system.attributes.handlingOffRoad.natural.base": itemData.attributes.handlingOffRoad,
        "system.attributes.secondaryPropulsionHandling.natural.base": itemData.secondaryPropulsion.handling,
        "system.attributes.secondaryPropulsionHandlingOffRoad.natural.base": itemData.secondaryPropulsion.handlingOffRoad,
        "system.attributes.speed.natural.base": itemData.attributes.speed,
        "system.attributes.speedOffRoad.natural.base": itemData.attributes.speedOffRoad,
        "system.attributes.secondaryPropulsionSpeed.natural.base": itemData.secondaryPropulsion.speed,
        "system.attributes.acceleration.natural.base": itemData.attributes.acceleration,
        "system.attributes.accelerationOffRoad.natural.base": itemData.attributes.accelerationOffRoad,
        "system.attributes.secondaryPropulsionAcceleration.natural.base": itemData.secondaryPropulsion.acceleration,
        "system.attributes.body.natural.base": itemData.attributes.body,
        "system.attributes.armor.natural.base": itemData.attributes.armor,
        "system.attributes.pilot.natural.base": itemData.attributes.pilot,
        "system.attributes.sensor.natural.base": itemData.attributes.sensor,
        "system.attributes.seating.natural.base": itemData.seating,
        "system.modificationSlots.powerTrain.base": itemData.modificationSlots.powerTrain,
        "system.modificationSlots.protection.base": itemData.modificationSlots.protection,
        "system.modificationSlots.weapons.base": itemData.modificationSlots.weapons,
        "system.modificationSlots.extraWeapons": itemData.modificationSlots.extraWeapons,
        "system.modificationSlots.extraBody": itemData.modificationSlots.extraBody,
        "system.modificationSlots.body.base": itemData.modificationSlots.body,
        "system.modificationSlots.electromagnetic.base": itemData.modificationSlots.electromagnetic,
        "system.modificationSlots.cosmetic.base": itemData.modificationSlots.cosmetic,
        "system.conditionMonitors.condition.actual": itemData.conditionMonitors.condition.actual,
        "system.conditionMonitors.matrix.actual": itemData.conditionMonitors.matrix.actual,
        "system.isSecondaryPropulsion": itemData.secondaryPropulsion.isSecondaryPropulsion,
        "system.secondaryPropulsionType": itemData.secondaryPropulsion.type,
        "system.pilotSkill": itemData.pilotSkill,
        "system.riggerInterface": itemData.riggerInterface,
        "system.offRoadMode": itemData.offRoadMode,
        "system.price": itemData.price.base,
        "system.slaved": itemData.slaved,
        "system.wirelessTurnedOn": itemData.wirelessTurnedOn,
        "system.isSlavedToPan": itemData.isSlavedToPan,
        "system.panMaster": itemData.panMaster,
        "system.vehicleOwner.id": actorId,
        "system.vehicleOwner.name": ownerActor.name,
        "system.vehicleOwner.system": ownerActorObject.system,
        "system.vehicleOwner.items": ownerActorObject.items,
        "system.controlMode": itemData.controlMode,
        "items": baseItems,
      })
    }

    // A storage put down carries what was inside it: the gear leaves the
    // character and goes with the pack, so whoever finds it finds the lot.
    let storedItems = []
    if (item.type === "itemStorage") {
      storedItems = ownerActor.items.filter(i => i.system?.storedIn === item._id)
      sideKickData = foundry.utils.mergeObject(sideKickData, {
        "system.type": itemData.type,
        "system.capacity.value": itemData.capacity.value,
        "system.biography.description": itemData.description,
        "system.creatorId": actorId,
        "system.creatorItemId": item._id,
        // Its lock goes with it: a safe put down is still shut
        "system.lock": foundry.utils.duplicate(itemData.lock ?? {
        }),
        // A bag on the floor takes half a square, not a whole one, and it is
        // pushed about rather than walking anywhere
        "prototypeToken.width": 0.5,
        "prototypeToken.height": 0.5,
        "prototypeToken.movementAction": "displace",
        // Their source, not their prepared data: the character's preparation
        // holds what is stored away inactive (an armour at the stash protects
        // nobody), and that must not become what the item is
        "items": storedItems.map(i => i.toObject()),
      })
    }

    let originalItem = ownerActor.getEmbeddedDocument("Item", item._id)
    if (item.type !== "itemStorage") {
      await originalItem.update({
        "system.isCreated": true
      })
    }

    //Create actor
    const created = await Actor.createDocuments([sideKickData])

    if (item.type === "itemStorage") {
      const dropped = created[0]
      await originalItem.update({
        "system.isDeployed": true,
        "system.deployedActorId": dropped?.id ?? "",
      })
      if (storedItems.length) {
        await ownerActor.deleteEmbeddedDocuments("Item", storedItems.map(i => i.id))
      }
      await SR5_ActorHelper.dropStorageAtOwnerFeet(dropped, ownerActor)
    }
  }

  /**
   * Put the storage down where the character stands, rather than leaving it
   * in the sidebar for someone to drag out: a pack is dropped in the moment.
   */
  static async dropStorageAtOwnerFeet(dropped, ownerActor) {
    if (!dropped || !canvas?.scene) return
    const ownerToken = canvas.tokens?.placeables.find(t => t.actor?.id === ownerActor.id)
    if (!ownerToken) return
    const tokenData = await dropped.getTokenDocument({
      x: ownerToken.document.x + canvas.grid.size,
      y: ownerToken.document.y,
    })
    await canvas.scene.createEmbeddedDocuments("Token", [tokenData.toObject()])
  }

  //Socket for creating sidekick;
  static async _socketCreateSidekick(message) {
    await SR5_ActorHelper.createSidekick(message.data.item, message.data.userId, message.data.actorId)
  }

  //The id a sidekick keeps as system.creatorId: the token's for an unlinked actor, as _OnSidekickCreate sets it
  static sidekickCreatorId(actor){
    return actor.isToken ? actor.token.id : actor.id
  }

  //A sidekick belongs to one item of one actor: a duplicated actor carries the same item ids
  static findSidekick(actors, creatorId, itemId){
    return actors?.find(a => a.system.creatorItemId === itemId && a.system.creatorId === creatorId)
  }

  //A deployed drone shows on its owner's gear row: draw that sheet again once the drone exists, on every client
  static redrawCreatorSheet(actor){
    if (actor.type !== "actorDrone" || !actor.system.creatorId) return
    const owner = SR5_EntityHelpers.getRealActorFromID(actor.system.creatorId)
    if (owner?.sheet?.rendered) owner.sheet.render()
  }

  /**
   * While a vehicle is deployed, its drone actor holds the wireless switch:
   * the gear row shows that state, read-only (N83). The row is read-only as
   * soon as the item says it is deployed, even before the drone actor exists,
   * so a click in between is never silently lost.
   */
  static markDeployedVehicles(vehicles, actors, creatorId){
    for (const vehicle of vehicles) {
      if (!vehicle.system?.isCreated) continue
      const drone = SR5_ActorHelper.findSidekick(actors, creatorId, vehicle._id)
      vehicle.deployedWireless = {
        on: (drone && drone.type === "actorDrone") ? drone.system.wirelessTurnedOn : vehicle.system.wirelessTurnedOn
      }
    }
  }

  /**
   * A vehicle's wireless switch: its deployed drone holds it (N83), the item otherwise (N91).
   * @param {Object} vehicle - the vehicle item
   * @param {Array} actors - the actors to look the deployed drone up in
   * @return {Boolean} true if the vehicle's wireless is on
   */
  static vehicleWirelessOn(vehicle, actors){
    if (vehicle.system?.isCreated) {
      const drone = actors?.find(a => a.type === "actorDrone" && a.system.creatorItemId === (vehicle._id ?? vehicle.id))
      if (drone) return drone.system.wirelessTurnedOn !== false
    }
    return !!vehicle.system?.wirelessTurnedOn
  }

  /**
   * Switching a drone's wireless from its sheet: the drone spends the action, its owner commands it (N91).
   * Free through the owner's DNI (SR5 p. 165), simple otherwise (p. 167), when the world setting asks for it.
   * @param {Boolean} requiresDNI - the "wireless requires a DNI" world setting
   * @param {Object} owner - the drone's creator, if found
   * @return {String} the action type
   */
  static droneWirelessActionType(requiresDNI, owner, turningOn = true){
    return SR5_ActorHelper.wirelessSwitchActionType(turningOn, requiresDNI, owner?.system?.hasDNI)
  }

  /**
   * The action a device's wireless switch costs. Turning it off is always a free action (SR5 p. 424).
   * Turning it on is free through a DNI (p. 165), simple otherwise (p. 167), when the world setting asks for it
   * @param {Boolean} turningOn - true when the wireless is switched on
   * @param {Boolean} requiresDNI - the "wireless requires a DNI" world setting
   * @param {Boolean} hasDNI - whether the one switching it has a DNI
   * @return {String} the action type
   */
  static wirelessSwitchActionType(turningOn, requiresDNI, hasDNI){
    if (!turningOn) return "free"
    return (!requiresDNI || hasDNI) ? "free" : "simple"
  }

  /**
   * Keep the token a dismissed actor was wearing, so the next summoning looks
   * like the last one. dimissSidekick() is handed a plain object rather than a
   * document, so nothing here may lean on toObject().
   */
  static rememberSidekickToken(modifiedItem, actor){
    const proto = actor.prototypeToken
    if (!proto) return
    modifiedItem.system.sideKickPrototypeToken = (typeof proto.toObject === "function") ? proto.toObject() : foundry.utils.duplicate(proto)
    modifiedItem.system.tokenImg = proto.texture?.src || ""
  }

  /**
   * What a storage put down holds, as it lies on the map.
   *
   * Storages used to be put down as unlinked tokens: what was taken out
   * through the token left the token only, and the actor in the sidebar still
   * holds the lot. Such a bag is read from its token, the current scene's
   * first, so picking it up gives back only what is still in it. A linked
   * token is the actor itself.
   *
   * @param {object} actor  the storage, as a document or a plain object
   * @returns {Array}
   */
  static storageContentsOnMap(actor){
    const actorId = actor._id ?? actor.id
    const scenes = [canvas?.scene, ...(game.scenes ?? [])].filter(Boolean)
    for (const scene of scenes) {
      const token = scene.tokens?.find(t => t.actorId === actorId && !t.actorLink && t.actor)
      if (token) return [...token.actor.items]
    }
    return [...(actor.items ?? [])]
  }

  //Dismiss sidekick : update his parent item and then delete actor
  static async dimissSidekick(actor){
    let ownerActor = SR5_EntityHelpers.getRealActorFromID(actor.system.creatorId)
    let item = ownerActor.getEmbeddedDocument("Item", actor.system.creatorItemId)
    let modifiedItem = foundry.utils.duplicate(item)

    if (actor.type === "actorSpirit"){			
      let powers = []
      for (let a of actor.items){
        if (a.type === "itemPower") powers.push(a)
      }
      modifiedItem.img = actor.img
      SR5_ActorHelper.rememberSidekickToken(modifiedItem, actor)
      modifiedItem.system.services.value = actor.system.services.value
      modifiedItem.system.services.max = actor.system.services.max
      if (SR5_SpiritTypes.hasSingleMonitor(actor.system.type)){
        modifiedItem.system.conditionMonitors.physical.actual = actor.system.conditionMonitors.condition.actual
        modifiedItem.system.conditionMonitors.stun.actual = actor.system.conditionMonitors.condition.actual
      } else {
        modifiedItem.system.conditionMonitors.physical.actual = actor.system.conditionMonitors.physical.actual
        modifiedItem.system.conditionMonitors.stun.actual = actor.system.conditionMonitors.stun.actual
      }
      modifiedItem.system.isBounded = actor.system.isBounded
      modifiedItem.system.isCreated = false
      modifiedItem.system.powers = powers 
      if (actor.img != "systems/sr5/assets/img/actors/actorSpirit.svg" && modifiedItem.system.gameEffect.includes(actor.img) === false) {
        if (modifiedItem.system.gameEffect.includes("SR-BioItemPortrait")) {
          modifiedItem.system.gameEffect = modifiedItem.system.gameEffect.replace(/url.*.\)/, "url(" + actor.img + ")")
        }
        else {					
          modifiedItem.system.gameEffect += "<div class='SR-BioItemPortrait' style='background-image: url(" + actor.img + ");'></div>"
        }
      }
    }

    if (actor.type === "actorSprite"){
      let decks = [], spritePowers = []
      for (let a of actor.items){
        if (a.type === "itemDevice") decks.push(a)				
        if (a.type === "itemSpritePower") spritePowers.push(a)
      }
      modifiedItem.img = actor.img
      SR5_ActorHelper.rememberSidekickToken(modifiedItem, actor)
      modifiedItem.system.decks = decks
      modifiedItem.system.spritePowers = spritePowers
      modifiedItem.system.tasks.value = actor.system.tasks.value
      modifiedItem.system.tasks.max = actor.system.tasks.max
      modifiedItem.system.conditionMonitors.matrix.actual = actor.system.conditionMonitors.matrix.actual
      modifiedItem.system.isRegistered = actor.system.isRegistered
      modifiedItem.system.isCreated = false
      if (actor.img != "systems/sr5/assets/img/actors/actorSprite.svg" && modifiedItem.system.gameEffect.includes(actor.img) === false) {
        if (modifiedItem.system.gameEffect.includes("SR-BioItemPortrait")) {
          modifiedItem.system.gameEffect = modifiedItem.system.gameEffect.replace(/url.*.\)/, "url(" + actor.img + ")")
        }
        else {					
          modifiedItem.system.gameEffect += "<div class='SR-BioItemPortrait' style='background-image: url(" + actor.img + ");'></div>"
        }
      }
    }

    if (actor.type === "actorAgent"){
      let decks = []
      for (let a of actor.items){
        if (a.type === "itemDevice") decks.push(a)
      }
      modifiedItem.img = actor.img
      SR5_ActorHelper.rememberSidekickToken(modifiedItem, actor)
      modifiedItem.system.decks = decks
      if (actor.img != "systems/sr5/assets/img/actors/actorAgent.svg" && modifiedItem.system.gameEffect.includes(actor.img) === false) {
        if (modifiedItem.system.gameEffect.includes("SR-BioItemPortrait")) {
          modifiedItem.system.gameEffect = modifiedItem.system.gameEffect.replace(/url.*.\)/, "url(" + actor.img + ")")
        }
        else {					
          modifiedItem.system.gameEffect += "<div class='SR-BioItemPortrait' style='background-image: url(" + actor.img + ");'></div>"
        }
      }
    }

    if (actor.type === "actorGrunt"){
      let language = [],
        knowledge = [],
        weapons = [],
        ammunitions = [],
        armors = [],
        decks = [],
        vehicles = []
      for (let a of actor.items){
        if (a.type === "itemLanguage") language.push(a)
        if (a.type === "itemKnowledge") knowledge.push(a)
        if (a.type === "itemWeapon") weapons.push(a)
        if (a.type === "itemAmmunition") ammunitions.push(a)
        if (a.type === "itemArmor") armors.push(a)
        if (a.type === "itemDevice") decks.push(a)
        if (a.type === "itemVehicle") vehicles.push(a)
      }
      modifiedItem.name = actor.name
      modifiedItem.img = actor.img	
      SR5_ActorHelper.rememberSidekickToken(modifiedItem, actor)
      modifiedItem.system.language = language,	
      modifiedItem.system.knowledge = knowledge,	
      modifiedItem.system.weapons = weapons,	
      modifiedItem.system.ammunitions = ammunitions,	
      modifiedItem.system.armors = armors,	
      modifiedItem.system.decks = decks,
      modifiedItem.system.vehicles = vehicles,
      modifiedItem.system.gender = actor.system.biography.gender,
      modifiedItem.system.age = actor.system.biography.age,
      modifiedItem.system.nickname = actor.system.biography.nickname,
      modifiedItem.system.metatypeVariant = actor.system.biography.metatypeVariant,
      modifiedItem.system.ethnicalGroup = actor.system.biography.ethnicalGroup,
      modifiedItem.system.nationality = actor.system.biography.nationality,
      modifiedItem.system.paymentMethod = actor.system.biography.paymentMethod,
      modifiedItem.system.hobby = actor.system.biography.hobby,
      modifiedItem.system.familySituation = actor.system.biography.familySituation,
      modifiedItem.system.sheetPreferences = actor.system.sheetPreferences,
      modifiedItem.system.skills = actor.system.skills,
      modifiedItem.system.skillGroups = actor.system.skillGroups,
      modifiedItem.system.attributes = actor.system.attributes,
      modifiedItem.system.description = actor.system.biography.description,
      modifiedItem.system.gameEffect = actor.system.biography.background,	
      modifiedItem.system.conditionMonitors = actor.system.conditionMonitors,
      modifiedItem.system.isCreated = false
      if (actor.img != "systems/sr5/assets/img/actors/actorGrunt.svg" && modifiedItem.system.gameEffect.includes(actor.img) === false) {
        if (modifiedItem.system.gameEffect.includes("SR-BioItemPortrait")) {
          modifiedItem.system.gameEffect = modifiedItem.system.gameEffect.replace(/url.*.\)/, "url(" + actor.img + ")")
        }
        else {					
          modifiedItem.system.gameEffect += "<div class='SR-BioItemPortrait' style='background-image: url(" + actor.img + ");'></div>"
        }
      }
    }

    if (actor.type === "actorDrone"){
      let autosoft = [],
        weapons = [],
        ammunitions = [],
        armors = [],
        decks = [],
        vehiclesMod = []
      for (let a of actor.items){
        if (a.type === "itemProgram") autosoft.push(a)
        if (a.type === "itemWeapon") weapons.push(a)
        if (a.type === "itemAmmunition") ammunitions.push(a)
        if (a.type === "itemArmor") armors.push(a)
        if (a.type === "itemDevice") decks.push(a)
        if (a.type === "itemVehicleMod") vehiclesMod.push(a)
      }
      modifiedItem.img = actor.img
      SR5_ActorHelper.rememberSidekickToken(modifiedItem, actor)
      modifiedItem.system.autosoft = autosoft
      modifiedItem.system.weapons = weapons
      modifiedItem.system.ammunitions = ammunitions
      modifiedItem.system.armors = armors
      modifiedItem.system.decks = decks
      modifiedItem.system.vehiclesMod = vehiclesMod
      modifiedItem.system.model = actor.system.model
      modifiedItem.system.slaved = actor.system.slaved
      //A drone deployed before the field existed carries null: the item keeps its own switch
      if (typeof actor.system.wirelessTurnedOn === "boolean") modifiedItem.system.wirelessTurnedOn = actor.system.wirelessTurnedOn
      modifiedItem.system.controlMode = actor.system.controlMode
      modifiedItem.system.riggerInterface = actor.system.riggerInterface
      modifiedItem.system.offRoadMode = actor.system.offRoadMode 
      modifiedItem.system.attributes.handling = actor.system.attributes.handling.natural.base
      modifiedItem.system.attributes.handlingOffRoad = actor.system.attributes.handlingOffRoad.natural.base
      modifiedItem.system.secondaryPropulsion.handling = actor.system.attributes.secondaryPropulsionHandling.natural.base
      modifiedItem.system.secondaryPropulsion.handlingOffRoad = actor.system.attributes.secondaryPropulsionHandlingOffRoad.natural.base
      modifiedItem.system.attributes.speed = actor.system.attributes.speed.natural.base
      modifiedItem.system.attributes.speedOffRoad = actor.system.attributes.speedOffRoad.natural.base
      modifiedItem.system.secondaryPropulsion.speed = actor.system.attributes.secondaryPropulsionSpeed.natural.base
      modifiedItem.system.attributes.acceleration = actor.system.attributes.acceleration.natural.base
      modifiedItem.system.attributes.accelerationOffRoad = actor.system.attributes.accelerationOffRoad.natural.base
      modifiedItem.system.secondaryPropulsion.acceleration = actor.system.attributes.secondaryPropulsionAcceleration.natural.base
      modifiedItem.system.attributes.body = actor.system.attributes.body.natural.base
      modifiedItem.system.attributes.armor = actor.system.attributes.armor.natural.base
      modifiedItem.system.attributes.pilot = actor.system.attributes.pilot.natural.base
      modifiedItem.system.attributes.sensor = actor.system.attributes.sensor.natural.base
      modifiedItem.system.seating = actor.system.attributes.seating.natural.base
      modifiedItem.system.modificationSlots.powerTrain = actor.system.modificationSlots.powerTrain.base
      modifiedItem.system.modificationSlots.protection = actor.system.modificationSlots.protection.base
      modifiedItem.system.modificationSlots.weapons = actor.system.modificationSlots.weapons.base
      modifiedItem.system.modificationSlots.extraWeapons = actor.system.modificationSlots.extraWeapons
      modifiedItem.system.modificationSlots.extraBody = actor.system.modificationSlots.extraBody
      modifiedItem.system.modificationSlots.body = actor.system.modificationSlots.body.base
      modifiedItem.system.modificationSlots.electromagnetic = actor.system.modificationSlots.electromagnetic.base
      modifiedItem.system.modificationSlots.cosmetic = actor.system.modificationSlots.cosmetic.base
      modifiedItem.system.conditionMonitors.condition.actual = actor.system.conditionMonitors.condition.actual
      modifiedItem.system.conditionMonitors.matrix.actual = actor.system.conditionMonitors.matrix.actual
      modifiedItem.system.secondaryPropulsion.isSecondaryPropulsion = actor.system.isSecondaryPropulsion
      modifiedItem.system.secondaryPropulsion.type = actor.system.secondaryPropulsionType
      modifiedItem.system.isCreated = false
      modifiedItem.img = actor.img
      if (actor.img != "systems/sr5/assets/img/actors/actorDrone.svg" && modifiedItem.system.gameEffect.includes(actor.img) === false) {
        if (modifiedItem.system.gameEffect.includes("SR-BioItemPortrait")) {
          modifiedItem.system.gameEffect = modifiedItem.system.gameEffect.replace(/url.*.\)/, "url(" + actor.img + ")")
        }
        else {					
          modifiedItem.system.gameEffect += "<div class='SR-BioItemPortrait' style='background-image: url(" + actor.img + ");'></div>"
        }
      }
    }

    if (actor.type === "actorStorage"){
      modifiedItem.system.isDeployed = false
      modifiedItem.system.deployedActorId = ""
      // Picked open or shut again on the map, it comes back as it was left
      if (actor.system.lock) modifiedItem.system.lock = foundry.utils.duplicate(actor.system.lock)
      SR5_ActorHelper.rememberSidekickToken(modifiedItem, actor)
      // Whatever is in it comes back to the character, still stored in it
      const contents = SR5_ActorHelper.storageContentsOnMap(actor).map(i => {
        const data = typeof i.toObject === "function" ? i.toObject(false) : foundry.utils.duplicate(i)
        data.system.storedIn = actor.system.creatorItemId
        return data
      })
      if (contents.length) await ownerActor.createEmbeddedDocuments("Item", contents)
    }

    // Delete the sidekick actor and its tokens before the item update propagates
    if (canvas.scene){
      for (let token of canvas.tokens.placeables) {
        if (token.document.actorId === actor._id) await token.document.delete()
      }
    }
    await Actor.deleteDocuments([actor._id])

    // Update the parent item after the actor is gone to avoid update-on-deleted-actor errors
    if (item) await item.update(modifiedItem)
  }

  //Socket to dismiss sidekick;
  static async _socketDismissSidekick(message) {
    await SR5_ActorHelper.dimissSidekick(message.data.actor)
  }

  //Add item to actor's PAN
  static async addItemtoPan(targetItem, actorId){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId),
      deck = actor.items.find(d => d.type === "itemDevice" && d.system.isActive),
      item = await fromUuid(targetItem),
      itemToAdd = item.toObject(false)

    itemToAdd.system.isSlavedToPan = true
    itemToAdd.system.panMaster = actorId
    await item.update({
      "system": itemToAdd.system
    })

    let currentPan = foundry.utils.duplicate(deck.system.pan)
    let panObject = {
      "name": item.name,
      "uuid": targetItem,
    }
    currentPan.content.push(panObject)
    await deck.update({
      "system.pan": currentPan
    })
  }

  static async _socketAddItemToPan(message){
    await SR5_ActorHelper.addItemtoPan(message.data.targetItem, message.data.actorId)
  }

  //Delete item from actor's PAN
  static async deleteItemFromPan(targetItem, actorId, index){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId),
      deck = actor.items.find(d => d.type === "itemDevice" && d.system.isActive),
      item = await fromUuid(targetItem)

    if (!deck) return

    if (item) {
      let newItem = foundry.utils.duplicate(item.system)
      newItem.isSlavedToPan = false
      newItem.panMaster = ""
      await item.update({
        "system": newItem
      })
    }

    let currentPan = foundry.utils.duplicate(deck.system.pan)
    if (index){
      currentPan.content.splice(index, 1)
    } else {
      index = 0
      let isExisting
      for (let p of currentPan.content){
        isExisting = await fromUuid(p.uuid)
        if (!isExisting){
          currentPan.content.splice(index, 1)
          index--
        }
        index++
      }
    }

    await deck.update({
      "system.pan": currentPan
    })
  }

  static async _socketDeleteItemFromPan(message){
    await SR5_ActorHelper.deleteItemFromPan(message.data.targetItem, message.data.actorId, message.data.index)
  }

  //Update the source Item of an external Effect
  static async linkEffectToSource(actorId, targetItem, effectUuid){
    let item = await fromUuid(targetItem),
      newItem = foundry.utils.duplicate(item.system)

    if (newItem.duration === "sustained") newItem.isActive = true
    if (item.type === "itemAdeptPower" || item.type === "itemPower") newItem.isActive = true
    newItem.targetOfEffect.push(effectUuid)
    await item.update({
      "system": newItem
    })
  }

  static async _socketLinkEffectToSource(message){
    await SR5_ActorHelper.linkEffectToSource(message.data.actorId, message.data.targetItem, message.data.effectUuid)
  }

  static async deleteSustainedEffect(targetItem){
    let item = await fromUuid(targetItem)
    if (item) await item.parent.deleteEmbeddedDocuments("Item", [item.id])
    else SR5_SystemHelpers.srLog(2, `No item to delete in deleteSustainedEffect()`)
  }

  static async _socketDeleteSustainedEffect(message){
    await SR5_ActorHelper.deleteSustainedEffect(message.data.targetItem)
  }

  //Delete an effect on an item when parent's ItemEffect is deleted
  static async deleteItemEffectFromItem(actorId, parentItemEffect){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId),
      index, dataToUpdate

    for (let i of actor.items){
      let needUpdate = false
      if (i.system.itemEffects?.length){
        dataToUpdate = foundry.utils.duplicate(i.system)
        index = 0
        for (let e of dataToUpdate.itemEffects){
          if (e.ownerItem === parentItemEffect){
            dataToUpdate.itemEffects.splice(index, 1)
            needUpdate = true
            index--
          }
          index++
        }
        if (needUpdate) await i.update({
          "system": dataToUpdate
        })
      }
    }
  }

  //Delete an itemEffect when the activeEffect is deleted
  static async deleteItemEffectLinkedToActiveEffect(actorId, itemId){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    await actor.deleteEmbeddedDocuments("Item", [itemId])
  }

  //Keep Agent condition Monitor synchro with Owner deck
  static async keepAgentMonitorSynchro(agent){
    if(!agent.system.creatorData) return SR5_SystemHelpers.srLog(1, `No CreatorData for Agent in keepAgentMonitorSynchro()`)
    if(!canvas.scene) return
		
    let owner = SR5_EntityHelpers.getRealActorFromID(agent.system.creatorId)
    if (!owner) return SR5_SystemHelpers.srLog(1, `No Owner in keepAgentMonitorSynchro()`)
    let ownerDeck = owner.items.find(i => i.type === "itemDevice" && i.system.isActive)
    if (!ownerDeck) return SR5_SystemHelpers.srLog(1, `No Owner Deck in keepAgentMonitorSynchro()`)
    if (ownerDeck.system.conditionMonitors.matrix.actual.value !== agent.system.conditionMonitors.matrix.actual.value){
      let updatedActor = foundry.utils.duplicate(agent.system)
      updatedActor.conditionMonitors.matrix = ownerDeck.system.conditionMonitors.matrix
      await agent.update({
        "system": updatedActor
      })
    }
  }

  //Keep Owner deck condition Monitor synchro with Agent
  static async keepDeckSynchroWithAgent(agent){
    let owner = SR5_EntityHelpers.getRealActorFromID(agent.system.creatorId)
    if (!owner) return SR5_SystemHelpers.srLog(1, `No Owner in keepDeckSynchroWithAgent()`)
    let ownerDeck = owner.items.find(i => i.type === "itemDevice" && i.system.isActive)
    if (!ownerDeck) return SR5_SystemHelpers.srLog(1, `No Owner Deck in keepDeckSynchroWithAgent()`)
    if (ownerDeck.system.conditionMonitors.matrix.actual.value !== agent.system.conditionMonitors.matrix.actual.value){
      let newDeck = foundry.utils.duplicate(ownerDeck.system)
      newDeck.conditionMonitors.matrix = agent.system.conditionMonitors.matrix
      await ownerDeck.update({
        "system": newDeck
      })
    }
  }

  //Keep grunt edge synchro across unlinked tokens
  static async keepEdgeSynchroWithGrunt(document){
    if(!canvas.scene) return
    for (let t of canvas.tokens.placeables.filter(t => t.isOwner)){
      if (t.document.actorId === document.id){
        let actor = SR5_EntityHelpers.getRealActorFromID(t.document.id)
        let updatedActor = foundry.utils.duplicate(actor.system)
        updatedActor.conditionMonitors.edge = document.system.conditionMonitors.edge
        actor.update({
          "system": updatedActor
        })
      }
    }
  }

  // SR5 p. 207: Physical damage does not heal naturally while the character has Stun damage, Stun heals first.
  // Natural recovery only: first aid (p. 206), Medicine (p. 208) and the Heal spell (p. 290) are not bound by this order
  static stunBlocksNaturalHealing(system, testType, damageType){
    return testType === "healing" && damageType === "physical" && (system?.conditionMonitors?.stun?.actual?.value || 0) > 0
  }

  //Manage Healing
  static async heal(targetActorID, data){
    let damageToRemove = data.roll.netHits,
      damageType = data.test.typeSub,
      targetActor = SR5_EntityHelpers.getRealActorFromID(targetActorID),
      actorData = foundry.utils.deepClone(targetActor)
    //The card may have been rolled before new Stun damage was taken
    if (SR5_ActorHelper.stunBlocksNaturalHealing(targetActor.system, data.test.type, damageType)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_StunHealsFirst"))
      return false
    }
				
    actorData = actorData.toObject(false)
    if (damageType === "physical" || damageType === "condition") SR5_ActorHelper.healMonitorBoxes(actorData.system.conditionMonitors[damageType], damageToRemove)
    else {
      actorData.system.conditionMonitors[damageType].actual.base -= damageToRemove
      await SR5_EntityHelpers.updateValue(actorData.system.conditionMonitors[damageType].actual, 0)
    }
    await targetActor.update({
      system: actorData.system
    })
    await SR5_ActorHelper.clearDamageKnockout(targetActor)
  }

  // Aggravated Wounds (Howling Shadows p. 213): each box of Physical damage dealt by the critter is marked
  // and counts as two boxes for healing only. Only boxes of the monitor itself are marked, never the overflow.
  static addAggravatedWounds(realActor, monitor, damage, options){
    if (!options.damage?.aggravated) return
    let marked = Math.min(damage, monitor.value - (monitor.aggravated || 0))
    if (marked <= 0) return
    monitor.aggravated = (monitor.aggravated || 0) + marked
    ui.notifications.info(game.i18n.format("SR5.INFO_AggravatedWoundsApplied", {
      actor: realActor.name, count: marked
    }))
  }

  // Remove boxes from a monitor, aggravated boxes first costing two hits each (Howling Shadows p. 213):
  // the first hit turns the aggravated box into a normal one, the second removes it. Returns the unused hits.
  static healMonitorBoxes(monitor, hits){
    let aggravated = Math.min(monitor.aggravated || 0, monitor.actual.value)
    let normal = Math.max(monitor.actual.value - aggravated, 0)
    let healed = Math.min(hits, normal)
    monitor.actual.base -= healed
    hits -= healed
    while (hits > 0 && aggravated > 0){
      aggravated -= 1
      hits -= 1
      if (hits > 0){
        monitor.actual.base -= 1
        hits -= 1
      }
    }
    monitor.aggravated = aggravated
    SR5_EntityHelpers.updateValue(monitor.actual, 0)
    return Math.max(hits, 0)
  }

  //Manage Healing by socket
  static async _socketHeal(message){
    await SR5_ActorHelper.heal(message.data.targetActor, message.data.healData)
  }

  //Manage Regeneration
  static async regenerate(actorId, data){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let damageToRemove = data.roll.netHits
    let actorData = foundry.utils.deepClone(actor)
    actorData = actorData.toObject(false)

    if (actorData.type === "actorGrunt"){
      if (actorData.system.conditionMonitors.condition.actual.value > 0){
        damageToRemove = SR5_ActorHelper.healMonitorBoxes(actorData.system.conditionMonitors.condition, damageToRemove)
      }
    } else {
      if (actorData.system.conditionMonitors.overflow.actual.value > 0){
        actorData.system.conditionMonitors.overflow.actual.base -= damageToRemove
        damageToRemove -= actorData.system.conditionMonitors.overflow.actual.value
        await SR5_EntityHelpers.updateValue(actorData.system.conditionMonitors.overflow.actual, 0)
      }
      if (actorData.system.conditionMonitors.physical.actual.value > 0 && damageToRemove > 0){
        damageToRemove = SR5_ActorHelper.healMonitorBoxes(actorData.system.conditionMonitors.physical, damageToRemove)
      }
      if (actorData.system.conditionMonitors.stun.actual.value > 0 && damageToRemove > 0){
        actorData.system.conditionMonitors.stun.actual.base -= damageToRemove
        damageToRemove -= actorData.system.conditionMonitors.stun.actual.value
        await SR5_EntityHelpers.updateValue(actorData.system.conditionMonitors.stun.actual, 0)
      }
    }

    await actor.update({
      system: actorData.system
    })
    await SR5_ActorHelper.clearDamageKnockout(actor)
  }

  //Apply an external effect to actor (such spell, complex form). Data is provided by chatMessage
  static async applyExternalEffect(actorId, data, effectType){
    //An area spell whose template was deleted during the resistance: nothing would lift the effect
    if (isAreaSpellTemplateGone(data)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_AreaSpellTemplateGone"))
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let item = await fromUuid(data.owner.itemUuid)
    let itemData = item.system
    // Head case Attribute Boost (Stolen Souls p. 201): lasts a number of combat turns equal to the hits,
    // then the head case takes as many boxes of Stun damage (applied when the effect expires, see SR5Combat.manageTurnEnd)
    let isNaniteBoost = Object.values(itemData.systemEffects || {
    }).some(s => s.value === "naniteAttributeBoost")
    let naniteBoostMarked = false

    for (let e of Object.values(itemData[effectType])){
      if (e.transfer) {
        let value, key, newData
        if (e.type === "hits") value = Math.floor(data.roll.hits * (e.multiplier || 1))
        else if (e.type === "netHits") value = Math.floor(data.roll.netHits * (e.multiplier || 1))
        else if (e.type === "value") value = Math.floor(e.value * (e.multiplier || 1))
        else if (e.type === "rating") value = Math.floor(item.system.itemRating * (e.multiplier || 1))
        //An area spell resisted totally gets its effect at 0 (test-ResistanceResult), only to mark the token as
        //having resisted inside the template: a fixed value or the resistor's hits must not apply the spell
        if (data.test?.type === "spellResistance" && data.roll.netHits <= 0) value = 0

        //Handle heal effect
        if (e.target.includes("removeDamage")){
          key = e.target.replace('.removeDamage','')
          newData = actor.system
          if(newData.conditionMonitors[key]){
            newData.conditionMonitors[key].actual.base -= value
            SR5_EntityHelpers.updateValue(newData.conditionMonitors[key].actual, 0)
            await actor.update({
              "system": newData
            })
            continue
          } else continue
        }

        //Handle non resisted damage
        if (e.target.includes("addDamage")){
          key = e.target.replace('.addDamage','')
          newData = actor.system
          if(newData.conditionMonitors[key]){
            newData.conditionMonitors[key].actual.base += value
            SR5_EntityHelpers.updateValue(newData.conditionMonitors[key].actual, 0)
            await actor.update({
              "system": newData
            })
            continue
          } else continue
        }

        let targetName = SR5_EntityHelpers.getLabelByKey(e.target)

        //Create the itemEffect
        let itemEffect = {
          name: item.name,
          type: "itemEffect",
          "system.target": targetName,
          "system.value": value,
          "system.type": item.type,
          "system.ownerID": data.owner.actorId,
          "system.ownerName": data.owner.speakerActor,
          "system.ownerItem": data.owner.itemUuid,
          "system.duration": 0,
          "system.durationType": "sustained",
        }

        if (isNaniteBoost) {
          itemEffect["system.duration"] = data.roll.hits
          itemEffect["system.durationType"] = "round"
          if (e.category === "characterAttributes" && !naniteBoostMarked) {
            itemEffect["system.type"] = "naniteAttributeBoost"
            naniteBoostMarked = true
          }
        }

        if (effectType === "customEffects"){
          itemEffect = foundry.utils.mergeObject(itemEffect, {
            "system.customEffects": {
              "0": {
                "category": e.category,
                "target": e.target,
                "type": "value",
                "value": value,
                "forceAdd": true,
                //Attribute Boost (SR5 p. 312): dice pools only, see limitAttributeValue()
                ...(e.poolOnly ? {
                  "poolOnly": true
                } : {
                }),
              }
            },
          })
        } else if (effectType === "itemEffects"){
          itemEffect = foundry.utils.mergeObject(itemEffect, {
            "system.hasEffectOnItem": true
          })
        }
        await actor.createEmbeddedDocuments("Item", [itemEffect])

        //Link Effect to source owner
        let effect
        if (actor.isToken) {
          for (let i of actor.token.actor.items){
            if (i.system.ownerItem === data.owner.itemUuid){
              if (!Object.keys(itemData.targetOfEffect).length) effect = i
              else for (let e of Object.values(itemData.targetOfEffect)) if (e !== data.owner.itemUuid) effect = i
            }
          }
        } else {
          for (let i of actor.items){
            if (i.system.ownerItem === data.owner.itemUuid){
              if (!Object.keys(itemData.targetOfEffect).length) effect = i
              else for (let e of Object.values(itemData.targetOfEffect)) if (e !== data.owner.itemUuid) effect = i
            }
          }
        }

        if (!game.user?.isGM) {
          SR5_SocketHandler.emitForGM("linkEffectToSource", {
            actorId: data.owner.actorId,
            targetItem: data.owner.itemUuid,
            effectUuid: effect.uuid,
          })
        } else {
          await SR5_ActorHelper.linkEffectToSource(data.owner.actorId, data.owner.itemUuid, effect.uuid)
        }

        //If effect is on Item, update it
        if (effectType === "itemEffects"){
          let itemToUpdate
          //Find the item
          if (data.test.typeSub === "redundancy"){
            if (actor.isToken) itemToUpdate = actor.token.actor.items.find(d => d.type === "itemDevice" && d.system.isActive)
            else itemToUpdate = actor.items.find(d => d.type === "itemDevice" && d.system.isActive)
          }
          //Add effect to Item
          if (itemToUpdate){
            let newItem = itemToUpdate.toObject(false)
            let effectItem ={
              "name": itemData.name,
              "target": e.target,
              "wifi": false,
              "type": "value",
              "value": value,
              "multiplier": 1,
              "ownerItem": data.owner.itemUuid,
            }
            newItem.system.itemEffects.push(effectItem)
            await actor.updateEmbeddedDocuments("Item", [newItem])
          }
        }
      }
    }
  }

  //Apply specific toxin effect
  static async applyToxinEffect(actorId, data){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId),
      effects, status, isStatusEffectOn,
      toxinEffects = [],
      statusEffects = []

    for (let [key, value] of Object.entries(data.damage.toxin.effect)){
      if (value) {
        effects = await SR5_CombatHelpers.getToxinEffect(key, data, actor)
        toxinEffects = toxinEffects.concat(effects)
        //Nausea Status Effect
        if (key === "nausea"){
          isStatusEffectOn = actor.effects.find(e => e.origin === "toxinEffectNausea")
          if (!isStatusEffectOn){
            status = await _getSRStatusEffect("toxinEffectNausea")
            statusEffects = statusEffects.concat(status)
          }
          if (data.damage.value > actor.system.attributes.willpower.augmented.value){
            isStatusEffectOn = actor.effects.find(e => e.origin === "noAction") || statusEffects.find(s => s.origin === "noAction")
            if (!isStatusEffectOn){
              status = await _getSRStatusEffect("noAction")
              statusEffects = statusEffects.concat(status)
            }
          }
        }
        //Disorientation Status Effect
        if (key === "disorientation"){
          isStatusEffectOn = actor.effects.find(e => e.origin === "toxinEffectDisorientation")
          if (!isStatusEffectOn){
            status = await _getSRStatusEffect("toxinEffectDisorientation")
            statusEffects = statusEffects.concat(status)
          }
        }
        //Paralysis Status Effect
        if (key === "paralysis" && (data.damage.value > actor.system.attributes.reaction.augmented.value)){
          //Nausea may already have queued it in this same pass: one "cannot act" status, not two
          let isStatusEffectOn = actor.effects.find(e => e.origin === "noAction") || statusEffects.find(s => s.origin === "noAction")
          if (!isStatusEffectOn){
            status = await _getSRStatusEffect("noAction")
            statusEffects = statusEffects.concat(status)
          }
        }
        //Agony Status Effect
        if (key === "agony" && (data.damage.value > actor.system.attributes.willpower.augmented.value)){
          let isStatusEffectOn = actor.effects.find(e => e.origin === "toxinEffectAgony")
          if (!isStatusEffectOn){
            status = await _getSRStatusEffect("toxinEffectAgony")
            statusEffects = statusEffects.concat(status)
          }
        }
        //Arcane Inhibitor Status Effect
        if (key === "arcaneInhibitor"){					
          let isStatusEffectOn = actor.effects.find(e => e.origin === "toxinEffectArcaneInhibitor")
          if (!isStatusEffectOn){
            status = await _getSRStatusEffect("toxinEffectArcaneInhibitor")
            statusEffects = statusEffects.concat(status)
          }
        }
      }
    }

    if (toxinEffects.length) await actor.createEmbeddedDocuments("Item", toxinEffects)
    if (statusEffects.length) await actor.createEmbeddedDocuments("ActiveEffect", statusEffects)
    // A toxin's damage never knocks down (SR5 p. 195), even when a gas grenade delivered it
    if (data.damage.type && data.damage.value > 0) await actor.takeDamage({
      ...data, damage: {
        ...data.damage, isAttack: false
      }
    })
  }

  static async applyCalledShotsEffect(actorId, data){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId),
      effects, status, weakSideEffect,
      cSEffects = [],
      statusEffects = []

    if (typeof data.combat.calledShot.effects === "object") data.combat.calledShot.effects = Object.values(data.combat.calledShot.effects)

    for (let key of Object.values(data.combat.calledShot.effects)){
      //Special for stunned, skip
      if (key.name === "stunned") continue

      //special for called shot linked to weak side effect
      if (data.combat.calledShot.effects.find(e => e.name === "weakSide") && (data.combat.calledShot.effects.find(e => e.name === "oneArmBandit") || data.combat.calledShot.effects.find(e => e.name === "brokenGrip"))) {
        data.combat.calledShot.effects = data.combat.calledShot.effects.filter(e => e.name !== "weakSide")
        weakSideEffect = true
        if (key.name === "weakSide") continue
      }

      //Get the itemEffect
      effects = await SR5_CalledShotHelpers.getCalledShotsEffect(key, data, actor, weakSideEffect)

      //Skip for "prone" effect as it is already applied by getCalledShotsEffect()
      if (key.name === "buckled" || key.name === "knockdown") continue
      cSEffects = cSEffects.concat(effects)

      if (!actor.effects.find(e => e.origin === key.name)){
        status = await _getSRStatusEffect(key.name)
        statusEffects = statusEffects.concat(status)
        ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${status.label} ${game.i18n.localize("SR5.Applied")}.`)
      }
    }
	
    if (weakSideEffect){
      if (!actor.effects.find(e => e.origin === "weakSide") && (!statusEffects.find(s => s.origin === "weakSide")) ){
        status = await _getSRStatusEffect("weakSide")
        statusEffects = statusEffects.concat(status)
        ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${status.label} ${game.i18n.localize("SR5.Applied")}.`)
      }
    }

    if (cSEffects.length) await actor.createEmbeddedDocuments("Item", cSEffects)
    if (statusEffects.length) await actor.createEmbeddedDocuments("ActiveEffect", statusEffects)
  }
}
