import {
  SR5 
} from "../../config.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_SocketHandler
} from "../../socket.js"
import {
  ELEMENTAL_SPIRIT_TYPES, elementalServices, wildBanishProgress, resolveLeash, wildBanishVerdict, leashCardVerdict, recountHits, testsLeash,
  leashThreshold
} from "../../entities/items/spirit-bonds.js"
import {
  isActiveGM, readLedger, banishKey, banishCardSeen, setBanishTotal
} from "../../system/spirit-ledger.js"
import {
  SR5_ActorHelper
} from "../../entities/actors/entityActor-helpers.js"
import {
  SR5_ConverterHelpers
} from "./converter.js"
import {
  sourceEntryOf, dispelledValue
} from "./dispel-rules.js"
import {
  SR5_RollTest 
} from "../roll-test.js"
import {
  SR5_PrepareRollTest 
} from "../roll-prepare.js"

// The warning shown when the owner of a resistance card was deleted: the ritual names its leader,
// every other resistance (summoning, compiling...) its author
export function resistanceOwnerMissingWarning(testType) {
  return testType === "ritual" ? "SR5.WARN_RitualLeaderMissing" : "SR5.WARN_ResistanceOwnerMissing"
}

// Weapons offered to the weapon break dialog (Run & Gun p. 125, the weapon resists as a barrier, SR5 p. 198). Plain {uuid, name} objects: selectOptions reads
// valueAttr as a key of each choice, so the select stayed empty with documents and 'this.uuid'.
export function weaponBreakChoices(actor) {
  return actor.items
    .filter(i => i.type === "itemWeapon" && i.system.isActive)
    .map(i => ({
      uuid: i.uuid, name: i.name
    }))
}

//Only what differs from the stored system goes to the GM: a prepared system sent whole carries
//derived fields, which the GM's checks (socket-guard.js) refuse as changes
function sourceChanges(item, system) {
  return foundry.utils.diffObject(item.toObject().system, system)
}

export class SR5_ThirdPartyHelpers {
  /** Handle spirit, sprite or preparation resistance
    * @param {Object} cardData - The origin cardData
    */
  static async createItemResistance(cardData, messageId) {
    let targetItem
    let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId, cardData.actorUuids)
    // The owner may have been deleted since the card was posted: stop here, the roll data needs it
    if (!actor) {
      SR5_SystemHelpers.srLog(1, `Resistance owner not found for '${cardData.owner.actorId}': resistance not rolled`)
      ui.notifications.warn(game.i18n.localize(resistanceOwnerMissingWarning(cardData.test.type)))
      return
    }
    let rollData = SR5_PrepareRollTest.getBaseRollData(null, actor)

    //Transfer basic info from previous message
    rollData.previousMessage.actorId = cardData.owner.actorId
    rollData.previousMessage.hits = cardData.roll.hits
    rollData.previousMessage.messageId = messageId

    //add roll info for Spirit resistance
    if (cardData.test.typeSub === "summoning"){
      rollData.magic.spiritType = cardData.magic.spiritType
      rollData.magic.force = cardData.magic.force
      rollData.test.type = "summoningResistance"
      rollData.test.title = `${game.i18n.localize("SR5.SummoningResistance")} (${rollData.previousMessage.hits})`
      rollData.dicePool.composition = [{
        source: game.i18n.localize("SR5.Force"), type: "linkedAttribute", value: rollData.magic.force
      }]
      rollData.dicePool.base = rollData.magic.force
      rollData.dicePool.value = rollData.magic.force
    }

    //add roll info for Sprite resistance
    else if (cardData.test.typeSub === "compileSprite"){
      rollData.matrix.spriteType = cardData.matrix.spriteType
      rollData.matrix.level = cardData.matrix.level
      rollData.test.type = "compilingResistance"
      rollData.test.title = `${game.i18n.localize("SR5.CompilingResistance")} (${rollData.previousMessage.hits})`
      rollData.dicePool.composition = [{
        source: game.i18n.localize("SR5.Level"), type: "linkedAttribute", value: rollData.matrix.level
      }]
      rollData.dicePool.base = rollData.matrix.level
      rollData.dicePool.value = rollData.matrix.level
    }

