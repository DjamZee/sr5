import {
  bbPenaltyReduction
} from "../../system/bb-healing.js"
import {
  woundResolveHolds
} from "../../system/wound-resolve.js"
import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"
import {
  masteryFreeSustainedSpells, illusionistLevelsByType
} from "../items/magic-masteries.js"
import {
  homunculusMaterialRatings
} from "./homunculus.js"
import {
  limitAttributeValue
} from "./poolOnlyAttribute.js"
import {
  isOriginalStrainMonad, matrixEntityConcentration, monitorSize, corePenalty
} from "../../system/monad-matrix.js"
import {
  SR5 
} from "../../config.js"
import {
  streamOf, sourcererFreeSustain
} from "./technomancer-streams.js"
import {
  crashArmorPenetration
} from "../../system/vehicle-mods.js"

// Health and defense: wound and sustaining penalties, condition monitors, defenses, armor, resistances.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
// SR5_CharacterUtility itself, given by utilityActor.js (importing it here would make an import cycle)
let SR5_CharacterUtility
export function linkHealthUtility(characterUtility) {
  SR5_CharacterUtility = characterUtility
}

export class SR5_CharacterHealthUtility {

  static updatePenalties(actor) {
    if (!actor) { SR5_SystemHelpers.srLog(1, `Missing or invalid actor in call to 'updatePenalties()'`); return }
    if (!actor.system.penalties) { SR5_SystemHelpers.srLog(1, `No penalties properties for '${actor.name}' actor in call to 'updatePenalties()'`); return }
    let actorData = actor.system

    for (let key of Object.keys(SR5.penaltyTypes)) {
      switch (key) {
        case "physical":
        case "stun":
        case "condition":
          if (actorData.conditionMonitors[key]) {
            SR5_EntityHelpers.updateValue(actorData.penalties[key].step)
            SR5_EntityHelpers.updateValue(actorData.penalties[key].boxReduction)
            actorData.penalties[key].actual.base = -Math.floor((actorData.conditionMonitors[key].actual.value - actorData.penalties[key].boxReduction.value) / actorData.penalties[key].step.value)
            if (actorData.specialProperties.doublePenalties) actorData.penalties[key].actual.base = actorData.penalties[key].actual.base * 2
            if (actorData.penalties[key].actual.base > 0) actorData.penalties[key].actual.base = 0
            //Deus vult ! / Mon pays (Manuel de l'assassin p. 14-15): « ignore tous les modificateurs de blessure »
            if (woundResolveHolds(actor)) actorData.penalties[key].actual.base = 0
          }
          break
        case "matrix":
          actorData.penalties[key].actual.base = 0
          SR5_CharacterUtility.handleSustaining(actor, "itemComplexForm", key)
          break
        case "magic":
          actorData.penalties[key].actual.base = 0
          SR5_CharacterUtility.handleSustaining(actor, "itemSpell", key)
          //A spirit held on a tight leash counts as a sustained spell (Forbidden Arcana p. 176, optional rule)
          if (game.settings.get("sr5", "spiritLeash")) {
            for (let i of actor.items) {
              if (i.type === "itemSpirit" && i.system.leashTight && !i.system.isElemental && i.system.services?.value > 0) {
                SR5_EntityHelpers.updateModifier(actorData.penalties[key].actual, `${game.i18n.localize('SR5.LeashTight')} (${i.name})`, "leash", -2)
              }
            }
          }
          break
        case "special":
          actorData.penalties[key].actual.base = 0
          break
        default:
          SR5_SystemHelpers.srLog(1, `Unknown '${key}' penalty type in 'updatePenalties()'`)
      }

      SR5_EntityHelpers.updateValue(actorData.penalties[key].actual)
      // Assure penalty is not a positive number
      if (actorData.penalties[key].actual.value > 0) actorData.penalties[key].actual.value = 0
    }

    if ((actor.type === "actorPc" || actor.type === "actorSpirit") && actorData.conditionMonitors.physical && actorData.conditionMonitors.stun) {
      actorData.penalties.condition.actual.base = actorData.penalties.physical.actual.base + actorData.penalties.stun.actual.base
      // Bullets & Bandages p. 15: a stabilization lowers the wound modifiers for a while, never above 0
      const bbReduction = Math.min(bbPenaltyReduction(actor), -actorData.penalties.condition.actual.base)
      if (bbReduction > 0) SR5_EntityHelpers.updateModifier(actorData.penalties.condition.actual, game.i18n.localize("SR5.BB_Stabilized"), "bbStabilization", bbReduction)
      SR5_EntityHelpers.updateValue(actorData.penalties.condition.actual)
      //A wound modifier reduced by an effect (trauma damper, Chrome Flesh p. 123) never turns into a bonus
      if (actorData.penalties.condition.actual.value > 0) actorData.penalties.condition.actual.value = 0
    }

    // Core damage of a Monad of the original strain gives wound modifiers, as for an AI (Data Trails p. 161,
    // Dark Terrors p. 88; arbitrage de DjamZ, 06/10). Same step and box reduction as the other wounds
    if (actorData.conditionMonitors?.core) {
      const condition = actorData.penalties.condition
      // A grunt's single monitor sets its step; a character's is the one of its Physical monitor
      const scale = actorData.conditionMonitors.physical ? actorData.penalties.physical : condition
      const coreMod = corePenalty(actorData.conditionMonitors.core.actual.value, scale.step?.value, scale.boxReduction?.value)
      if (coreMod) {
        SR5_EntityHelpers.updateModifier(condition.actual, game.i18n.localize("SR5.CoreMonitor"), "penaltyCore", coreMod)
        SR5_EntityHelpers.updateValue(condition.actual)
        if (condition.actual.value > 0) condition.actual.value = 0
      }
    }

    if (actor.type === "actorDrone") {
      SR5_EntityHelpers.updateModifier(actorData.attributes.handling.augmented, game.i18n.localize('SR5.Penalty'), "penaltyDamage", actorData.penalties.condition.actual.value)
      SR5_EntityHelpers.updateModifier(actorData.attributes.handlingOffRoad.augmented, game.i18n.localize('SR5.Penalty'), "penaltyDamage", actorData.penalties.condition.actual.value)
      SR5_EntityHelpers.updateModifier(actorData.attributes.speed.augmented, game.i18n.localize('SR5.Penalty'), "penaltyDamage", actorData.penalties.condition.actual.value)
      SR5_EntityHelpers.updateModifier(actorData.attributes.speedOffRoad.augmented, game.i18n.localize('SR5.Penalty'), "penaltyDamage", actorData.penalties.condition.actual.value)
      SR5_EntityHelpers.updateValue(actorData.attributes.handling.augmented, 0)
      SR5_EntityHelpers.updateValue(actorData.attributes.handlingOffRoad.augmented, 0)
      SR5_EntityHelpers.updateValue(actorData.attributes.speed.augmented, 0)
      SR5_EntityHelpers.updateValue(actorData.attributes.speedOffRoad.augmented, 0)
    }

  }

