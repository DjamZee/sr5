import {
  SR5
} from "../../config.js"
import {
  SR5_Toxins
} from "../items/toxins.js"
import {
  systemEffectWrite
} from "../../system/effect-editor.js"
import {
  relayNeedsConfirmation
} from "../../system/damage-relay.js"
import {
  hasAegis, absorbWithAegis, isActiveGM, aegisLedger, setAegisLedger
} from "../../system/aegis.js"
import {
  SR5_EntityHelpers 
} from "../helpers.js"
import {
  ownsTarget, bounded, consumedKey
} from "../../rolls/roll-helpers/socket-guard.js"
import {
  vouch
} from "../../rolls/roll-helpers/attack-card.js"
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
  extendTimedEffect
} from "../../system/effect-expiry.js"
import {
  calendarStartYear
} from "../../system/calendar.js"
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
  isReplaceEffectType
} from "./effect-replace.js"
import {
  readsRoll, effectCardVerdict, cardNetHits
} from "../../rolls/roll-helpers/effect-card.js"
import {
  entryValue, transferEntries, compareDefinitions, definitionsMatch, definitionPrint
} from "./effect-definition.js"
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
          const applied = isMatrixDamage ? ` ${game.i18n.localize("SR5.AppliedMatrixDamage")}` : `${game.i18n.localize(SR5.damageTypesShort[damageType] ?? "")} ${game.i18n.localize("SR5.Applied")}`
          ui.notifications.info(`${realActor.name}${game.i18n.localize("SR5.Colons")} ${damage}${applied}.`)
          break
        }
        if (options.damage.matrix.value > 0) {
          damage = options.damage.matrix.value
          damageType = "stun"
          //Aegis (Kill Code p. 112): the shield takes the boxes first; its ledger is the active GM's alone
          if (hasAegis(realActor)) {
            if (isActiveGM()) {
              const result = absorbWithAegis(aegisLedger(realActor), damage, game.time.worldTime)
              await setAegisLedger(realActor, result.ledger)
              //Said to the GM and whispered to the owners, who cannot read the GM's notifications
              if (result.absorbed > 0) {
                const text = game.i18n.format("SR5.INFO_AegisAbsorbed", {
                  name: realActor.name, absorbed: result.absorbed, left: 4 - result.ledger.damage
                })
                ui.notifications.info(text)
                const owners = game.users.filter(u => !u.isGM && realActor.testUserPermission(u, "OWNER")).map(u => u.id)
                if (owners.length) await ChatMessage.create({
                  content: foundry.utils.escapeHTML(text), whisper: owners
                })
              }
              damage = result.through
            } else ui.notifications.warn(game.i18n.localize("SR5.WARN_AegisNeedsActiveGM"))
          }
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
            //Worked out here for the rigger, not the card's actor: vouched for (attack-card.js, trustedResistanceCard)
            controler.rollTest("resistanceCard", null, vouch(chatData))
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
          // The overflow is only a hint for the GM's dissipation card (ai-dissipation.js), who confirms it
          if (actorData.conditionMonitors.condition.actual.value >= realActor.system.conditionMonitors.condition.value) await SR5_ActorHelper.createDeadEffect(actorId, {
            surplus: actorData.conditionMonitors.condition.actual.value - realActor.system.conditionMonitors.condition.value
          })
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

  // senderId comes from the server and cannot be forged. Damage relayed by the actor's owner (or a GM) is applied.
  // Some legitimate relays come from someone else: the defender who sends matrix damage back to the attacker
  // (defenderDoMatrixDamage), the healer whose critical glitch hurts the patient (SR5 p. 207). Those are never
  // applied on the sender's word: the GM confirms them first, and a refusal is whispered to the GM
  static async _socketTakeDamage(message, senderId){
    const actor = SR5_EntityHelpers.getRealActorFromID(message.data?.actorId)
    const sender = game.users.get(senderId)
    if (!actor || !sender) return
    //The button a player's browser left for the GM is spent once he writes the damage, never on a refusal (D5)
    const spend = async () => {
      const options = message.data.options ?? {
      }
      if (!options.relayButton) return
      const {
        spendRelayedButton
      } = await import("../../rolls/roll-helpers/matrix-card.js")
      await spendRelayedButton(options.owner?.messageId, options.relayButton)
    }
    if (!relayNeedsConfirmation(actor, sender)) {
      await SR5_ActorHelper.takeDamage(message.data.actorId, message.data.options)
      return spend()
    }
    const damage = message.data.options?.damage ?? {
    }
    const amount = Number(damage.matrix?.value) > 0 ? `${damage.matrix.value} ${game.i18n.localize("SR5.MatrixDamage")}` : `${Number(damage.value) || 0}${game.i18n.localize(SR5.damageTypesShort[damage.type] ?? "")}`
    const text = game.i18n.format("SR5.DamageRelayConfirm", {
      user: sender.name, actor: actor.name, amount
    })
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("SR5.DamageRelayTitle")
      }, content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
      yes: {
        label: game.i18n.localize("SR5.Yes")
      },
      no: {
        label: game.i18n.localize("SR5.No")
      },
    }).catch(() => false)
    if (ok) {
      await SR5_ActorHelper.takeDamage(message.data.actorId, message.data.options)
      return spend()
    }
    await ChatMessage.create({
      content: foundry.utils.escapeHTML(game.i18n.format("SR5.DamageRelayRefused", {
        user: sender.name, actor: actor.name, amount
      })), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
    })
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
    await SR5_ActorHelper.createDeadEffect(message.data.actorId, {
      //The overflow was worked out by the player's client: the GM's card says so
      surplus: message.data.surplus, itemUuid: message.data.itemUuid, fromPlayer: true
    })
  }

  //Handle death effect
  //aiDissipation: what the GM's dissipation card of an AI starts from (Data Trails p. 161), never applied as is
  static async createDeadEffect(actorId, aiDissipation){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    for (let e of actor.effects){
      if (e.statuses.has("dead")) return
    }
    let effect = await _getSRStatusEffect("dead")
    if (aiDissipation && actor.system.activeSpecialAttribute === "depth") effect.flags.sr5 = {
      aiDissipation: {
        surplus: Math.max(0, Math.trunc(Number(aiDissipation.surplus) || 0)), itemUuid: aiDissipation.itemUuid ?? null,
        fromPlayer: !game.user?.isGM || !!aiDissipation.fromPlayer
      }
    }
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
      //Only the duration, read from the source: the prepared item written back would put its computed values in the source
      await actor.updateEmbeddedDocuments("Item", [{
        _id: existingEffect.id, "system.duration": (Number(existingEffect.toObject().system.duration) || 0) + 1
      }])
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
      await SR5Combat.changeInitInCombatHelper(SR5Combat.fighterIdOf(actor), -5)
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
      //A new dumpshock restarts the count from now on the world clock, never shortening the one running
      await existingEffect.update(extendTimedEffect(existingEffect.system, duration, game.time.worldTime, calendarStartYear()))
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
    await SR5Combat.changeInitInCombatHelper(SR5Combat.fighterIdOf(actor), -5)
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
      //Only the effects, copied from the source: the prepared armor written back put its computed values (price,
      //availability, matrix monitor) in the source, with the effects other items had injected into it
      let itemEffects = SR5_ActorHelper.sourceItemEffects(armor)
      let armorEffect = {
        "name": `${game.i18n.localize("SR5.ElementalDamage")} (${game.i18n.localize("SR5.ElementalDamageAcid")})`,
        "target": "system.armorValue",
        "wifi": false,
        "type": "value",
        "value": -1,
        "multiplier": 1
      }
      itemEffects.push(armorEffect)
      await actor.updateEmbeddedDocuments("Item", [{
        _id: armor.id, "system.itemEffects": itemEffects
      }], systemEffectWrite())
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
    await SR5Combat.changeInitInCombatHelper(SR5Combat.fighterIdOf(actor), -5)
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

  //SR5 p. 231: leaving the Matrix in VR without switching cleanly to AR first deals dumpshock (6S in cold sim,
  //6P in hot sim), link lock or not: jack out, reboot, brick, convergence, any forced stop. Nothing once in AR.
  //DjamZ's ruling, 2026-10-06: "ce sont les débranchements d'urgence qui provoquent le choc". An AI (Depth active,
  //Data Trails p. 152) has no dumpshock, it is dissipated instead (decided by DjamZ, 04/10)
  //bricked: the deck threw the character out by bricking, Willpower alone resists (SR5 p. 231)
  static dumpshockIfInVR(actor, {
    bricked = false
  } = {
  }) {
    let userMode = actor?.system.matrix?.userMode
    if (!userMode || userMode === "ar") return false
    if ((actor.type === "actorPc" || actor.type === "actorGrunt") && actor.system.activeSpecialAttribute === "depth") return false
    //The resistance card reads owner and roll from the card it follows: a bare object crashed it (SR5 p. 229)
    let dumpshockData = SR5_PrepareRollTest.getBaseRollData(null, actor)
    dumpshockData.damage.resistanceType = "dumpshock"
    if (bricked) dumpshockData.damage.bricked = true
    actor.rollTest("resistanceCard", null, dumpshockData)
    return true
  }

  //Raise owerwatch score
  static async overwatchIncrease(defenseHits, actorId) {
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let actorData = foundry.utils.duplicate(actor.system)

    //A negative value can lower the score (Emulate swapped for the hits, Data Trails p. 159), never below 0, where it
    //starts and where a reboot brings it back (SR5 p. 244): the direct call and the GM side of the socket both end here
    actorData.matrix.overwatchScore = Math.max(0, (actorData.matrix.overwatchScore || 0) + defenseHits)
    //Only the Emulate swap lowers it here: written from the AI owner's browser, it is a lowering of her own (overwatch-guard.js)
    actor.update({
      system: actorData
    }, defenseHits < 0 ? {
      sr5OverwatchLower: "emulate"
    } : {
    })
    ui.notifications.info(`${actor.name}, ${game.i18n.localize("SR5.OverwatchScoreActual")} ${actorData.matrix.overwatchScore}`)
  }

  //Socket for increasing overwatch score;
  //Believed only from a player who owns the actor: anyone else could raise or lower any score from a console
  //Its owner only raises it (a negative relay brought a score from 3 to 0, measured by Quitterie); the
  //defender who relays the Overwatch button raises the hacker's score by the hits of her defense card,
  //read again by the GM, once (security lot, Thomas)
  static async _socketOverwatchIncrease(message, senderId) {
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      },
      actor = SR5_EntityHelpers.getRealActorFromID(data.actorId)
    if (!sender || !actor) return SR5_SystemHelpers.srLog(1, `overwatchIncrease refused from ${senderId}`)
    if (sender.isGM) return SR5_ActorHelper.overwatchIncrease(data.defenseHits, data.actorId)
    const hits = Math.floor(Number(data.defenseHits))
    if (actor.testUserPermission?.(sender, "OWNER") && !data.messageId) {
      if (!(Number.isFinite(hits) && hits >= 0)) return SR5_SystemHelpers.srLog(1, `overwatchIncrease refused from ${sender.name}`, data)
      return SR5_ActorHelper.overwatchIncrease(hits, data.actorId)
    }
    const [{
      SR5_MarkHelpers
    }, {
      SR5_MiscellaneousHelpers
    }] = await Promise.all([import("../../rolls/roll-helpers/mark.js"), import("../../rolls/roll-helpers/miscellaneous.js")])
    const use = await SR5_MarkHelpers.overwatchUse(data.messageId, actor)
    if (!use || !(await SR5_MiscellaneousHelpers.grant(use, sender))) return SR5_SystemHelpers.srLog(1, `overwatchIncrease refused from ${sender.name}`, data)
    await SR5_ActorHelper.overwatchIncrease(use.value, data.actorId)
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
  //Only the marker's owner forgets its own marks: the list sent only says where to look, and nothing but the
  //marks of actorId is ever removed there (the reboot clears its sheet meanwhile, so the GM cannot read it again)
  static async _socketDeleteMarksOnActor(message, senderId) {
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    if (!SR5_ActorHelper.socketOwns(senderId, SR5_EntityHelpers.getRealActorFromID(data.actorId))) return SR5_ActorHelper.refuseSocket("deleteMarksOnActor", senderId, data)
    const markedItems = (data.actorData?.matrix?.markedItems ?? []).filter(m => typeof m?.uuid === "string")
    await SR5_ActorHelper.deleteMarksOnActor({
      matrix: {
        markedItems
      }
    }, data.actorId)
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
  //Sent by the owner of what was marked (a reboot, SR5 p. 244), on the marker's deck: believed for the marker's
  //owner, or for traces that all point at documents the sender owns
  static async _socketDeleteMarkInfo(message, senderId) {
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    const marker = SR5_EntityHelpers.getRealActorFromID(data.actorId)
    if (!marker || typeof data.item !== "string" || !data.item) return SR5_ActorHelper.refuseSocket("deleteMarkInfo", senderId, data)
    if (!SR5_ActorHelper.socketOwns(senderId, marker)) {
      const deck = marker.items?.find?.(d => d.type === "itemDevice" && d.system.isActive)
      const traces = data.exact ? [data.item] : (deck?.system?.markedItems ?? []).map(m => m.uuid).filter(uuid => uuid?.includes(data.item))
      if (!traces.length || !traces.every(uuid => SR5_ActorHelper.socketOwns(senderId, fromUuidSync(uuid)))) return SR5_ActorHelper.refuseSocket("deleteMarkInfo", senderId, data)
    }
    await SR5_ActorHelper.deleteMarkInfo(data.actorId, data.item, !!data.exact)
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
        "system.isElemental": itemData.isElemental,
        "system.leashTight": itemData.leashTight,
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
        "system.isSecondaryPropulsionActivate": itemData.secondaryPropulsion.isActivated === true,
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

    //The summoner who may lend his Edge to the spirit (SR5 p. 306), kept by the active GM, who creates it from the item
    if (item.type === "itemSpirit" && created[0]) {
      const {
        setSpiritSummoner
      } = await import("../../system/spirit-ledger.js")
      await setSpiritSummoner(created[0].id, actorId)
    }

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
  //The GM builds the actor from the item of the creator's sheet, never from the object sent, and gives it to the
  //sender: a player's console created any actor, owned by anyone (security pass, Olympe)
  static async _socketCreateSidekick(message, senderId) {
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    const owner = SR5_EntityHelpers.getRealActorFromID(data.actorId)
    const item = owner?.items?.get?.(data.item?._id)
    if (!SR5_ActorHelper.socketOwns(senderId, owner) || !SR5_ActorHelper.SIDEKICK_ITEMS.includes(item?.type)) return SR5_ActorHelper.refuseSocket("createSidekick", senderId, data)
    await SR5_ActorHelper.createSidekick(item.toObject(false), senderId, data.actorId)
  }

  //The items that put an actor on the map (createSidekick)
  static SIDEKICK_ITEMS = ["itemSpirit", "itemVehicle", "itemSprite", "itemProgram", "itemContact", "itemStorage"]

  //Whether the sender may write on a document: a GM, or an owner of it (of the actor holding an item)
  static socketOwns(senderId, document){
    return ownsTarget(game.users?.get(senderId), document)
  }

  static refuseSocket(type, senderId, data){
    SR5_SystemHelpers.srLog(1, `${type} refused from ${senderId}`, data)
    return false
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
      //A duplicated character carries the same item ids: its own drone is the one its owner created
      const creatorId = vehicle.parent ? SR5_ActorHelper.sidekickCreatorId(vehicle.parent) : undefined
      const drone = actors?.find(a => a.type === "actorDrone" && a.system.creatorItemId === (vehicle._id ?? vehicle.id) &&
        (creatorId === undefined || a.system.creatorId === creatorId))
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
   * Who may flip the wireless icon of a drone's sheet. Turning it off: anyone who holds the sheet (SR5 p. 424).
   * Turning a switched-off drone back on is a GM shortcut (ruling of 2026-10-05): nobody can reach the drone
   * wirelessly to ask it, so a player does not do it from her sheet (l. 845)
   * @param {Boolean} isGM - whether the user is a GM
   * @param {Boolean} turningOn - true when the wireless would be switched on
   * @return {Boolean}
   */
  static droneWirelessToggleAllowed(isGM, turningOn){
    return !!isGM || !turningOn
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
      modifiedItem.system.isElemental = actor.system.isElemental
      modifiedItem.system.leashTight = actor.system.leashTight
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
      //The sheet's box (prepared from the source while an active secondary propulsion mod reads it, Rigger 5 p. 158)
      modifiedItem.system.secondaryPropulsion.isActivated = actor.system.isSecondaryPropulsionActivate === true
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
  //Only a sidekick of the world, dismissed by its owner or its creator's, and as the GM reads it: a player's
  //console deleted a GM's actor by sending its _id (measured by Sixtine)
  static async _socketDismissSidekick(message, senderId) {
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    const actor = game.actors?.get(data.actor?._id)
    const creator = actor?.system?.creatorId ? SR5_EntityHelpers.getRealActorFromID(actor.system.creatorId) : null
    const isSidekick = !!creator?.items?.get?.(actor.system.creatorItemId)
    if (!isSidekick || !(SR5_ActorHelper.socketOwns(senderId, actor) || SR5_ActorHelper.socketOwns(senderId, creator))) return SR5_ActorHelper.refuseSocket("dismissSidekick", senderId, data)
    await SR5_ActorHelper.dimissSidekick(actor.toObject(false))
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

  //The PAN's owner slaves a device the dialog could offer her (SR5 p. 233): one of her own, or one of a
  //player character (or linked grunt) of the table, listed among its devices, and only while the PAN has room
  static async _socketAddItemToPan(message, senderId){
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    const master = SR5_EntityHelpers.getRealActorFromID(data.actorId)
    const item = typeof data.targetItem === "string" ? await fromUuid(data.targetItem) : null
    const holder = item?.documentName === "Item" ? item.parent : null
    const listed = Object.values(holder?.system?.matrix?.potentialPanObject ?? {
    }).some(list => list && Object.hasOwn(list, data.targetItem))
    const offered = SR5_ActorHelper.socketOwns(senderId, holder) ||
      (holder?.hasPlayerOwner && (holder.type === "actorPc" || (holder.type === "actorGrunt" && holder.prototypeToken?.actorLink)))
    const pan = master?.system?.matrix?.pan
    const room = !pan || !(Number(pan.current) >= Number(pan.max))
    if (!SR5_ActorHelper.socketOwns(senderId, master) || !listed || !offered || !room) return SR5_ActorHelper.refuseSocket("addItemToPan", senderId, data)
    await SR5_ActorHelper.addItemtoPan(data.targetItem, data.actorId)
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
    //The socket hands a checked number over, 0 included; the sheet a string
    if (index !== null && index !== undefined && index !== ""){
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

  //The PAN's owner takes a device out, or the device's owner takes hers back; the index is only believed when
  //it points at the device named
  static async _socketDeleteItemFromPan(message, senderId){
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    const master = SR5_EntityHelpers.getRealActorFromID(data.actorId)
    const item = typeof data.targetItem === "string" ? await fromUuid(data.targetItem) : null
    if (!SR5_ActorHelper.socketOwns(senderId, master) && !(item && SR5_ActorHelper.socketOwns(senderId, item))) return SR5_ActorHelper.refuseSocket("deleteItemFromPan", senderId, data)
    const deck = master?.items?.find?.(d => d.type === "itemDevice" && d.system.isActive)
    const index = Number(data.index)
    const pointed = Number.isInteger(index) && index >= 0 && deck?.system?.pan?.content?.[index]?.uuid === data.targetItem
    await SR5_ActorHelper.deleteItemFromPan(data.targetItem, data.actorId, pointed ? index : null)
  }

  //The links written on each source item, one after the other: a spell with two effects sends two requests that the
  //socket handles at the same time, and the second, reading the item before the first was written, wrote it back
  //without the first link
  static LINK_QUEUE = new Map()

  //Update the source Item of an external Effect
  static linkEffectToSource(actorId, targetItem, effectUuid){
    const previous = SR5_ActorHelper.LINK_QUEUE.get(targetItem) ?? Promise.resolve()
    const next = previous.then(() => SR5_ActorHelper.writeEffectLink(targetItem, effectUuid))
    const kept = next.catch(err => SR5_SystemHelpers.srLog(1, `linkEffectToSource: ${err?.message ?? err}`))
    SR5_ActorHelper.LINK_QUEUE.set(targetItem, kept)
    kept.then(() => {
      if (SR5_ActorHelper.LINK_QUEUE.get(targetItem) === kept) SR5_ActorHelper.LINK_QUEUE.delete(targetItem)
    })
    return next
  }

  static async writeEffectLink(targetItem, effectUuid){
    let item = await fromUuid(targetItem)
    if (!item) return
    let newItem = item.toObject(false).system
    if (newItem.duration === "sustained") newItem.isActive = true
    if (item.type === "itemAdeptPower" || item.type === "itemPower") newItem.isActive = true
    if (!Array.isArray(newItem.targetOfEffect)) newItem.targetOfEffect = Object.values(newItem.targetOfEffect ?? {
    })
    if (!newItem.targetOfEffect.includes(effectUuid)) newItem.targetOfEffect.push(effectUuid)
    await item.update({
      "system": newItem
    })
  }

  //Sent by whoever put the effect on its target: believed when the effect is an itemEffect of that very source,
  //held by an actor the sender owns, and when the sender owns the source too, or the card it was applied from is
  //the source's own (written by a GM, or by an owner of the actor that holds the source). The effect's ownerItem
  //is the sender's to write: alone, it switched on a GM's spell (Harriet's review)
  static async _socketLinkEffectToSource(message, senderId){
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    //Every effect the card posed comes in one request (a spell with two effects), the card being spent once for all
    const uuids = [...new Set(Array.isArray(data.effectUuids) ? data.effectUuids : [data.effectUuid])]
    if (!uuids.length || uuids.length > 20 || uuids.some(u => typeof u !== "string")) return SR5_ActorHelper.refuseSocket("linkEffectToSource", senderId, data)
    const effects = await Promise.all(uuids.map(u => fromUuid(u)))
    const source = typeof data.targetItem === "string" ? await fromUuid(data.targetItem) : null
    const linked = effect => effect?.type === "itemEffect" && source?.documentName === "Item" && effect.system?.ownerItem === data.targetItem
    if (effects.some(effect => !linked(effect) || !SR5_ActorHelper.socketOwns(senderId, effect))) return SR5_ActorHelper.refuseSocket("linkEffectToSource", senderId, data)
    if (!SR5_ActorHelper.socketOwns(senderId, source)) {
      const {
        SR5_MiscellaneousHelpers
      } = await import("../../rolls/roll-helpers/miscellaneous.js")
      const card = SR5_MiscellaneousHelpers.cardOf(data.messageId)
      const fromSource = !!card && card.data.owner?.itemUuid === data.targetItem && !!card.roller && source.parent?.uuid === card.roller.uuid
      //A card links its effect once: shown again, it switched back on a spell its caster no longer sustains
      //(Harriet's second review). An area effect is linked by the GM himself (effectArea), without this socket
      if (!fromSource || !(await SR5_MiscellaneousHelpers.consume(consumedKey(card.id, "linkEffect")))) return SR5_ActorHelper.refuseSocket("linkEffectToSource", senderId, data)
    }
    for (const uuid of uuids) await SR5_ActorHelper.linkEffectToSource(data.actorId, data.targetItem, uuid)
  }

  static async deleteSustainedEffect(targetItem){
    let item = await fromUuid(targetItem)
    if (item) await item.parent.deleteEmbeddedDocuments("Item", [item.id])
    else SR5_SystemHelpers.srLog(2, `No item to delete in deleteSustainedEffect()`)
  }

  //The caster stopped sustaining (SR5 p. 274): believed for the effect's owner, or for an itemEffect whose source
  //the sender owns and no longer sustains. Any other uuid deleted any item of the world (security pass, Olympe)
  static async _socketDeleteSustainedEffect(message, senderId){
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    const effect = typeof data.targetItem === "string" ? await fromUuid(data.targetItem) : null
    if (!effect) return
    if (!SR5_ActorHelper.socketOwns(senderId, effect)) {
      //Only an effect that lasts while sustained goes with the sustaining (Harriet's review)
      const sustained = effect.type === "itemEffect" && effect.system?.durationType === "sustained"
      const source = sustained && typeof effect.system?.ownerItem === "string" ? await fromUuid(effect.system.ownerItem) : null
      //Every effect a card puts is marked sustained: what is read is the source, a sustained spell or form, or a
      //power switched off (as the sheet's switch sends it); Harriet's second review
      const sustains = ["itemAdeptPower", "itemPower"].includes(source?.type) || source?.system?.duration === "sustained"
      if (!source || !sustains || source.system?.isActive || !SR5_ActorHelper.socketOwns(senderId, source)) return SR5_ActorHelper.refuseSocket("deleteSustainedEffect", senderId, data)
    }
    await SR5_ActorHelper.deleteSustainedEffect(data.targetItem)
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
        }, systemEffectWrite())
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
    //A heal never deals damage: a negative count filled the monitor (Quitterie, measured from a player's console)
    let damageToRemove = Math.max(0, Math.floor(Number(data.roll?.netHits)) || 0),
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
    //Only the stored fields of the monitor: the whole prepared system written back put every computed value in the
    //source, and the next preparation added its modifiers again (fatigue resistance 7, then 14, then 21)
    await targetActor.update(SR5_ActorHelper.monitorSourceUpdate(damageType, actorData.system.conditionMonitors[damageType]))
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
  //The stored fields of a condition monitor, for an update by path. A prepared copy of the system (toObject(false))
  //must never be written back whole: its modifiers would be in the source, and the next preparation adds them again
  static monitorSourceUpdate(key, monitor){
    let updates = {
      [`system.conditionMonitors.${key}.actual.base`]: monitor.actual.base
    }
    if (monitor.aggravated !== undefined) updates[`system.conditionMonitors.${key}.aggravated`] = monitor.aggravated
    return updates
  }

  //The custom effects of an item as stored (an object in older data), never the prepared ones: the preparation may add
  //effects to them (a weapon focus) that would then be written in the source
  static sourceItemEffects(item){
    let effects = item.toObject().system.itemEffects ?? []
    return Array.isArray(effects) ? effects : Object.values(effects)
  }

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
  //A player heals a patient she does not own (Heal, SR5 p. 291): the GM reads the casting card himself, from the chat
  //log and not from the request. Only the card's author may ask, once: the button is removed, and the card is kept in
  //a ledger the active GM alone writes (its author could put the button back in the flags). applyExternalEffect then
  //counts its hits again and asks the GM to confirm them (checkEffectCard)
  static async _socketApplyHealEffect(message, senderId){
    const card = game.messages.get(message.data?.messageId)
    if (!card || !senderId || card.author?.id !== senderId) return
    const data = foundry.utils.deepClone(card.flags?.sr5data)
    if (!data?.chatCard?.buttons?.applyEffect) return
    const item = await fromUuid(data.owner?.itemUuid)
    const {
      healsDamage
    } = await import("../../rolls/roll-helpers/cardRoller.js")
    if (!healsDamage(item?.system?.customEffects)) return
    const patient = SR5_EntityHelpers.getRealActorFromID(message.data.targetActor)
    if (!patient) return
    const {
      claimHealCard, healCardClaimed, healCardDiceKey, releaseHealCard, treatmentAllowed, woundEntry, woundTotal, recordTreatment
    } = await import("../../system/heal-ledger.js")
    //A card is known by its id and by its dice: an exact copy of it is a new message with the same dice (Quitterie,
    //S4). A retouched copy is stopped by the group of wounds below, read on the patient
    const keys = [card.id, healCardDiceKey(data)]
    if (healCardClaimed(keys)) return
    //Heal once per group of wounds (SR5 p. 207-208; Harriet's second review)
    if (!treatmentAllowed(woundEntry(patient.uuid), "heal", woundTotal(patient))) {
      return SR5_ActorHelper.whisperGM(game.i18n.format("SR5.WARN_WoundGroupTreated", {
        user: game.users.get(senderId)?.name ?? "?", patient: patient.name
      }))
    }
    //The GM confirms the hits first, and the card is spent only on his yes: a no leaves it to be shown again (S5)
    data.owner.messageId = card.id
    //What the player's sheet defines, shown in the same window as the hits: one window (definitionReview)
    const review = await SR5_ActorHelper.definitionReview(item, patient, "customEffects", data)
    const roll = await SR5_ActorHelper.checkEffectCard(data, item, review)
    if (!roll || !(await claimHealCard(keys))) return
    //Counted and confirmed: applied without asking again (no card to read is a card already read)
    const applied = await patient.applyExternalEffect({
      ...data, roll: {
        ...data.roll, ...roll
      }, owner: {
        ...data.owner, messageId: null
      }
    }, "customEffects", review)
    //Refused inside, after the GM's yes (Sophie's false): the card is given back and keeps its button
    if (applied === false) return releaseHealCard(keys)
    await recordTreatment(patient.uuid, "heal", woundTotal(patient))
    //Loaded here: roll-message imports this file
    const {
      SR5_RollMessage
    } = await import("../../rolls/roll-message.js")
    await SR5_RollMessage.updateChatButton(card.id, "applyEffect")
  }

  //A note for the GMs alone, in the chat
  static async whisperGM(text){
    await ChatMessage.create({
      content: `<p>${foundry.utils.escapeHTML(text)}</p>`, whisper: game.users.filter(u => u.isGM).map(u => u.id),
    })
  }

  //First aid on a patient the player does not own (SR5 p. 207). The healData sent healed anyone of any number of
  //boxes, as many times as asked (Romane): the GM reads the card from the chat log, counts its hits again within
  //the first aid pool, bounds the boxes by them, asks to confirm, and spends the card once per patient
  static async _socketHeal(message, senderId){
    const data = message?.data ?? {
    }
    if (!isActiveGM()) return
    const sender = game.users?.get(senderId)
    const patient = SR5_EntityHelpers.getRealActorFromID(data.targetActor)
    if (!sender || !patient) return
    if (SR5_ActorHelper.socketOwns(senderId, patient)) return SR5_ActorHelper.heal(data.targetActor, data.healData)
    const healData = await SR5_ActorHelper.firstAidByCard(data, patient, sender)
    if (!healData) return SR5_ActorHelper.refuseSocket("heal", senderId, data)
    if (await SR5_ActorHelper.heal(data.targetActor, healData) === false) return
    //This group of wounds has had its first aid (SR5 p. 207)
    const {
      recordTreatment, woundTotal
    } = await import("../../system/heal-ledger.js")
    await recordTreatment(patient.uuid, "firstAid", woundTotal(patient))
  }

  /**
   * The healing a first aid card stands for, as the GM works it out again: null when the card does not back it.
   * @param {object} data the request: messageId, healData (the monitor asked, the boxes claimed)
   * @param {Actor} patient
   * @param {User} sender
   */
  static async firstAidByCard(data, patient, sender){
    const {
      SR5_MiscellaneousHelpers
    } = await import("../../rolls/roll-helpers/miscellaneous.js")
    const {
      patientMonitors, firstAidHealedBoxes
    } = await import("../../rolls/roll-helpers/cardRoller.js")
    const {
      stabilizedTreatmentBoxes
    } = await import("../../system/bb-healing-rules.js")
    const card = SR5_MiscellaneousHelpers.cardOf(data.messageId)
    if (!card || card.data.test?.typeSub !== "firstAid" || !ownsTarget(sender, card.roller)) return null
    //Once per group of wounds, and never after a Heal spell (SR5 p. 207-208): read on the patient, not on the card,
    //so that a retouched copy of the card treats nothing more (Harriet's second review)
    const {
      treatmentAllowed, woundEntry, woundTotal
    } = await import("../../system/heal-ledger.js")
    if (!treatmentAllowed(woundEntry(patient.uuid), "firstAid", woundTotal(patient))) {
      await SR5_ActorHelper.whisperGM(game.i18n.format("SR5.WARN_WoundGroupTreated", {
        user: sender.name, patient: patient.name
      }))
      return null
    }
    const type = data.healData?.test?.typeSub
    if (!patientMonitors(patient).includes(type)) return null
    //A card whose hits are more than its dice show was changed after the roll
    const hits = SR5_MiscellaneousHelpers.hitsOf(card, "skills.firstAid.test.dicePool")
    if (hits === null || (Number(card.data.roll?.hits) || 0) > hits) return null
    const rating = Number(card.roller.system?.skills?.firstAid?.rating?.value) || 0
    //The medkit read on the healer's sheet, never on the card (Harriet's review)
    const medkit = Math.max(0, ...Array.from(card.roller.items ?? []).filter(i => i.system?.isMedkit).map(i => Number(i.system.itemRating) || 0))
    const most = Math.max(firstAidHealedBoxes(hits, 2, rating, false), stabilizedTreatmentBoxes(hits, 2, rating, medkit, false))
    const boxes = bounded(data.healData?.roll?.netHits, Math.min(most, Number(card.data.roll?.netHits) || 0))
    if (boxes <= 0) return null
    //An exact copy of the card is a new message with the same dice: known by its dice too (Quitterie, S4); a retouched copy is left to the GM
    const {
      healCardDiceKey
    } = await import("../../system/heal-ledger.js")
    const diceKey = healCardDiceKey(card.data)
    if (diceKey && SR5_MiscellaneousHelpers.isConsumed(`${diceKey}|firstAid`)) return null
    //One test treats one patient (SR5 p. 207): the card is spent on the first, whoever it is. The GM is shown the
    //hits counted again, and the boxes asked
    const granted = await SR5_MiscellaneousHelpers.grant({
      card, key: consumedKey(card.id, "firstAid"), label: "firstAid", value: hits,
      target: game.i18n.format("SR5.SocketUseFirstAidTarget", {
        name: patient.name, boxes
      }),
    }, sender)
    if (!granted || (diceKey && !(await SR5_MiscellaneousHelpers.consume(`${diceKey}|firstAid`)))) return null
    return {
      test: {
        typeSub: type
      }, roll: {
        netHits: boxes
      }
    }
  }

  //Manage Regeneration
  static async regenerate(actorId, data){
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let damageToRemove = data.roll.netHits
    let actorData = foundry.utils.deepClone(actor)
    actorData = actorData.toObject(false)

    // A single condition monitor: grunts, and the watcher, homunculus or AI core (no Physical monitor), as in takeDamage()
    const monitors = actorData.system.conditionMonitors
    const singleMonitor = actorData.type === "actorGrunt" || (monitors.condition && !monitors.physical)
    if (singleMonitor){
      if (monitors.condition?.actual.value > 0){
        damageToRemove = SR5_ActorHelper.healMonitorBoxes(actorData.system.conditionMonitors.condition, damageToRemove)
      }
    } else {
      // A spirit has no overflow monitor (Physical and Stun only)
      if (actorData.system.conditionMonitors.overflow?.actual.value > 0){
        actorData.system.conditionMonitors.overflow.actual.base -= damageToRemove
        damageToRemove -= actorData.system.conditionMonitors.overflow.actual.value
        await SR5_EntityHelpers.updateValue(actorData.system.conditionMonitors.overflow.actual, 0)
      }
      if (actorData.system.conditionMonitors.physical?.actual.value > 0 && damageToRemove > 0){
        damageToRemove = SR5_ActorHelper.healMonitorBoxes(actorData.system.conditionMonitors.physical, damageToRemove)
      }
      if (actorData.system.conditionMonitors.stun?.actual.value > 0 && damageToRemove > 0){
        actorData.system.conditionMonitors.stun.actual.base -= damageToRemove
        damageToRemove -= actorData.system.conditionMonitors.stun.actual.value
        await SR5_EntityHelpers.updateValue(actorData.system.conditionMonitors.stun.actual, 0)
      }
    }

    //Only the stored fields of the monitors, as in heal(): the whole prepared copy put the computed values in the source
    let updates = {
    }
    for (let key of ["condition", "overflow", "physical", "stun"]) {
      if (actorData.system.conditionMonitors[key]?.actual) Object.assign(updates, SR5_ActorHelper.monitorSourceUpdate(key, actorData.system.conditionMonitors[key]))
    }
    await actor.update(updates)
    await SR5_ActorHelper.clearDamageKnockout(actor)
  }

  //Apply an external effect to actor (such spell, complex form). Data is provided by chatMessage
  //The hits and net hits of a casting card written by a player and applied by someone else (the GM, or the owner of
  //the target), counted again (roll-helpers/effect-card.js), and confirmed when the GM applies it. The card's own
  //figures when its author applies it himself (his own actor), or when it is the GM's. null when the card is
  //rejected or the GM declines
  //`review` (definitionReview): what the sheet defines, shown in the same window
  static async checkEffectCard(data, item, review = null){
    const claimed = {
      hits: data.roll?.hits, netHits: data.roll?.netHits
    }
    const message = game.messages?.get(data.owner?.messageId)
    const author = message?.author
    //Never filtered on the test type the card states: a flag its author writes. A card whose dice are not the caster's
    //(another player's resistance card) is rejected, the GM warned, and applied by hand
    if (!author || author.isGM || author.id === game.user?.id) return claimed
    const caster = SR5_EntityHelpers.getRealActorFromID(data.owner.actorId, data.actorUuids)
    const isForm = item.type === "itemComplexForm"
    //The wounds taken since the roll (its Drain, typically) are given back to the pool (attack-card.js, woundAllowance)
    const pool = (Number(isForm ? caster?.system?.matrix?.resonanceActions?.threadComplexForm?.test?.dicePool :
      (caster?.system?.skills?.spellcasting?.spellCategory?.[item.system.category]?.dicePool ?? caster?.system?.skills?.spellcasting?.test?.dicePool)) || 0) +
      Math.max(0, -(Number(caster?.system?.penalties?.condition?.actual?.value) || 0))
    const verdict = effectCardVerdict({
      authorOwnsCaster: !!caster && caster.testUserPermission?.(author, "OWNER"),
      itemOnCaster: !!caster && (item.parent === caster || item.parent?.id === caster.id),
      rollJSON: data.roll?.r, pool, edge: caster?.system?.specialAttributes?.edge?.augmented?.value ?? 0,
      force: isForm ? data.matrix?.level : data.magic?.force,
      magic: isForm ? caster?.system?.specialAttributes?.resonance?.augmented?.value : caster?.system?.specialAttributes?.magic?.augmented?.value,
      claimedHits: claimed.hits, claimedNetHits: claimed.netHits,
    })
    if (!verdict.ok) {
      await ChatMessage.create({
        whisper: game.users.filter(u => u.isGM).map(u => u.id),
        content: `<p>${game.i18n.format("SR5.EffectCardRejected", {
          user: author.name, item: item.name
        })}</p>`,
      })
      return null
    }
    //A player applying it to his own character gets the hits counted again, without a dialog
    if (!game.user?.isGM) return {
      hits: verdict.hits, netHits: verdict.netHits
    }
    const notes = []
    if (verdict.mismatch) notes.push(game.i18n.format("SR5.EffectCardMismatch", {
      hits: claimed.hits ?? "?", netHits: claimed.netHits ?? "?"
    }))
    if (verdict.overPool) notes.push(game.i18n.format("SR5.EffectCardOverPool", {
      allowed: verdict.allowed
    }))
    const asked = foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.EffectCardConfirmTitle"
      },
      content: `<p>${game.i18n.format("SR5.EffectCardConfirm", {
        user: author.name, caster: caster.name, item: item.name, hits: verdict.hits, netHits: verdict.netHits
      })}</p>${notes.map(n => `<p><strong>${n}</strong></p>`).join("")}` +
        (review ? SR5_ActorHelper.definitionHtml(review, {
          hits: verdict.hits, netHits: verdict.netHits
        }) : ""),
      rejectClose: false,
    })
    //The same answer stands for the definition shown here (definitionDecision): an area spell asks once
    if (review) SR5_ActorHelper.definitionDecision(review, () => asked)
    const ok = await asked
    return ok ? {
      hits: verdict.hits, netHits: verdict.netHits
    } : null
  }

  //The GM applies damage nobody resists on behalf of a player (her card, her area template, her item): he sees the
  //boxes before they are written. The hits were already counted again and confirmed by checkEffectCard when the card
  //is a player's and the effect reads the roll
  static async confirmUnresistedDamage(actor, item, key, value, data, effectType){
    if (!game.user?.isGM) return true
    const author = game.messages?.get(data.owner?.messageId)?.author
    if (author && !author.isGM && readsRoll(item.system[effectType])) return true
    if (author?.isGM && !item.parent?.hasPlayerOwner) return true
    return foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.UnresistedDamageConfirmTitle"
      },
      content: `<p>${game.i18n.format("SR5.UnresistedDamageConfirm", {
        item: item.name, actor: actor.name, value, monitor: game.i18n.localize(SR5.conditionMonitorTypes?.[key] ?? key)
      })}</p>`,
      rejectClose: false,
    })
  }

  //Damage nobody resists (an addDamage effect): written in the source, as takeDamage does, never in the prepared data.
  //Stun beyond its monitor goes to Physical, Physical beyond its monitor to the overflow, then death (carryMonitorOverflow)
  static async addUnresistedDamage(actorId, actor, key, value){
    const monitors = actor.toObject(false).system.conditionMonitors
    monitors[key].actual.base += value
    SR5_EntityHelpers.updateValue(monitors[key].actual, 0)
    let isDead = false
    if (monitors.stun?.actual && monitors.physical?.actual && (key === "stun" || key === "physical")) {
      ({
        isDead
      } = SR5_ActorHelper.carryMonitorOverflow(monitors, actor.type))
    }
    const updates = {
    }
    for (let [k, monitor] of Object.entries(monitors)) {
      if (monitor?.actual) updates[`system.conditionMonitors.${k}.actual.base`] = Math.min(monitor.actual.base, monitor.value ?? monitor.actual.base)
    }
    await actor.update(updates)

    const full = m => m?.actual && m.actual.value >= m.value
    if (actor.type === "actorPc" || actor.type === "actorSpirit") {
      if (full(monitors.physical)) {
        if (isDead || actor.type === "actorSpirit") await SR5_ActorHelper.createDeadEffect(actorId)
        else await SR5_ActorHelper.createKoEffect(actorId)
      } else if (full(monitors.stun)) {
        if (actor.type === "actorSpirit") await SR5_ActorHelper.createDeadEffect(actorId)
        else await SR5_ActorHelper.createKoEffect(actorId)
      }
    }
    else if (actor.type === "actorGrunt" && full(monitors.condition)) await SR5_ActorHelper.createKoEffect(actorId)
    else if (actor.type === "actorDrone" && full(monitors.condition)) await SR5_ActorHelper.createDeadEffect(actorId)
    else if ((actor.type === "actorSprite" || actor.type === "actorDevice") && full(monitors.matrix)) await SR5_ActorHelper.createDeadEffect(actorId)
  }

  //The reference of an item a player's sheet carries: the compendium document it was taken from, else an item of the
  //same type and name in the Item compendiums, then in the world. null when there is none
  static async findReferenceItem(item){
    const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId
    if (typeof source === "string" && source.length) {
      try {
        const ref = await fromUuid(source)
        if (ref && ref.type === item.type && ref.uuid !== item.uuid) return ref
      } catch {
        //A source that no longer exists: looked for by name
      }
    }
    const same = d => d.type === item.type && d.name === item.name
    for (const pack of game.packs?.filter(p => p.documentName === "Item") ?? []) {
      const entry = (await pack.getIndex({
        fields: ["type"]
      })).find(same)
      if (entry) return pack.getDocument(entry._id)
    }
    return game.items?.find(i => same(i) && i.uuid !== item.uuid) ?? null
  }

  //What the GM must see before an item of a player's sheet applies its effects to an actor she does not own (on the
  //GM's side only): the sheet's definition, the reference's, and how they differ. null when nothing is to be checked
  static async definitionReview(item, actor, effectType, data){
    if (!game.user?.isGM || !item || !actor) return null
    const owner = item.parent
    if (owner?.documentName !== "Actor") return null
    const players = game.users?.filter(u => !u.isGM && owner.testUserPermission?.(u, "OWNER")) ?? []
    if (!players.length || players.some(u => actor.testUserPermission?.(u, "OWNER"))) return null
    const reference = await SR5_ActorHelper.findReferenceItem(item)
    const sheet = {
      resisted: !!item.system.resisted, entries: transferEntries(item.system[effectType])
    }
    const ref = reference ? {
      resisted: !!reference.system?.resisted, entries: transferEntries(reference.system?.[effectType])
    } : null
    if (!sheet.entries.length && !ref?.entries.length) return null
    const print = definitionPrint(sheet, item.system?.itemRating)
    //The resistance card of an actor the GM's template asked to resist (effectArea.js): the decision is the template's
    //(M5 D6), as long as the sheet still defines the same thing. Found by the GM's own record, never by the card alone
    const areaKey = data?.test?.type === "spellResistance" ?
      SR5_ActorHelper.AREA_REVIEW_KEYS.get(SR5_ActorHelper.areaReviewKey(actor, item.uuid, data.previousMessage?.messageId)) : null
    const fromArea = !!areaKey && areaKey.endsWith(`|${print}`)
    return {
      item, actor, sheet, ref, reference, diff: compareDefinitions(sheet, ref), shown: false,
      //One decision per card, or per template for an area spell (applied token by token, effectArea.js), and for the
      //definition shown: changed on the sheet afterwards (a multiplier raised), it is asked again
      key: fromArea ? areaKey : `${item.uuid}|${data?.owner?.messageId ?? data?.owner?.actorId}|${print}`,
      area: !!data?.areaTemplate || fromArea,
      //Applied once the target resisted (its resistance card): the test was not skipped
      afterResistance: /(Resistance|Defense)$/.test(data?.test?.type ?? ""),
      //Only a spell says whether it is resisted (itemSpell.resisted): a complex form, a power do not
      resistable: item.type === "itemSpell",
    }
  }

  //One effect entry, as the GM reads it: its target, its kind, its value when it is known
  static describeEntry(e, roll, rating){
    const label = game.i18n.localize(SR5_EntityHelpers.getLabelByKey(e.target) ?? e.target)
    const kind = game.i18n.localize(SR5.customEffectsTypes?.[e.type] ?? e.type)
    const times = e.multiplier !== 1 ? ` × ${e.multiplier}` : ""
    const fixed = String(e.type).startsWith("value") ? ` ${e.value}` : ""
    const value = entryValue(e, roll, rating)
    return `${label} : ${kind}${fixed}${times}${value === undefined ? "" : ` = ${value}`}`
  }

  static definitionHtml(review, roll){
    const t = (k, d) => game.i18n.format(k, d ?? {
    })
    const rating = review.item.system?.itemRating
    const list = entries => `<ul>${entries.map(e => `<li>${SR5_ActorHelper.describeEntry(e, roll, rating)}</li>`).join("")}</ul>`
    let html = `<p>${t(review.area ? "SR5.EffectDefinitionIntroArea" : "SR5.EffectDefinitionIntro", {
      item: review.item.name, owner: review.item.parent?.name, actor: review.actor.name
    })}</p>${list(review.sheet.entries)}`
    if (review.resistable && !review.sheet.resisted && !review.afterResistance) html += `<p><strong>${t("SR5.EffectDefinitionNoResistance")}</strong></p>`
    if (!review.reference) return html + `<p><strong>${t("SR5.EffectDefinitionNoReference")}</strong></p>`
    const source = review.reference.pack ? (game.packs?.get(review.reference.pack)?.metadata?.label ?? review.reference.pack) :
      t("SR5.EffectDefinitionWorldItem")
    html += `<p>${t("SR5.EffectDefinitionReference", {
      name: review.reference.name, source
    })}</p>`
    const diff = review.diff
    if (definitionsMatch(diff)) return html + `<p>${t("SR5.EffectDefinitionSame")}</p>`
    if (diff.resistedDiffers) html += `<p><strong>${t(review.ref.resisted ? "SR5.EffectDefinitionRefResisted" : "SR5.EffectDefinitionRefNotResisted")}</strong></p>`
    if (diff.changed.length) html += `<p><strong>${t("SR5.EffectDefinitionChanged")}</strong></p><ul>${diff.changed.map(([e, r]) =>
      `<li>${SR5_ActorHelper.describeEntry(e, roll, rating)} — ${t("SR5.EffectDefinitionReferenceSays")} ${SR5_ActorHelper.describeEntry(r, roll, rating)}</li>`).join("")}</ul>`
    if (diff.added.length) html += `<p><strong>${t("SR5.EffectDefinitionAdded")}</strong></p>${list(diff.added)}`
    if (diff.missing.length) html += `<p><strong>${t("SR5.EffectDefinitionMissing")}</strong></p>${list(diff.missing)}`
    return html
  }

  //The GM's answer for a card, or for every token of an area template: kept as soon as the window opens, so the
  //tokens that come meanwhile wait for it instead of opening their own, and a refusal stands for the whole template.
  //On a card, a refusal is forgotten: the GM may click again
  static DEFINITION_DECISIONS = new Map()

  //The decision key of the template that asked an actor to resist an area spell, by actor, spell and cast: written
  //by the GM when the template asks (effectArea.js), read when he applies that actor's resistance card
  static AREA_REVIEW_KEYS = new Map()
  static areaReviewKey(actor, itemUuid, castMessageId){
    return `${actor?.uuid ?? actor?.id}|${itemUuid}|${castMessageId}`
  }

  static definitionDecision(review, ask){
    review.shown = true
    const known = SR5_ActorHelper.DEFINITION_DECISIONS.get(review.key)
    if (known) return known
    const decided = Promise.resolve(ask()).then(ok => {
      if (!ok && !review.area) SR5_ActorHelper.DEFINITION_DECISIONS.delete(review.key)
      return !!ok
    })
    SR5_ActorHelper.DEFINITION_DECISIONS.set(review.key, decided)
    return decided
  }

  static async confirmDefinition(review, data){
    return SR5_ActorHelper.definitionDecision(review, () => foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.EffectDefinitionTitle"
      },
      content: SR5_ActorHelper.definitionHtml(review, data.roll),
      rejectClose: false,
    }))
  }

  //`reviewed`: a definitionReview the GM's caller already showed (its own checkEffectCard), never read from a card
  static async applyExternalEffect(actorId, data, effectType, reviewed = null){
    //An area spell whose template was deleted during the resistance: nothing would lift the effect
    if (isAreaSpellTemplateGone(data)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_AreaSpellTemplateGone"))
      return false
    }
    //A spell nobody resists writes no net hits on its card: they are its hits (over its threshold, if any), not "?" or 0
    if (data.roll && cardNetHits(data.roll, data.threshold?.value) !== data.roll.netHits) data = {
      ...data, roll: {
        ...data.roll, netHits: cardNetHits(data.roll, data.threshold?.value)
      }
    }
    let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    let item = await fromUuid(data.owner.itemUuid)
    let itemData = item.system
    //A player's item applied to an actor she does not own: the GM sees what its sheet defines, against the reference
    const review = reviewed ?? await SR5_ActorHelper.definitionReview(item, actor, effectType, data)
    //An effect whose value reads the roll (hits, net hits): the GM does not believe a player's card as it is written
    if (readsRoll(itemData[effectType])) {
      const roll = await SR5_ActorHelper.checkEffectCard(data, item, review)
      //Refused: false, so a caller that spent a card gives it back (_socketApplyHealEffect)
      if (!roll) return false
      data = {
        ...data, roll: {
          ...data.roll, ...roll
        }
      }
    }
    if (review && !review.shown && !(await SR5_ActorHelper.confirmDefinition(review, data))) return false
    // Head case Attribute Boost (Stolen Souls p. 201): lasts a number of combat turns equal to the hits,
    // then the head case takes as many boxes of Stun damage (applied when the effect expires, see SR5Combat.manageTurnEnd)
    let isNaniteBoost = Object.values(itemData.systemEffects || {
    }).some(s => s.value === "naniteAttributeBoost")
    let naniteBoostMarked = false
    //Damage the GM declined, or that its clicker may not write: the card keeps its button, unless another entry of the
    //same card was posed (a second click would pose it twice)
    let declined = false, posed = false
    const toLink = []

    for (let [entryKey, e] of Object.entries(itemData[effectType] ?? {
    })){
      if (e.transfer) {
        let value, key, newData
        //A "replace" type gives the target this value instead of adding it: the Limit of Animal Sense and Eyes of the Pack
        //becomes the net hits (Street Grimoire p. 106)
        const replaces = isReplaceEffectType(e.type)
        const baseType = replaces ? e.type.replace("Replace", "") : e.type
        if (["hits", "netHits", "value", "rating"].includes(baseType)) value = entryValue(e, data.roll, item.system.itemRating)
        //An area spell resisted totally gets its effect at 0 (test-ResistanceResult), only to mark the token as
        //having resisted inside the template: a fixed value or the resistor's hits must not apply the spell
        if (data.test?.type === "spellResistance" && data.roll.netHits <= 0) value = 0

        //Handle heal effect
        if (e.target.includes("removeDamage")){
          key = e.target.replace('.removeDamage','')
          //A grunt has one condition monitor for its Physical damage (SR5 p. 381): Heal reaches it (Quitterie, S2)
          if (key === "physical" && !actor.system.conditionMonitors?.physical && actor.system.conditionMonitors?.condition) key = "condition"
          //A copy, as in heal(): an update made of actor.system itself wrote nothing, and the healing was only shown
          //until the next preparation of the actor (measured on 5a4cbf2c)
          newData = actor.toObject(false).system
          if(newData.conditionMonitors[key]){
            //Never below 0 boxes; aggravated Physical boxes cost two hits (Howling Shadows p. 213), as in heal()
            if (key === "physical" || key === "condition") SR5_ActorHelper.healMonitorBoxes(newData.conditionMonitors[key], value)
            else newData.conditionMonitors[key].actual.base = Math.max(newData.conditionMonitors[key].actual.base - value, 0)
            SR5_EntityHelpers.updateValue(newData.conditionMonitors[key].actual, 0)
            //Only the stored fields of the monitor, as in heal(): the whole prepared copy put the computed values in the source
            await actor.update(SR5_ActorHelper.monitorSourceUpdate(key, newData.conditionMonitors[key]))
            posed = true
            continue
          } else continue
        }

        //Handle non resisted damage
        if (e.target.includes("addDamage")){
          key = e.target.replace('.addDamage','')
          if (!actor.system.conditionMonitors?.[key] || !(value > 0)) continue
          //A player never writes on an actor she does not own: the update would be refused half way
          if (!actor.isOwner) {
            ui.notifications.warn(game.i18n.localize("SR5.WARN_UnresistedDamageNotOwner"))
            declined = true
            continue
          }
          if (!(await SR5_ActorHelper.confirmUnresistedDamage(actor, item, key, value, data, effectType))) {
            declined = true
            continue
          }
          await SR5_ActorHelper.addUnresistedDamage(actorId, actor, key, value)
          posed = true
          continue
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
          //The entry of the source item it comes from: dispelling lowers it only if that entry read the hits (dispel-rules.js)
          "flags.sr5.sourceEntry": entryKey,
          //The hits its value stands on, and the spell's hits then: dispelling works the value out again from them
          ...(["hits", "netHits"].includes(baseType) ? {
            "flags.sr5.sourceBase": Number(baseType === "hits" ? data.roll.hits : data.roll.netHits) || 0,
            "flags.sr5.sourceHits": Number(item.system.hits) || 0,
          } : {
          }),
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
                "type": replaces ? "valueReplace" : "value",
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
        //Link Effect to source owner: the effect just created, and no other (looked for by its source, every effect of
        //a spell was the same item)
        const [effect] = await actor.createEmbeddedDocuments("Item", [itemEffect]) ?? []
        if (effect) posed = true
        if (!effect) SR5_SystemHelpers.srLog(1, `applyExternalEffect: no effect created on ${actor.name}`)
        //Asked of the GM once for all the effects of this card, below: he spends the card once
        else if (!game.user?.isGM) toLink.push(effect.uuid)
        else {
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
            //Only the effects, copied from the source: the prepared device written back put its computed values in the source
            let itemEffects = SR5_ActorHelper.sourceItemEffects(itemToUpdate)
            let effectItem ={
              "name": itemData.name,
              "target": e.target,
              "wifi": false,
              "type": "value",
              "value": value,
              "multiplier": 1,
              "ownerItem": data.owner.itemUuid,
            }
            itemEffects.push(effectItem)
            await actor.updateEmbeddedDocuments("Item", [{
              _id: itemToUpdate.id, "system.itemEffects": itemEffects
            }], systemEffectWrite())
          }
        }
      }
    }
    //One request for every effect this card posed: sent one by one, the GM spent the card on the first, and refused the
    //second link of a spell he owns that a player applied to her own actor
    if (toLink.length) SR5_SocketHandler.emitForGM("linkEffectToSource", {
      actorId: data.owner.actorId,
      targetItem: data.owner.itemUuid,
      effectUuid: toLink[0],
      effectUuids: toLink,
      //The card it was applied from: the GM reads it again (security pass, Olympe)
      messageId: data.owner.messageId,
    })
    //Whether the effect was applied: refused (a card counted again and rejected, the GM said no, damage declined), the
    //card keeps its Apply button
    //An entry declined while another was posed: the card is spent (the declined damage is lost, the GM's own choice)
    return posed || !declined
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

  //The weapon a toxin card answers, read on the card that rolled the attack (Liesel's D1): the card the resistance
  //answers (the defense), then the one before it. Kept only when a GM wrote that card or an owner of its roller,
  //and the weapon is that roller's. null otherwise
  static toxinSourceOf(data){
    let messageId = data?.previousMessage?.messageId
    for (let step = 0; step < 2 && messageId; step++){
      const message = game.messages?.get(messageId)
      const card = message?.flags?.sr5data
      if (!card) return null
      const weapon = card.owner?.itemUuid ? fromUuidSync(card.owner.itemUuid) : null
      if (weapon?.system?.damageElement === "toxin" && weapon.system.toxin) {
        const roller = SR5_EntityHelpers.getRealActorFromID(card.owner?.actorId, card.actorUuids)
        const author = message.author
        if (!roller || !author || (!author.isGM && !roller.testUserPermission(author, "OWNER"))) return null
        if (weapon.parent !== roller && weapon.parent?.uuid !== roller.uuid) return null
        return {
          card, weapon, answered: game.messages.get(data.previousMessage.messageId)?.flags?.sr5data, messageId
        }
      }
      messageId = card.previousMessage?.messageId
    }
    return null
  }

  static ENGULF_EFFECTS = ["engulfAir", "engulfWater", "engulfFire", "engulfEarth"]

  //An engulf attack card (SR5 p. 399): written by a GM or an owner of its roller, with an engulf weapon of that roller.
  //{card, weapon, roller, messageId}, or null
  static engulfSourceOf(messageId){
    const message = messageId ? game.messages?.get(messageId) : null
    const card = message?.flags?.sr5data
    if (!card?.owner?.itemUuid) return null
    const weapon = fromUuidSync(card.owner.itemUuid)
    if (!Object.values(weapon?.system?.systemEffects ?? {
    }).some(e => SR5_ActorHelper.ENGULF_EFFECTS.includes(e?.value))) return null
    const roller = SR5_EntityHelpers.getRealActorFromID(card.owner?.actorId, card.actorUuids)
    const author = message.author
    if (!roller || !author || (!author.isGM && !roller.testUserPermission(author, "OWNER"))) return null
    if (weapon.parent !== roller && weapon.parent?.uuid !== roller.uuid) return null
    return {
      card, weapon, roller, messageId
    }
  }

  //The victim of a first engulf phase and the attack card, from the card that resists it (an air engulf's toxin card,
  //the resistance card of the others): it answers a defense card, which answers the engulf attack, and the defense was
  //written by a GM or an owner of the defender, who is the actor resisting. null otherwise: nothing to keep
  static engulfFirstPhase(card){
    const defenseMessage = card?.previousMessage?.messageId ? game.messages?.get(card.previousMessage.messageId) : null
    const defense = defenseMessage?.flags?.sr5data
    if (defense?.test?.type !== "defense") return null
    const source = SR5_ActorHelper.engulfSourceOf(defense.previousMessage?.messageId)
    if (!source) return null
    const defender = SR5_EntityHelpers.getRealActorFromID(defense.owner?.speakerId ?? defense.owner?.actorId, defense.actorUuids)
    const victim = SR5_EntityHelpers.getRealActorFromID(card.owner?.speakerId ?? card.owner?.actorId, card.actorUuids)
    const author = defenseMessage.author
    if (!defender || !victim || defender.uuid !== victim.uuid) return null
    if (!author || (!author.isGM && !defender.testUserPermission(author, "OWNER"))) return null
    return {
      victim, attackId: source.messageId
    }
  }

  //At a first engulf phase, the active GM keeps the attack card for the victim; at a following one, nothing changes.
  //The attack card of the spirit engulfing the actor of this card, or null
  static async keepEngulfFirstPhase(card){
    const first = SR5_ActorHelper.engulfFirstPhase(card)
    if (first) {
      const {
        setEngulfSource, banishKey
      } = await import("../../system/spirit-ledger.js")
      await setEngulfSource(banishKey(first.victim), first.attackId)
      return first.attackId
    }
    const victimId = card?.owner?.speakerId ?? card?.owner?.actorId
    return victimId ? SR5_ActorHelper.engulfAttackFor(SR5_EntityHelpers.getRealActorFromID(victimId, card.actorUuids)) : null
  }

  //The engulf ends for the victim who broke free (SR5 p. 399): the active GM forgets the attack card
  static async forgetEngulf(victim){
    if (!victim) return
    const {
      setEngulfSource, banishKey
    } = await import("../../system/spirit-ledger.js")
    await setEngulfSource(banishKey(victim), null)
  }

  //The attack card of the spirit engulfing this actor, in the active GM's ledger (spirit-ledger.js); null if none
  static async engulfAttackFor(actor){
    const {
      readLedger, engulfSource, banishKey
    } = await import("../../system/spirit-ledger.js")
    return actor ? engulfSource(readLedger(), banishKey(actor)) : null
  }

  //The damage of an engulf at the spirit's following phases, without the hits of the first attack, read on the
  //engulfing spirit, never on the weapon's data: Magic × 2, AP −Magic (SR5 p. 399); Stun for air and water,
  //Physical for earth and fire (p. 399-400), fire keeping its element. null when lost
  static async engulfDamageOf(attackId){
    const source = SR5_ActorHelper.engulfSourceOf(attackId)
    if (!source) return null
    const {
      engulfDamage
    } = await import("../../rolls/roll-helpers/toxin-card.js")
    const damage = engulfDamage(source.roller.system.specialAttributes?.magic?.augmented?.value)
    const effect = Object.values(source.weapon.system.systemEffects ?? {
    }).map(e => e?.value).find(v => SR5_ActorHelper.ENGULF_EFFECTS.includes(v))
    if (effect === "engulfEarth" || effect === "engulfFire") damage.type = "physical"
    if (effect === "engulfFire") damage.element = "fire"
    return damage
  }

  //The toxin card a player wrote, applied by the GM (SR5 p. 409-410; Liesel's D1): nothing comes from its flags. The
  //author must own the actor it lands on; the toxin is read on the weapon, its Power worked out again, the hits counted
  //again within the resister's pool, and the GM confirms. The card serves once, written in the active GM's registry.
  //The card's own data when a GM wrote it, or its author applies it; null when refused
  static async checkToxinCard(message, actor){
    const data = message?.flags?.sr5data
    const author = message?.author
    if (!data || !actor) return null
    if (!game.user?.isGM || !author || author.isGM || author.id === game.user.id) return data
    const {
      toxinCardPower, toxinCardVerdict, toxinVectors
    } = await import("../../rolls/roll-helpers/toxin-card.js")
    const {
      SR5_MiscellaneousHelpers
    } = await import("../../rolls/roll-helpers/miscellaneous.js")
    const {
      healCardDiceKey
    } = await import("../../system/heal-ledger.js")
    //An air engulf's following phase answers the previous phase's card: its source is the attack card of the spirit
    //engulfing this actor, in the active GM's ledger, and the hits of the first attack no longer count (SR5 p. 399)
    let source = SR5_ActorHelper.toxinSourceOf(data)
    const engulfAttack = source ? null : await SR5_ActorHelper.engulfAttackFor(actor)
    const engulfPhase = !!engulfAttack
    if (engulfPhase) source = SR5_ActorHelper.toxinSourceOf({
      previousMessage: {
        messageId: engulfAttack
      }
    })
    if (engulfPhase && source?.weapon?.system?.toxin?.type !== "airEngulf") source = null
    const toxin = source ? foundry.utils.deepClone(source.weapon.system.toxin) : null
    const open = toxin ? SR5_Toxins.openVectors(actor.system, toxinVectors(toxin)) : []
    const pool = Math.max(0, ...open.map(v => Number(actor.system.resistances?.toxin?.[v]?.dicePool) || 0))
    const power = toxin ? toxinCardPower({
      power: toxin.power,
      toxinType: toxin.type,
      calledShot: source.card.combat?.calledShot?.name,
      engulfNetHits: engulfPhase ? 0 : bounded(source.answered?.roll?.netHits, source.card.roll?.hits),
      doses: data.toxinDoses,
      antitoxin: SR5_Toxins.antitoxinRating(actor.system),
    }) : 0
    const verdict = toxinCardVerdict({
      authorOwnsTarget: actor.testUserPermission(author, "OWNER"),
      sourceFound: !!toxin && open.length > 0,
      power,
      rollJSON: data.roll?.r,
      pool,
      edge: actor.system.specialAttributes?.edge?.augmented?.value,
      claimedHits: data.roll?.hits,
    })
    if (!verdict.ok) {
      await SR5_ActorHelper.whisperGM(game.i18n.format("SR5.ToxinCardRejected", {
        user: author.name, actor: actor.name
      }))
      return null
    }
    //An exact copy of the card is a new message with the same dice: known by its dice too (heal-ledger.js)
    const diceKey = healCardDiceKey(data)
    const keys = [consumedKey(message.id, "toxinEffect"), diceKey ? `${diceKey}|toxinEffect` : null].filter(Boolean)
    if (keys.some(key => SR5_MiscellaneousHelpers.isConsumed(key))) {
      await SR5_ActorHelper.whisperGM(game.i18n.format("SR5.ToxinCardSpent", {
        user: author.name, actor: actor.name
      }))
      return null
    }
    const damageType = toxin.damageType || ""
    const effects = Object.entries(toxin.effect ?? {
    }).filter(([, on]) => on).map(([key]) => game.i18n.localize(SR5.toxinEffects[key] ?? key)).join(", ")
    const esc = foundry.utils.escapeHTML
    const notes = verdict.mismatch ? `<p><strong>${game.i18n.format("SR5.ToxinCardMismatch", {
      hits: esc(String(data.roll?.hits ?? "?"))
    })}</strong></p>` : ""
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.ToxinCardConfirmTitle"
      },
      content: `<p>${game.i18n.format("SR5.ToxinCardConfirm", {
        user: esc(author.name), actor: esc(actor.name), toxin: esc(SR5_Toxins.nameOf(toxin, k => game.i18n.localize(k)) || source.weapon.name),
        weapon: esc(source.weapon.name), power, hits: verdict.hits,
        damage: damageType ? `${verdict.value}${game.i18n.localize(SR5.damageTypesShort[damageType])}` : "—",
        effects: esc(effects || "—"),
      })}</p>${notes}`,
      rejectClose: false,
    })
    if (!ok) return null
    for (const key of keys) if (!(await SR5_MiscellaneousHelpers.consume(key))) return null
    //A fresh card: only what the GM worked out (no ammunition, no matrix damage, no target read on the player's flags)
    const fresh = SR5_PrepareRollTest.getBaseRollData(null, actor)
    toxin.power = power
    fresh.damage.toxin = toxin
    //Fully resisted: no effect either (the button only comes with a damage value, test-Resistance.js)
    if (verdict.value <= 0) toxin.effect = {
    }
    fresh.damage.type = damageType
    fresh.damage.value = verdict.value
    //What the arcane inhibitor reads, as on the card before: the attack's damage value, read on the attack card
    fresh.damage.base = Number(source.card.damage?.value) || 0
    return fresh
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