    //Spell Resistance
    else if (cardData.test.typeSub === "counterspelling"){
      targetItem = await fromUuid(cardData.target.itemUuid)
      //The targeted item may have been deleted since the card was posted: warn, open no dialog
      if (!targetItem?.system) return ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetItemMissing"))
      rollData.dicePool.value = targetItem.system.casterMagic + targetItem.system.force
      rollData.dicePool.composition = ([
        {
          source: game.i18n.localize("SR5.CasterMagic"), type: "linkedAttribute", value: targetItem.system.casterMagic
        },
        {
          source: game.i18n.localize("SR5.SpellForce"), type: "linkedAttribute", value: targetItem.system.force
        },
      ])
      if (targetItem.system.quickening && targetItem.actor?.system.magic?.metamagics?.quickening) {
        rollData.dicePool.value += targetItem.system.karmaSpent
        rollData.dicePool.composition.push({
          source: game.i18n.localize("SR5.MetamagicQuickening"), type: "metamagic", value: targetItem.system.karmaSpent
        })
      }
      rollData.dicePool.base = rollData.dicePool.value
      rollData.test.type = "dispellResistance"
      rollData.test.title = `${game.i18n.localize("SR5.SpellResistance")} (${targetItem.name})`
      rollData.target.itemUuid = cardData.target.itemUuid
    }

    //Enchantment Resistance
    else if (cardData.test.typeSub === "disenchanting"){
      targetItem = await fromUuid(cardData.target.itemUuid)
      //The targeted item may have been deleted since the card was posted: warn, open no dialog
      if (!targetItem?.system) return ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetItemMissing"))
      if (targetItem.type === "itemFocus") {
        rollData.dicePool.value = targetItem.parent.system.specialAttributes.magic.augmented.value + targetItem.system.itemRating
        rollData.test.type = "enchantmentResistance"
        rollData.test.title = `${game.i18n.localize("SR5.EnchantmentResistance")} (${targetItem.name})`
        rollData.dicePool.composition = ([
          {
            source: game.i18n.localize("SR5.CasterMagic"), type: "linkedAttribute", value: targetItem.parent.system.specialAttributes.magic.augmented.value
          },
          {
            source: game.i18n.localize("SR5.ItemRating"), type: "linkedAttribute", value: targetItem.system.itemRating
          },
        ])
      }
      if (targetItem.type === "itemPreparation") {
        rollData.dicePool.value = targetItem.parent.system.specialAttributes.magic.augmented.value + targetItem.system.force
        rollData.test.type = "disjointingResistance"
        rollData.test.typeSub = "preparation"
        rollData.test.title = `${game.i18n.localize("SR5.DisjointingResistance")} (${targetItem.name})`
        rollData.dicePool.composition = ([
          {
            source: game.i18n.localize("SR5.CasterMagic"), type: "linkedAttribute", value: targetItem.parent.system.specialAttributes.magic.augmented.value
          },
          {
            source: game.i18n.localize("SR5.ItemRating"), type: "linkedAttribute", value: targetItem.system.force
          },
        ])
      }
      rollData.dicePool.base = rollData.dicePool.value
      rollData.test.title = `${game.i18n.localize("SR5.SpellResistance")} (${targetItem.name})`
      rollData.target.itemUuid = cardData.target.itemUuid
    }

    //Preparation resistance
    if (cardData.test.type === "preparationFormula"){
      rollData.dicePool.value = cardData.magic.force
      rollData.dicePool.base = rollData.dicePool.value
      rollData.owner.itemId = cardData.owner.itemId
      rollData.magic.force = cardData.magic.force
      rollData.magic.preparationTrigger = cardData.magic.preparationTrigger
      rollData.owner.itemUuid = cardData.owner.itemUuid
      rollData.test.type = "preparationResistance"
      rollData.test.title = `${game.i18n.localize("SR5.PreparationResistance")} (${rollData.previousMessage.hits})`
    }