  static applyPenalty(penalty, property, actor) {
    if (actor.type === "actorDrone") { return }
    if (!penalty || !property || !actor) { SR5_SystemHelpers.srLog(1, `Missing or invalid parameter in call to 'applyPenalty()'`); return }
    if (!actor.system.penalties) { SR5_SystemHelpers.srLog(3, `No existing penalties on '${actor.name}' actor in call to 'applyPenalty()'`); return }
    let actorData = actor.system
    let details = []

    switch (penalty) {
      case "condition":
      case "matrix":
      case "magic":
        if (actorData.penalties[penalty].actual.value) {
          SR5_EntityHelpers.updateModifier(property, `${game.i18n.localize(SR5.modifiersTypes[`penalty${penalty}`])}`, `penalty${penalty}`, actorData.penalties[penalty].actual.value)
        }
        break
      case "special":
        if (actorData.penalties[penalty].actual.value) {
          for (let mod of actorData.penalties.special.actual.modifiers) {
            let detail = {
              source: mod.source,
              type: mod.type,
              value: mod.value,
            }
            details.push(detail)
          }
          //The label names its sources: "Effet spécial" alone left the player guessing (lot R2: a suppressive fire's -6)
          const sources = [...new Set(details.map(d => d.source).filter(Boolean))].join(", ")
          const label = game.i18n.localize(SR5.modifiersTypes[`penalty${penalty}`]) + (sources ? ` (${sources})` : "")
          SR5_EntityHelpers.updateModifier(property, label, `penalty${penalty}`, actorData.penalties[penalty].actual.value, false, true, details)
        }
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown penalty type '${penalty}' in 'applyPenalty()'`)
        return
    }
  }

  // Handle sustaining modifiers
  static handleSustaining(actor, itemType, concentrationType) {
    let sustainedMod = 2

    //Check sustaining mod.
    for (let i of actor.items) {
      if (i.system.systemEffects) {
        for (let is of Object.values(i.system.systemEffects)) {
          if (is.value === "sustainingMod1" && i.system.isActive) sustainedMod = 1
        }
      }
    }

    //Apply quickening free sustain (must happen here, after metamagic effects are applied)
    if (itemType === "itemSpell" && actor.system.magic?.metamagics?.quickening) {
      for (let i of actor.items) {
        if (i.type === "itemSpell" && i.system.quickening) i.system.freeSustain = true
      }
    }

    //Illusionist and Master Manipulator (Forbidden Arcana p. 37, 38): one spell per level sustained without penalty, Force <= Magic.
    //Worked out again at every preparation and never written on the item: a flag left on the item outlived a Force raised
    //above Magic (measured in play)
    let freedByMastery = new Set()
    if (itemType === "itemSpell" && actor.system.magic?.masteries) {
      const masteries = this.updateMagicMasteries(actor.system.magic)
      if (masteries.illusionist > 0 || masteries.masterManipulator > 0) {
        const candidates = actor.items.filter(i => i.type === "itemSpell" && i.system.isActive && !i.system.freeSustain)
        freedByMastery = masteryFreeSustainedSpells(
          candidates.map(i => ({
            id: i.id, category: i.system.category, subCategory: i.system.subCategory, type: i.system.type, force: i.system.force
          })),
          actor.system.specialAttributes.magic.augmented.value, {
            ...masteries, illusionistByType: illusionistLevelsByType(actor.items)
          })
      }
    }

    //Sourcerer daemon (Kill Code p. 101): half the submersion grade, rounded down, of complex forms sustained without
    //penalty; worked out at every preparation, like the masteries above
    if (itemType === "itemComplexForm") {
      const free = sourcererFreeSustain(streamOf(actor), actor.system.matrix?.submersionGrade)
      actor.items.filter(i => i.type === "itemComplexForm" && i.system.isActive && !i.system.freeSustain).slice(0, free).forEach(i => freedByMastery.add(i.id))
    }

    //Apply sustaining malus.
    for (let i of actor.items) {
      if (freedByMastery.has(i.id)) continue
      if (i.system.isActive && i.type === itemType && !i.system.freeSustain) SR5_EntityHelpers.updateModifier(actor.system.penalties[concentrationType].actual, `${i.name}`, i.type, -sustainedMod)

      //Except if concentration is active (only with a rating: a complex form of Level 0 is not covered by a rating of 0)
      const concentration = actor.system.specialProperties.concentration.value
      if (i.system.isActive && i.type === itemType && concentration > 0 &&
				!i.system.freeSustain && !actor.system[concentrationType].concentration &&
				(i.system.force <= concentration || i.system.level <= concentration)) {
        SR5_EntityHelpers.updateModifier(actor.system.penalties[concentrationType].actual, `${game.i18n.localize('SR5.QualityTypePositive')}`, "concentration", sustainedMod)
        actor.system[concentrationType].concentration = true
        i.system.freeSustain = true
      }
    }
  }

  // Handle Actors Condition Monitors
  static updateConditionMonitors(actor) {
    let actorData = actor.system,
      conditionMonitors = actorData.conditionMonitors,
      attributes = actorData.attributes,
      specialAttributes = actorData.specialAttributes

    // Spirits keep both kinds of monitor in their source; the type decides which ones exist (SR5 p. 301)
    if (actor.type == "actorSpirit") {
      if (SR5_SpiritTypes.hasSingleMonitor(actorData.type)) {
        delete actorData.conditionMonitors.physical
        delete actorData.conditionMonitors.stun
        delete actorData.statusBars.physical
        delete actorData.statusBars.stun
      } else {
        delete actorData.conditionMonitors.condition
        delete actorData.statusBars.condition
      }
    }

    // AI (Data Trails p. 161): a single core condition monitor, no Stun/Physical monitors and no overflow
    if (this.isDepthActive(actor)) {
      delete conditionMonitors.physical
      delete conditionMonitors.stun
      delete conditionMonitors.overflow
      delete actorData.statusBars.physical
      delete actorData.statusBars.stun
    }

    for (let key of Object.keys(SR5.monitorTypes)) {
      if (conditionMonitors[key]) {
        switch (key) {
          case "stun":
            conditionMonitors[key].base = Math.ceil((attributes.willpower.augmented.value / 2) + 8)
            break
          case "physical":
            conditionMonitors[key].base = Math.ceil((limitAttributeValue(attributes.body) / 2) + 8)
            break
          case "condition":
            if (actor.type == "actorDrone") {
              if (actorData.type === "drone") conditionMonitors[key].base = Math.ceil((attributes.body.augmented.value / 2) + 6)
              else conditionMonitors[key].base = Math.ceil((attributes.body.augmented.value / 2) + 12)
            } else if (this.isDepthActive(actor) && specialAttributes.depth) {
              // AI core condition monitor (Data Trails p. 161): 8 + half the Depth, rounded up
              conditionMonitors[key].base = Math.ceil(specialAttributes.depth.augmented.value / 2) + 8
            } else {
              conditionMonitors[key].base = Math.max(Math.ceil((attributes.willpower.augmented.value / 2) + 8), Math.ceil((attributes.body.augmented.value / 2) + 8))
            }
            break
          case "overflow":
            conditionMonitors[key].base = attributes.body.augmented.value
            if (conditionMonitors.physical.actual.value < conditionMonitors.physical.value) conditionMonitors[key].actual.base = 0
            break
          case "matrix": {
            // SR5 p. 229: 8 + half the device rating. A vehicle's rating is its Pilot, which
            // generateVehicleMatrix copies only on the second pass over the items, after this
            let deviceRating = actor.type === "actorDrone" ? attributes.pilot.augmented.value : actorData.matrix.deviceRating
            conditionMonitors[key].base = Math.ceil((deviceRating / 2) + 8)
            break
          }
          case "edge":
            conditionMonitors[key].base = specialAttributes.edge.augmented.value
            break
          default:
            SR5_SystemHelpers.srLog(1, `Unknown '${key}' condition monitor type in 'updateConditionMonitors()'`)
            return
        }
        SR5_EntityHelpers.updateValue(conditionMonitors[key], 1)
        // A monitor never holds more boxes than it has: compare the stored damage, actual.value was reset above
        SR5_EntityHelpers.updateValue(conditionMonitors[key].actual, 0)
        if (conditionMonitors[key].actual.value > conditionMonitors[key].value) {
          conditionMonitors[key].actual.base = conditionMonitors[key].value
          SR5_EntityHelpers.updateValue(conditionMonitors[key].actual, 0)
        }
        SR5_EntityHelpers.GenerateMonitorBoxes(actorData, key)
        SR5_EntityHelpers.updateStatusBars(actor, key)
      }
    }

    // Core monitor of a Monad of the original strain (Dark Terrors p. 88): 8 + MEC / 2, beside the host's own monitors
    if (conditionMonitors.core) {
      if (isOriginalStrainMonad(actor)) {
        conditionMonitors.core.base = monitorSize(matrixEntityConcentration(actor))
        SR5_EntityHelpers.updateValue(conditionMonitors.core, 1)
        SR5_EntityHelpers.updateValue(conditionMonitors.core.actual, 0)
        if (conditionMonitors.core.actual.value > conditionMonitors.core.value) {
          conditionMonitors.core.actual.base = conditionMonitors.core.value
          SR5_EntityHelpers.updateValue(conditionMonitors.core.actual, 0)
        }
      } else delete conditionMonitors.core
    }
  }

  // Generate Actor defense
  static updateDefenses(actor) {
    let actorData = actor.system, attributes = actorData.attributes, skills = actorData.skills, defenses = actorData.defenses

    // The actor's own reach (troll +1, broken weapon effects) is read by the melee defense roll: total it here.
    if (actorData.reach) SR5_EntityHelpers.updateValue(actorData.reach)

    for (let key of Object.keys(SR5.characterDefenses)) {
      if (defenses[key]) {
        defenses[key].base = 0
        switch (key) {
          case "block":
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Reaction'), "linkedAttribute", attributes.reaction.augmented.value)
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
            SR5_EntityHelpers.updateModifier(defenses[key], `${game.i18n.localize('SR5.SkillUnarmedCombat')}`, "skillRating", skills.unarmedCombat.rating.value)
            break
          case "defend":
            if (actor.type == "actorDrone") {
              let controlerData
              if (actorData.vehicleOwner.id) controlerData = actorData.vehicleOwner.system
              switch (actorData.controlMode) {
                case "autopilot":
                  SR5_EntityHelpers.updateModifier(defenses[key], `${game.i18n.localize('SR5.VehicleStat_PilotShort')}`, "linkedAttribute", attributes.pilot.augmented.value)
                  defenses[key].modifiers = defenses[key].modifiers.concat(actor.system.penalties.special.actual.modifiers)
                  break
                case "remote":
                case "manual":
                  SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Reaction'), "controler", controlerData.attributes.reaction.augmented.value)
                  SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Intuition'), "controler", controlerData.attributes.intuition.augmented.value)
                  break
                case "rigging":
                  SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Reaction'), "controler", controlerData.attributes.reaction.augmented.value)
                  SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Intuition'), "controler", controlerData.attributes.intuition.augmented.value)
                  //The control rig dice go to piloting skill tests only, not to this Reaction + Intuition defense (SR5 p. 205, 268)
                  if (controlerData.matrix.userMode === "hotsim") SR5_EntityHelpers.updateModifier(defenses[key], `${game.i18n.localize('SR5.VirtualRealityHotSimShort')}`, "matrixUserMode", 1)
                  break
                default:
                  SR5_SystemHelpers.srLog(1, `Unknown controle mode '${actorData.controlMode}' in 'updateDefenses() for drone/vehicle'`)
              }

            } else {
              SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Reaction'), "linkedAttribute", attributes.reaction.augmented.value)
              SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
            }
            break
          case "dodge":
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Reaction'), "linkedAttribute", attributes.reaction.augmented.value)
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.SkillGymnastics'), "skillRating", skills.gymnastics.rating.value)
            break
          case "parryClubs":
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Reaction'), "linkedAttribute", attributes.reaction.augmented.value)
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.SkillClubs'), "skillRating", skills.clubs.rating.value)
            break
          case "parryBlades":
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Reaction'), "linkedAttribute", attributes.reaction.augmented.value)
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
            SR5_EntityHelpers.updateModifier(defenses[key], game.i18n.localize('SR5.SkillBlades'), "skillRating", skills.blades.rating.value)
            break
          default:
            SR5_SystemHelpers.srLog(1, `Unknown '${key}' defense in 'updateDefenses()'`)
        }
        this.applyPenalty("condition", defenses[key], actor)
        this.applyPenalty("matrix", defenses[key], actor)
        this.applyPenalty("magic", defenses[key], actor)
        this.applyPenalty("special", defenses[key], actor)
        SR5_EntityHelpers.updateDicePool(defenses[key], 0)
      }
    }
  }

  // Generate Actors Armor
  static updateArmor(actor) {
    // The book gives a homunculus no Armor (SR5 p. 301); a world setting lends it the one of its material (SR5 p. 198)
    if (actor.type === "actorSpirit" && SR5_SpiritTypes.baseType(actor.system.type) === "homunculus" &&
      game.settings.get("sr5", "sr5HomunculusMaterialArmor")) {
      const armor = homunculusMaterialRatings(actor.system.homunculusMaterial).armor
      if (armor) SR5_EntityHelpers.updateModifier(actor.system.itemsProperties.armor, game.i18n.localize("SR5.HomunculusMaterial"), "actorSpirit", armor)
    }
    //Ordinary armor of a spirit type, "Armure (P x 2)" (Howling Shadows p. 128 and following); the hardened one is
    //given in updateSpiritValues, as hardened armor
    if (actor.type === "actorSpirit") {
      const typeArmor = SR5_SpiritTypes.armor(SR5_SpiritTypes.get(actor.system.type), actor.system.force?.value)
      if (typeArmor && !typeArmor.kind) SR5_EntityHelpers.updateModifier(actor.system.itemsProperties.armor, SR5_SpiritTypes.label(actor.system.type), "spiritType", typeArmor.value)
    }
    SR5_EntityHelpers.updateValue(actor.system.itemsProperties.armor, 0)
    for (let key of Object.keys(SR5.specialDamageTypes)) {
      SR5_EntityHelpers.updateValue(actor.system.itemsProperties.armor.specialDamage[key], 0)
    }
    for (let key of Object.keys(SR5.propagationVectors)) {
      SR5_EntityHelpers.updateValue(actor.system.itemsProperties.armor.toxin[key], 0)
    }
  }

  // Generate Actors Resistances
  static updateResistances(actor) {
    let actorData = actor.system, resistances = actorData.resistances, attributes = actorData.attributes
    // The effects put their bonuses "to resist damage" on the physical damage resistance (bone density and bone lacing
    // SR5 p. 458/462, Toughness p. 76, Bear p. 326, skeletal pneumaticity Chrome Flesh p. 167): the book makes them
    // count against every damage, so the elemental and fall resistances take them too. Read before Body and armor
    // are added below. Against toxins (pollution and radiation included, « traitées comme des attaques de toxine »,
    // Street Grimoire p. 105) only bone density and bone lacing keep their exception (SR5 p. 458/462): Toughness, Bear
    // and skeletal pneumaticity have none in the book, so they count there too (decision G3 of DjamZ). The bone
    // implants are cyberware or bioware, the pneumaticity genetech.
    const TOXIN_LIKE_ELEMENTS = ["toxin", "pollution", "radiation"]
    const anyDamageModifiers = [...(resistances?.physicalDamage?.modifiers || [])]
    const genetech = new Set((actor.items ?? []).filter(i => i.type === "itemAugmentation" && i.system?.type === "genetech").map(i => i.name))
    const toxinDamageModifiers = anyDamageModifiers.filter(m => m.type !== "itemAugmentation" || genetech.has(m.source))

    // Addiction tests (SR5 p. 415): Body + Willpower when physiological, Logic + Willpower when psychological
    if (resistances.addiction && attributes.logic && attributes.willpower) {
      const pools = {
        physiological: ["body", "SR5.Body"], psychological: ["logic", "SR5.Logic"]
      }
      for (let [kind, [attribute, label]] of Object.entries(pools)) {
        let pool = resistances.addiction[kind]
        pool.base = 0
        SR5_EntityHelpers.updateModifier(pool, game.i18n.localize(label), "linkedAttribute", attributes[attribute].augmented.value)
        SR5_EntityHelpers.updateModifier(pool, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        if (actorData.specialProperties?.addictionResistance?.modifiers.length) pool.modifiers = pool.modifiers.concat(actorData.specialProperties.addictionResistance.modifiers)
        SR5_EntityHelpers.updateDicePool(pool, 0)
      }
    }

    for (let key of Object.keys(SR5.characterResistances)) {
      if (resistances[key]) {
        switch (key) {
          case "fatigue":
            resistances[key].base = 0
            SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
            SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
            SR5_EntityHelpers.updateDicePool(resistances[key], 0)
            break
          case "specialDamage":
            for (let specialDamage of Object.keys(SR5.specialDamageTypes)) {
              if (actor.type == "actorDrone") {
                resistances[key][specialDamage].base = 0
                SR5_EntityHelpers.updateModifier(resistances[key][specialDamage], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
                SR5_EntityHelpers.updateModifier(resistances[key][specialDamage], `${game.i18n.localize('SR5.VehicleStat_ArmorShort')}`, "linkedAttribute", attributes.armor.augmented.value)
              } else {
                resistances[key][specialDamage].base = 0
                SR5_EntityHelpers.updateModifier(resistances[key][specialDamage], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
                if (actorData.itemsProperties) {
                  resistances.specialDamage[specialDamage].modifiers = resistances.specialDamage[specialDamage].modifiers.concat(actorData.itemsProperties.armor.modifiers)
                  resistances.specialDamage[specialDamage].modifiers = resistances.specialDamage[specialDamage].modifiers.concat(actorData.itemsProperties.armor.specialDamage[specialDamage].modifiers)
                }
                resistances.specialDamage[specialDamage].modifiers = resistances.specialDamage[specialDamage].modifiers
                  .concat(TOXIN_LIKE_ELEMENTS.includes(specialDamage) ? toxinDamageModifiers : anyDamageModifiers)
              }
              SR5_EntityHelpers.updateDicePool(resistances[key][specialDamage], 0)
            }
            break
          case "disease":
          case "toxin":
            for (let vector of Object.keys(SR5.propagationVectors)) {
              resistances[key][vector].base = 0
              SR5_EntityHelpers.updateModifier(resistances[key][vector], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
              SR5_EntityHelpers.updateModifier(resistances[key][vector], game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
              // Head case advantage (Stolen Souls p. 201): add the Nanite Volume to toxin and disease resistances
              if (actorData.specialProperties?.naniteToxinResistance && actorData.specialAttributes?.nanite?.augmented.value > 0) {
                SR5_EntityHelpers.updateModifier(resistances[key][vector], game.i18n.localize('SR5.NaniteVolume'), "linkedAttribute", actorData.specialAttributes.nanite.augmented.value)
              }
              if (actorData.itemsProperties && key === "toxin") {
                resistances.toxin[vector].modifiers = resistances.toxin[vector].modifiers.concat(actorData.itemsProperties.armor.toxin[vector].modifiers)
              }
              if (key === "toxin") resistances.toxin[vector].modifiers = resistances.toxin[vector].modifiers.concat(toxinDamageModifiers)
              SR5_EntityHelpers.updateDicePool(resistances[key][vector], 0)
            }
            break
          case "directSpellMana":
            resistances[key].base = 0
            SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
            SR5_EntityHelpers.updateDicePool(resistances[key], 0)
            break
          case "directSpellPhysical":
            if (actor.type == "actorDrone") {
              resistances[key].base = 0
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.VehicleStat_ArmorShort'), "linkedAttribute", attributes.armor.augmented.value)
            } else {
              resistances[key].base = 0
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
            }
            SR5_EntityHelpers.updateDicePool(resistances[key], 0)
            break
          case "physicalDamage":
          case "fall":
            if (actor.type == "actorDrone") {
              resistances[key].base = 0
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.VehicleStat_ArmorShort'), "linkedAttribute", attributes.armor.augmented.value)
            } else {
              resistances[key].base = 0
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
            }
            if (actorData.itemsProperties) resistances[key].modifiers = resistances[key].modifiers.concat(actorData.itemsProperties.armor.modifiers)
            if (key === "fall" && actor.type != "actorDrone") resistances[key].modifiers = resistances[key].modifiers.concat(anyDamageModifiers)
            SR5_EntityHelpers.updateDicePool(resistances[key], 0)
            break
          case "crashDamage":
            if (actor.type == "actorDrone") {
              resistances[key].base = 0
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.VehicleStat_ArmorShort'), "linkedAttribute", attributes.armor.augmented.value)
              SR5_EntityHelpers.updateDicePool(resistances[key], 0)
            } else {
              //A passenger in a crash: Body + Armor, AP -6 (SR5 p. 202). The vehicle's SPP and cocoon join at the roll
              resistances[key].base = 0
              SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
              const armor = actorData.itemsProperties?.armor?.modifiers ?? []
              resistances[key].modifiers = resistances[key].modifiers.concat(armor, anyDamageModifiers)
              const penetration = crashArmorPenetration(SR5_EntityHelpers.modifiersSum(armor))
              if (penetration) SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.ArmorPenetrationShort'), "armorPenetration", penetration)
              SR5_EntityHelpers.updateDicePool(resistances[key], 0)
            }
            break
          case "astralDamage":
            SR5_EntityHelpers.updateModifier(resistances[key], game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
            SR5_EntityHelpers.updateDicePool(resistances[key], 0)
            break
          default:
            SR5_SystemHelpers.srLog(1, `Unknown resistance '${key}' in 'updateResistances()'`)
        }
      }
    }
  }
}
