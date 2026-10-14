import {
  drainShown
} from "../roll-helpers/mentorMaskDrain.js"
import {
  spellAreaRadius
} from "../roll-helpers/spell-area.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  greyManaSustainedPenalty
} from "../../system/grey-mana.js"
import {
  underFireRules, bbPatientEntry
} from "../../system/bb-healing.js"
import {
  spellStabilizes, stabilizationLabelKey
} from "../../system/bb-healing-rules.js"
import {
  noiseGridThreshold, noiseSpellValue, noiseOverwatchDice
} from "../../system/noise-spells.js"
import {
  SR5
} from "../../config.js"

export default async function spellInfo(cardData){
  let actionType, label, item
  let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId, cardData.actorUuids)
  let actorData = actor.system
  if (cardData.owner.itemUuid) item = await fromUuid(cardData.owner.itemUuid)

  //Better Than Bad p. 140-141: a sustained spell cast while wearing grey mana loses 1 Force and 1 hit (GM ruling of 05/10)
  if (cardData.test.type === "spell" && !cardData.magic.greyManaPenalty && greyManaSustainedPenalty(actorData, item?.system?.duration)) {
    cardData.magic.force = Math.max(1, (cardData.magic.force || 0) - 1)
    cardData.roll.hits = Math.max(0, (cardData.roll.hits || 0) - 1)
    cardData.magic.greyManaPenalty = true
    ui.notifications.info(game.i18n.format("SR5.GreyManaSustainedSpell", {
      spell: item.name
    }))
  }

  //Add Resist Drain chat button
  if (cardData.test.type === "spell" || (cardData.test.type === "adeptPower" && cardData.magic.drain > 0)) {
    cardData.chatCard.buttons.drain = SR5_RollMessage.generateChatButton("nonOpposedTest", "drain", `${game.i18n.localize("SR5.ResistDrain")} (${drainShown(cardData, cardData.owner.actorId)})`)
  }

  //Mage Hunter (Forbidden Arcana p. 34): the counterspelling against this spell loses 2 dice per level, for the GM
  if (cardData.magic.mageHunter?.used) cardData.chatCard.buttons.mageHunter = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "",
    game.i18n.format("SR5.MageHunterCounterspell", {
      value: 2 * (cardData.magic.mageHunter.level || 0)
    }))

  //Blood magic (Street Grimoire p. 90, Forbidden Arcana p. 130): what the points were spent on, and the addiction test
  //that the sacrifice's points call for (never the martyr's)
  const blood = cardData.test.type === "spell" ? cardData.magic.bloodMagic : null
  if (blood && (blood.force || blood.drainMagic || blood.drain)) {
    cardData.chatCard.buttons.bloodMagic = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.format("SR5.BloodMagicSpent", {
      force: blood.force || 0, drainMagic: blood.drainMagic || 0, drain: blood.drain || 0, martyr: blood.fromMartyr || 0
    }))
    if (blood.fromPool > 0) cardData.chatCard.buttons.bloodAddiction = SR5_RollMessage.generateChatButton("nonOpposedTest", "bloodAddiction", game.i18n.format("SR5.BloodMagicAddictionTest", {
      threshold: blood.addictionThreshold ?? 2
    }))
  }

  //Increase / Decrease Noise (Street Grimoire p. 113-114): the net hits over the grid's threshold change the Noise of the
  //area, given by the spell's template; beyond 4, the Overwatch Score of the hackers affected rises, for the GM
  if (cardData.test.type === "spell" && cardData.magic.noiseSpell?.kind) {
    const threshold = Math.max(Number(cardData.threshold?.value) || 0, noiseGridThreshold(cardData.magic.noiseSpell.grid))
    const noise = noiseSpellValue(cardData.magic.noiseSpell.kind, cardData.roll.hits, threshold)
    const grid = game.i18n.localize(SR5.gridTypes[cardData.magic.noiseSpell.grid] ?? SR5.gridTypes.public)
    cardData.chatCard.buttons.noiseSpell = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", noise ?
      game.i18n.format("SR5.NoiseSpellResult", {
        noise: noise > 0 ? `+${noise}` : noise, grid, threshold
      }) :
      game.i18n.format("SR5.NoiseSpellNoEffect", {
        grid, threshold
      }))
    const overwatch = noiseOverwatchDice(Math.abs(noise))
    if (overwatch) cardData.chatCard.buttons.noiseOverwatch = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.format("SR5.NoiseSpellOverwatch", {
      dice: overwatch
    }))
  }

  //Roll Succeed
  if (cardData.roll.hits > 0) {
    //Handle Attack spell type
    if (cardData.magic.spell.category === "combat") {
      if (cardData.test.typeSub === "indirect") {
        actionType = "defenseRangedWeapon"
        label = game.i18n.localize("SR5.Defend")
        // Defense computes DV from damage.base + net hits (like ranged weapons): DV = Force + net hits, AP = -Force
        // Death Sower (Forbidden Arcana p. 40): DV +1 per level
        cardData.damage.base = cardData.magic.force + (cardData.magic.spell.damageBonus || 0)
        cardData.damage.value = cardData.damage.base
        cardData.combat.armorPenetration = -cardData.magic.force
        cardData.damage.resistanceType = "physicalDamage"
        // SR5 p. 285: an area is cast with a threshold of 3, like a grenade (p. 182)
        if (cardData.magic.spell.range === "area" && cardData.roll.hits >= 3) cardData.magic.spell.areaThreshold = 3
        else if (cardData.magic.spell.range === "area") {
          // Threshold missed: the spell still explodes, at DV = Force, scattered as a grenade (2D6 m minus 1 m per
          // hit, direction rolled, SR5 p. 182-183) by the card's Scatter button, which moves its template. As for a
          // grenade that scatters, the targets get no defense test (ruled by DjamZ, the book does not say).
          cardData.magic.spell.missedThreshold = true
          cardData.chatCard.buttons.scatter = SR5_RollMessage.generateChatButton("nonOpposedTest", "scatter", game.i18n.localize("SR5.Scatter"))
          actionType = "resistanceCard"
          label = game.i18n.localize("SR5.TakeOnDamageShort")
        }
      } else if (cardData.test.typeSub === "direct") {
        actionType = "resistanceCard"
        label = game.i18n.localize("SR5.ResistDirectSpell")
        // Death Sower (Forbidden Arcana p. 40): DV +1 per level
        cardData.damage.value = cardData.roll.hits + (cardData.magic.spell.damageBonus || 0)
        if (cardData.magic.spell.type === "mana") cardData.damage.resistanceType = "directSpellMana"
        else cardData.damage.resistanceType = "directSpellPhysical"
        cardData.damage.isAttack = true
      }
      //Generate Resist spell chat button
      cardData.chatCard.buttons[actionType] = SR5_RollMessage.generateChatButton("opposedTest", actionType, label)
    } else if (cardData.magic.spell.isResisted) {
      actionType = "spellResistance"
      label = game.i18n.localize("SR5.ResistSpell")
      cardData.chatCard.buttons[actionType] = SR5_RollMessage.generateChatButton("opposedTest", actionType, label)
    } 
			
    //Handle object resistance 
    if (cardData.magic.spell.objectCanResist){
      actionType = "objectResistance"
      label = game.i18n.localize("SR5.ObjectResistanceTest")
      cardData.chatCard.buttons[actionType] = SR5_RollMessage.generateChatButton("nonOpposedTest", actionType, label, {
        gmAction: true
      })
    }
			
    //Handle spell Area
    // A preparation's area is read from the item, where its Potency and Force take the place of the caster's (SR5 p. 309)
    if (cardData.magic.spell.range === "area" && cardData.test.type === "preparation") cardData.magic.spell.area += item.system.spellAreaOfEffect.value
    else if (cardData.magic.spell.range === "area"){
      //spell.areaShaping holds the metres of spell shaping chosen in the dialog: +1 m of radius per die given up (SR5 p. 329),
      //added to the radius, never multiplied. Area: Force metres; detection: Force × Magic, × 10 at extended range
      cardData.magic.spell.area = spellAreaRadius({
        shaping: cardData.magic.spell.areaShaping, force: cardData.magic.force, detection: item.system.category === "detection",
        magic: actorData.specialAttributes.magic.augmented.value, extended: item.system.spellAreaExtended === true
      })
      //Bubbles are declared at casting; which characters they cover is picked once the area is on the canvas, hence a
      //button rather than a dialog list. How many characters one bubble spares is a world setting (an approximation)
      if (cardData.magic.spell.sparedCount > 0) cardData.chatCard.buttons.spellShapingSpare = SR5_RollMessage.generateChatButton("nonOpposedTest", "spellShapingSpare", `${game.i18n.localize("SR5.SpellShapingSpare")} (0/${cardData.magic.spell.sparedCount})`)
    }

    //Bullets & Bandages p. 15-16: Stabilize (Force at least the boxes of bleeding and overflow) and Heal (out of the
    //overflow) stabilize the targeted patient; the GM applies it and checks it again (bb-healing.js)
    if (underFireRules() && cardData.test.type === "spell" && cardData.target.hasTarget){
      const patient = SR5_EntityHelpers.getRealActorFromID(cardData.target.actorId, cardData.actorUuids)
      const force = Math.min(Number(cardData.magic.force) || 0, 2 * (Number(actorData.specialAttributes?.magic?.augmented?.value) || 0))
      if (patient && spellStabilizes(item?.name, force, bbPatientEntry(patient), patient.system?.conditionMonitors?.overflow?.actual?.value)) cardData.chatCard.buttons.bbStabilize = SR5_RollMessage.generateChatButton("nonOpposedTest", "bbStabilize", game.i18n.localize(stabilizationLabelKey("SR5.BB_StabilizeButton", 0)), {
        gmAction: true
      })
    }
    //Invisibility, Mask (SR5 p. 294): whoever perceives the subject resists first, the hits are his threshold
    if (cardData.test.type === "spell" && item?.system?.illusionPierce) cardData.chatCard.buttons.illusionResistance = SR5_RollMessage.generateChatButton("opposedTest", "illusionResistance", game.i18n.localize("SR5.IllusionResist"))

    //Generate apply effect on Actor chat button
    if (cardData.effects.canApplyEffect) cardData.chatCard.buttons.applyEffect = SR5_RollMessage.generateChatButton("opposedTest", "applyEffect", game.i18n.localize("SR5.ApplyEffect"))
    //Generate apply effect on Item chat button
    if (cardData.effects.canApplyEffectOnItem) cardData.chatCard.buttons.applyEffectOnItem = SR5_RollMessage.generateChatButton("opposedTest", "applyEffectOnItem", game.i18n.localize("SR5.ApplyEffect"))
  } 

  //Roll failed
  else {
    if (cardData.test.type === "spell") label = game.i18n.localize("SR5.SpellCastingFailed")
    else if (cardData.test.type === "adeptPower" || cardData.test.type === "power") label = game.i18n.localize("SR5.PowerFailure")
    else label = game.i18n.localize("SR5.PreparationCreateFailed")
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", label)
  }
}