    //Ritual resistance
    else if (cardData.test.type === "ritual"){
      rollData.dicePool.value = cardData.magic.force * 2
      rollData.dicePool.base = rollData.dicePool.value
      rollData.dicePool.composition = [
        {
          source: game.i18n.localize("SR5.Force"), type: "linkedAttribute", value: rollData.magic.force
        },
        {
          source: game.i18n.localize("SR5.Force"), type: "linkedAttribute", value: rollData.magic.force
        },
      ]
      rollData.owner.itemId = cardData.owner.itemId
      rollData.owner.itemUuid = cardData.owner.itemUuid
      rollData.magic.force = cardData.magic.force
      rollData.magic.reagentsSpent = cardData.magic.reagentsSpent
      rollData.magic.reagentTier = cardData.magic.reagentTier
      rollData.magic.reagentForeign = cardData.magic.reagentForeign
      rollData.magic.reagentsEffective = cardData.magic.reagentsEffective
      rollData.magic.reagentDrainReduction = cardData.magic.reagentDrainReduction
      rollData.magic.ritualParticipants = cardData.magic.ritualParticipants || []
      rollData.test.type = "ritualResistance"
      rollData.test.title = `${game.i18n.localize("SR5.RitualResistance")} (${rollData.previousMessage.hits})`
    }

    //Complex form resistance
    else if (cardData.test.type === "resonanceAction" && cardData.test.typeSub === "killComplexForm"){
      targetItem = await fromUuid(cardData.target.itemUuid)
      //The targeted item may have been deleted since the card was posted: warn, open no dialog
      if (!targetItem?.system) return ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetItemMissing"))
      rollData.dicePool.value = targetItem.system.threaderResonance + targetItem.system.level
      rollData.dicePool.base = rollData.dicePool.value
      rollData.dicePool.composition = ([
        {
          source: game.i18n.localize("SR5.ThreaderResonance"), type: "linkedAttribute", value: targetItem.system.threaderResonance
        },
        {
          source: game.i18n.localize("SR5.Level"), type: "linkedAttribute", value: targetItem.system.level
        },
      ])
      rollData.target.itemUuid = cardData.target.itemUuid
      rollData.test.type = "complexFormResistance"
      rollData.test.title = `${game.i18n.localize("SR5.ComplexFormResistance")} (${targetItem.name})`
    }

    //Escape Engulf
    else if (cardData.test.type === "escapeEngulf"){
      let spirit = SR5_EntityHelpers.getRealActorFromID(cardData.previousMessage.actorId, cardData.actorUuids)
      rollData.dicePool.value = spirit.system.attributes.body.augmented.value + spirit.system.specialAttributes.magic.augmented.value
      rollData.dicePool.base = rollData.dicePool.value
      rollData.dicePool.composition = ([
        {
          source: game.i18n.localize("SR5.Body"), type: "linkedAttribute", value: spirit.system.attributes.body.augmented.value
        },
        {
          source: game.i18n.localize("SR5.Magic"), type: "linkedAttribute", value: spirit.system.specialAttributes.magic.augmented.value
        },
      ])
      rollData.test.type = "engulfResistance"
      rollData.test.title = `${game.i18n.localize("SR5.SpiritResistance")} (${rollData.previousMessage.hits})`
    }

    //Weapon break Resistance
    else if (cardData.test.type === "defense"){
      let activeWeapons = weaponBreakChoices(actor)
      if (activeWeapons.length === 0) return ui.notifications.warn(game.i18n.localize('SR5.WARN_NoEquippedWeapon'))

      let dialogData = {
          list: SR5.barrierTypes,
          weaponList: activeWeapons,
        },
        barrierType, weapon
            
      const tpDlg = await foundry.applications.handlebars.renderTemplate("systems/sr5/templates/interface/chooseWeaponMaterial.hbs", dialogData)
      const tpResult = await foundry.applications.api.DialogV2.wait({
        window: {
          title: game.i18n.localize('SR5.ChooseWeaponMaterial') 
        },
        content: tpDlg,
        buttons: [
          {
            action: "ok",
            label: "Ok",
            default: true,
            callback: (event, button, dialog) => ({
              action: "ok", element: dialog.element 
            }),
          },
          {
            action: "cancel",
            label: "Cancel",
            callback: () => ({
              action: "cancel" 
            }),
          },
        ],
        rejectClose: false,
      })
      if (!tpResult || tpResult.action !== "ok") return
      barrierType = tpResult.element.querySelector("[name=barrierType]").value
      weapon = tpResult.element.querySelector("[name=weapon]").value
      if (!weapon) return ui.notifications.warn(game.i18n.localize('SR5.WARN_NoEquippedWeapon'))

      let structure = SR5_ConverterHelpers.barrierTypeToStructure(barrierType)
      let armor = SR5_ConverterHelpers.barrierTypeToArmor(barrierType)

      rollData.dicePool.value = armor + structure
      rollData.dicePool.base = rollData.dicePool.value
      rollData.dicePool.composition = ([
        {
          source: game.i18n.localize("SR5.Armor"), type: "linkedAttribute", value: armor
        },
        {
          source: game.i18n.localize("SR5.Structure"), type: "linkedAttribute", value: structure
        },
      ])
      rollData.damage.value = cardData.damage.value
      rollData.test.type = "weaponResistance"
      rollData.combat.structure = structure
      rollData.combat.barrierArmor = armor
      rollData.combat.armorPenetration = cardData.combat.armorPenetration ?? 0
      rollData.target.itemUuid = weapon
      rollData.target.actorId = cardData.owner.actorId
    }

    rollData.roll = await SR5_RollTest.rollDice({
      dicePool: rollData.dicePool.value 
    })

    await SR5_RollTest.addInfoToCard(rollData, cardData.owner.actorId)
    SR5_RollTest.renderRollCard(rollData)
  }

  //Banishing a wild spirit (Forbidden Arcana p. 172): the active gamemaster alone adds the banisher's net hits to the
  //spirit's running total, kept in his ledger. Neither card is believed as written: who wrote each one is checked,
  //their hits are counted again on their dice within the pools he works out, and he confirms
  static async wildBanish(cardData){
    if (!isActiveGM()) return void ui.notifications.warn(game.i18n.localize("SR5.WildBanishGMOnly"))
    const resistanceMessage = game.messages.get(cardData.owner?.messageId)
    const banishingMessage = game.messages.get(cardData.previousMessage?.messageId)
    const banishingData = banishingMessage?.flags?.sr5data
    const spirit = SR5_EntityHelpers.getRealActorFromID(cardData.owner.speakerId || cardData.owner.actorId)
    const banisher = SR5_EntityHelpers.getRealActorFromID(banishingData?.owner?.speakerId || banishingData?.owner?.actorId)
    const reject = async (reason) => {
      await ChatMessage.create({
        whisper: ChatMessage.getWhisperRecipients("GM"),
        content: `<p>${game.i18n.format("SR5.WildBanishRejected", {
          user: resistanceMessage?.author?.name ?? "?", reason: game.i18n.localize(`SR5.SpiritCardReject_${reason}`)
        })}</p>`,
      })
      return false
    }
    if (!spirit?.system?.isWild || !banisher || !resistanceMessage || !banishingMessage) return reject("missing")
    const ledger = readLedger()
    if (banishCardSeen(ledger, banishingMessage.id)) return reject("seen")
    const force = spirit.system.force.value
    const resistanceAuthor = resistanceMessage.author
    const verdict = wildBanishVerdict({
      banisherAuthorOwns: !!banishingMessage.author && banisher.testUserPermission(banishingMessage.author, "OWNER"),
      resistanceAuthorOwns: !!resistanceAuthor && (resistanceAuthor.isGM || spirit.testUserPermission(resistanceAuthor, "OWNER")),
      banisherRoll: banishingData.roll?.r,
      banisherPool: banisher.system.skills?.banishing?.test?.dicePool,
      banisherEdge: banisher.system.specialAttributes?.edge?.augmented?.value,
      astralLimit: banisher.system.limits?.astralLimit?.value,
      spiritRoll: cardData.roll?.r,
      force,
    })
    if (!verdict.ok) return reject(verdict.reason)
    const total = Number(ledger.banish?.[banishKey(spirit)]) || 0
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.WildBanishAdd"
      },
      content: `<p>${game.i18n.format("SR5.WildBanishConfirm", {
        banisher: banisher.name, spirit: spirit.name, banisherHits: verdict.banisherHits, spiritHits: verdict.spiritHits,
        total, goal: force * 2, claimed: banishingData.roll?.hits ?? "?", claimedSpirit: cardData.roll?.hits ?? "?",
      })}</p>`,
      rejectClose: false,
    })
    if (!confirmed) return false
    const progress = wildBanishProgress(total, verdict.netHits, force)
    await setBanishTotal(banishKey(spirit), progress.dissipated ? 0 : progress.total, banishingMessage.id)
    const text = progress.dissipated ? game.i18n.format("SR5.INFO_WildSpiritDissipated", {
      name: spirit.name
    }) : game.i18n.format("SR5.INFO_WildBanishProgress", {
      name: spirit.name, total: progress.total, goal: force * 2
    })
    ui.notifications.info(text)
    await ChatMessage.create({
      content: text, whisper: ChatMessage.getWhisperRecipients("GM")
    })
    return true
  }

  //Testing the Leash (Forbidden Arcana p. 176, optional rule): the gamemaster rolls both sides himself, the spirit's
  //Force x 2 against the controller's Drain resistance pool, read from the actors and never from the card.
  //The card says which spirit and what it rolled: its author must own the controller (or be the gamemaster), the
  //spirit must be one the controller summoned, and the hits that trigger the test are counted again on its dice,
  //within the spirit's largest pool plus its Chance; then the gamemaster confirms
  static async leashTest(cardData){
    if (!game.user.isGM) return void ui.notifications.warn(game.i18n.localize("SR5.LeashGMOnly"))
    if (!game.settings.get("sr5", "spiritLeash")) return false
    const message = game.messages.get(cardData.owner?.messageId)
    const spirit = SR5_EntityHelpers.getRealActorFromID(cardData.owner.speakerId || cardData.owner.actorId)
    if (spirit?.type !== "actorSpirit" || !message) return false
    const controller = SR5_EntityHelpers.getRealActorFromID(spirit.system.creatorId)
    const item = controller?.items.get(spirit.system.creatorItemId)
    if (!controller || !item) return void ui.notifications.warn(game.i18n.localize("SR5.LeashNoController"))
    const rejectLeash = async (reason) => {
      await ChatMessage.create({
        whisper: ChatMessage.getWhisperRecipients("GM"),
        content: `<p>${game.i18n.format("SR5.LeashRejected", {
          user: message.author?.name ?? "?", reason: game.i18n.localize(`SR5.SpiritCardReject_${reason}`)
        })}</p>`,
      })
      return false
    }
    const verdict = leashCardVerdict({
      authorIsGM: !!message.author?.isGM,
      authorOwnsController: !!message.author && controller.testUserPermission(message.author, "OWNER"),
      spiritOfController: item.type === "itemSpirit",
    })
    if (!verdict.ok) return rejectLeash(verdict.reason)
    if (spirit.system.isElemental || item.system.isElemental) return false
    const force = spirit.system.force.value
    //Its skills and its powers: the card does not tell which test it was, and its type is the author's to write
    const largestPool = Math.max(0, ...Object.values(spirit.system.skills ?? {
    }).map(s => Number(s?.test?.dicePool) || 0), ...spirit.items.map(i => Number(i.system?.test?.dicePool) || 0))
    const hits = recountHits(cardData.roll?.r, largestPool, spirit.system.specialAttributes?.edge?.augmented?.value)
    if (hits === null) return rejectLeash("dice")
    if (!testsLeash({
      hits, force, services: spirit.system.services.value
    })) return rejectLeash("threshold")
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.LeashTest"
      },
      content: `<p>${game.i18n.format("SR5.LeashConfirm", {
        spirit: spirit.name, controller: controller.name, hits, claimed: cardData.roll?.hits ?? "?", threshold: leashThreshold(force)
      })}</p>`,
      rejectClose: false,
    })
    if (!confirmed) return false
    const spiritRoll = await SR5_RollTest.rollDice({
      dicePool: force * 2
    })
    const controllerRoll = await SR5_RollTest.rollDice({
      dicePool: controller.system.magic?.drainResistance?.dicePool || 0
    })
    const outcome = resolveLeash({
      controllerHits: controllerRoll.hits,
      spiritHits: spiritRoll.hits,
      tight: item.system.leashTight,
      force,
      magic: controller.system.specialAttributes?.magic?.augmented?.value || 0,
      services: spirit.system.services.value,
    })
    const damageOptions = (value, type) => ({
      damage: {
        value, type, matrix: {
          value: 0
        }
      },
      combat: {
        ammo: {
        }
      },
      owner: {
      },
    })
    if (outcome.spiritStun) await SR5_ActorHelper.takeDamage(spirit.id, damageOptions(outcome.spiritStun, "stun"))
    if (outcome.controllerDamage) await SR5_ActorHelper.takeDamage(controller.id, damageOptions(outcome.controllerDamage, outcome.damageType))
    if (outcome.servicesLost) {
      await spirit.update({
        "system.services.value": outcome.servicesLeft
      })
      await item.update({
        "system.services.value": outcome.servicesLeft
      })
    }
    let content = game.i18n.format("SR5.LeashResult", {
      spirit: spirit.name, controller: controller.name, spiritHits: spiritRoll.hits, controllerHits: controllerRoll.hits,
      stun: outcome.spiritStun, lost: outcome.servicesLost, damage: outcome.controllerDamage,
    })
    if (outcome.servicesLost && outcome.servicesLeft === 0) content += `<br>${game.i18n.localize("SR5.LeashBroken")}`
    await ChatMessage.create({
      content, whisper: ChatMessage.getWhisperRecipients("GM")
    })
    return true
  }

  static async reduceSideckickService(cardData){
    let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.speakerId, cardData.actorUuids),
      actorData = foundry.utils.duplicate(actor.system),
      key

    if (actor.type === "actorSprite"){
      key = "tasks"
      ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format('SR5.INFO_TasksReduced', {
        task: cardData.roll.netHits
      })}`)
    } else if (actor.type === "actorSpirit"){
      key = "services"
      ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format('SR5.INFO_ServicesReduced', {
        service: cardData.roll.netHits
      })}`)
    }
    actorData[key].value -= cardData.roll.netHits
    if (actorData[key].value < 0) actorData[key].value = 0
    await actor.update({
      'system': actorData
    })
  }

  static async enslavedSidekick(cardData, type){
    let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.speakerId, cardData.actorUuids)
    let actorData = foundry.utils.duplicate(actor.system)

    if (type === "registerSprite"){
      actorData.isRegistered = true
      actorData.tasks.value += cardData.roll.netHits
      actorData.tasks.max += cardData.roll.netHits
      ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format('SR5.INFO_SpriteRegistered', {
        task: cardData.roll.netHits
      })}`)
    } else if (type === "bindSpirit"){
      //Elemental trait (Forbidden Arcana p. 175): one more service when the binding gives at least one
      const gained = elementalServices(cardData.roll.netHits, actorData.isElemental)
      actorData.isBounded = true
      actorData.services.value += gained
      actorData.services.max += gained
      ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format('SR5.INFO_SpiritBounded', {
        service: cardData.roll.netHits
      })}`)
    }
    await actor.update({
      'system': actorData
    })
        
    if (actorData.creatorItemId){
      let creator = SR5_EntityHelpers.getRealActorFromID(actorData.creatorId)
      let itemSideKick = creator.items.find(i => i.id === actorData.creatorItemId)
      let itemData = foundry.utils.duplicate(itemSideKick.system)
      if (type === "registerSprite"){
        itemData.isRegistered = true
        itemData.tasks.value += cardData.roll.netHits
        itemData.tasks.max += cardData.roll.netHits
      } else if (type === "bindSpirit"){
        const gained = elementalServices(cardData.roll.netHits, actorData.isElemental)
        itemData.isBounded = true
        itemData.services.value += gained
        itemData.services.max += gained
      }
      await itemSideKick.update({
        'system': itemData
      })
    }
  }

  static async desactivateFocus(cardData){
    let item = await fromUuid(cardData.target.itemUuid)
    if (!item?.system) return ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetItemMissing"))
    let itemData = foundry.utils.duplicate(item.system)
        
    itemData.isActive = false
    if (!game.user?.isGM){
      //The GM reads the card again before switching off a focus its sender may not own (socket-guard.js)
      SR5_SocketHandler.emitForGM("updateItem", {
        item: cardData.target.itemUuid,
        info: sourceChanges(item, itemData),
        use: "deactivateFocus", messageId: cardData.owner?.messageId,
      })
    } else await item.update({
      'system': itemData
    })
  }

  static async reduceTransferedEffect(cardData){
    let targetedEffect = await fromUuid(cardData.target.itemUuid)
    if (!targetedEffect?.system) return ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetItemMissing"))
    let newEffect = foundry.utils.duplicate(targetedEffect.system),
      key = "hits"

    if (targetedEffect.type ==="itemPreparation") key = "potency"
    newEffect[key] -= cardData.roll.netHits

    //If item hits are reduce to 0, delete it
    if (newEffect[key] <= 0){
      newEffect[key] = 0
      newEffect.isActive = false
      if (newEffect.targetOfEffect) {
        for (let e of newEffect.targetOfEffect){
          let effect = await fromUuid(e)
          if (!game.user?.isGM) SR5_SocketHandler.emitForGM("deleteItem", {
            item: e, use: "dispelledEffect", messageId: cardData.owner?.messageId,
          })
          else if (effect) await effect.delete()
        }
      }
      newEffect.targetOfEffect = []
      //else, update effect linked
    } else if (key !== "potency"){
      if (newEffect.targetOfEffect) {
        for (let e of newEffect.targetOfEffect){
          let effect = await fromUuid(e)
          if (!effect) continue
          //A copy of the stored system: the live one used to be changed in place
          let updatedEffect = effect.toObject().system
          //SR5 p. 298: only an effect whose value came from the hits loses some; an Armor +2 stays at 2 (it used to
          //become the hits left)
          const custom = Object.values(updatedEffect.customEffects ?? {
          })
          const entry = custom.length ? sourceEntryOf(newEffect.customEffects, custom[0].target, custom[0].category) :
            sourceEntryOf(newEffect.itemEffects, updatedEffect.target, null, k => SR5_EntityHelpers.getLabelByKey(k))
          const value = dispelledValue(entry, updatedEffect.value, cardData.roll.netHits)
          if (value === null) continue
          updatedEffect.value = value
          for (let cs of custom) cs.value = value
          if (!game.user?.isGM){
            SR5_SocketHandler.emitForGM("updateItem", {
              item: e,
              info: sourceChanges(effect, updatedEffect),
              use: "reduceEffect", messageId: cardData.owner?.messageId,
            })
          } else await effect.update({
            'system': updatedEffect
          })
        }
      }
    }

    //Update item
    if (!game.user?.isGM){
      SR5_SocketHandler.emitForGM("updateItem", {
        item: cardData.target.itemUuid,
        info: sourceChanges(targetedEffect, newEffect),
        use: "reduceEffect", messageId: cardData.owner?.messageId,
      })
    } else await targetedEffect.update({
      'system': newEffect
    })
  }

  static async sealRitual(cardData){
    let item = await fromUuid(cardData.owner.itemUuid),
      itemData = foundry.utils.duplicate(item.system)
        
    itemData.isActive = true
    if (!game.user?.isGM){
      SR5_SocketHandler.emitForGM("updateItem", {
        item: cardData.owner.itemUuid,
        info: itemData,
      })
    } else await item.update({
      'system': itemData
    })
  }

  static async applyEffectToItem(info, type){
    let item = await fromUuid(info.target.itemUuid)
    if (!item) return ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetItemMissing"))
    item = item.toObject(false)
    let actor = SR5_EntityHelpers.getRealActorFromID(info.target.actorId)
    let effect

    if (type === "decreaseAccuracy"){
      effect = {
        "name": game.i18n.localize("SR5.WeaponBroken"),
        "target": "system.accuracy",
        "wifi": false,
        "type": "value",
        "value": -1,
        "multiplier": 1
      }
    }

    if (type === "decreaseReach"){
      effect = {
        "name": game.i18n.localize("SR5.WeaponBroken"),
        "target": "system.reach",
        "wifi": false,
        "type": "value",
        "value": -1,
        "multiplier": 1
      }
    }

    item.system.itemEffects.push(effect)
    await actor.updateEmbeddedDocuments("Item", [item])
  }

  //Build a sidekick item
  static async buildItem(messageData, itemType, actor){
    let actorData = actor.system
    let buildItem

    switch (itemType){
      case"summonSpirit": {
        //Hermetic elementalist (Forbidden Arcana p. 175): his air, earth, fire and water spirits have the Elemental
        //trait, which adds a service when at least one is owed
        const isElemental = !!actorData.magic?.hermeticElementalist && ELEMENTAL_SPIRIT_TYPES.includes(messageData.magic.spiritType)
        const services = elementalServices(messageData.previousMessage.hits - messageData.roll.hits, isElemental)
        buildItem = {
          name: `${game.i18n.localize("SR5.SummonedSpirit")} (${game.i18n.localize(SR5.spiritTypes[messageData.magic.spiritType])}, ${messageData.magic.force})`,
          type: "itemSpirit",
          img: `systems/sr5/assets/img/items/itemSpirit.svg`,
          ["system.type"]: messageData.magic.spiritType,
          ["system.itemRating"]: messageData.magic.force,
          ["system.services.max"]: services,
          ["system.services.value"]: services,
          ["system.isElemental"]: isElemental,
          ["system.summonerMagic"]: actorData.specialAttributes.magic.augmented.value,
          ["system.magic.tradition"]: actorData.magic.tradition,
          ["system.conjurer"]: actor.id,
        }
        ui.notifications.info(`${actor.name} ${game.i18n.localize("SR5.INFO_SummonSpirit")} ${game.i18n.localize(SR5.spiritTypes[messageData.magic.spiritType])} (${messageData.magic.force})`)
        break
      }
      case "compileSprite":
        buildItem = {
          name: `${game.i18n.localize("SR5.CompiledSprite")} (${game.i18n.localize(SR5.spriteTypes[messageData.matrix.spriteType])}, ${messageData.matrix.level})`,
          type: "itemSprite",
          img: `systems/sr5/assets/img/items/itemSprite.svg`,
          ["system.type"]: messageData.matrix.spriteType,
          ["system.itemRating"]: messageData.matrix.level,
          ["system.tasks.max"]: messageData.previousMessage.hits - messageData.roll.hits,
          ["system.tasks.value"]: messageData.previousMessage.hits - messageData.roll.hits,
          ["system.compilerResonance"]: actorData.specialAttributes.resonance.augmented.value,
          ["system.description"]: `${game.i18n.localize(SR5.spriteTypesDescription[messageData.matrix.spriteType])}`,
          ["system.compiler"]: actor.id,
        }
        ui.notifications.info(`${actor.name} ${game.i18n.localize("SR5.INFO_CompileSprite")} ${game.i18n.localize(SR5.spriteTypes[messageData.matrix.spriteType])} (${messageData.matrix.level})`)
        break
      case "createPreparation": {
        let preparation = actor.items.find(i => i.uuid === messageData.owner.itemUuid)
        buildItem = {
          "system": preparation.system
        }
        buildItem = foundry.utils.mergeObject(buildItem, {
          name: `${game.i18n.localize("SR5.Preparation")}${game.i18n.localize("SR5.Colons")} ${preparation.name}`,
          type: "itemPreparation",
          img: `systems/sr5/assets/img/items/itemPreparation.svg`,
          ["system.trigger"]: messageData.magic.preparationTrigger,
          ["system.potency"]: messageData.previousMessage.hits - messageData.roll.hits,
          ["system.force"]: messageData.magic.force,
          ["system.freeSustain"]: true,
          ["system.hits"]: 0,
          ["system.drainValue"]:preparation.system.drainValue,
        })
        ui.notifications.info(`${actor.name} ${game.i18n.localize("SR5.INFO_CreatePreparation")} ${preparation.name}`)
        break
      }
      default: 
        SR5_SystemHelpers.srLog(1, `Unknown '${itemType}' type in 'buildItem()'`)
    }

    await actor.createEmbeddedDocuments("Item", [buildItem])
  }
}
