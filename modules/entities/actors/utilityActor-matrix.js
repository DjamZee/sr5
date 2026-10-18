import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  spriteTypeDefinition, spriteMatrixModifiers, spriteInitiativeBonus, SPRITE_MATRIX_KEYS
} from "./sprite-types.js"
import {
  fadingResistanceAttribute
} from "./fading-resistance.js"
import {
  HOST_ATTRIBUTES, HOST_TYPE_PAGES, resolveHostAttributes, hostTypeOffsetLabel, untypedHostDefaults
} from "./host-type.js"
import {
  originalStrainDevice, activeHeadcase, naniteVolume, monitorSize
} from "../../system/monad-matrix.js"
import {
  ICE_HOST_ATTRIBUTES, iceHostAttributes, iceHostOf
} from "../../system/ice-host.js"
import {
  SR5 
} from "../../config.js"
import {
  _getSRStatusEffect
} from "../../system/effectsList.js"
import {
  actsAsRcc, fixedRccRatings, rccRatings
} from "./rcc.js"
import {
  streamOf, firewallBonusOfStream, sleazeBonusOfStream, hasResonantDissonance, RESONANT_DISSONANCE_ACTIONS
} from "./technomancer-streams.js"
import {
  consoleNoiseReductionDice
} from "../../rolls/roll-helpers/electronic-warfare.js"
import {
  isPlainDevice, lacksAttackAndSleaze
} from "./device-attributes.js"
import {
  iceDefenseType, iceDesignOf
} from "../../system/ice-design.js"

// Matrix: AI, matrix attributes, actions, defenses and resistances, devices, sprites, agents and programs.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
// SR5_CharacterUtility itself, given by utilityActor.js (importing it here would make an import cycle)
let SR5_CharacterUtility
export function linkMatrixUtility(characterUtility) {
  SR5_CharacterUtility = characterUtility
}

export class SR5_CharacterMatrixUtility {

  // AI (Data Trails p. 152): an AI is a PC or grunt sheet whose active special attribute is Depth
  static isDepthActive(actor) {
    return (actor.type === "actorPc" || actor.type === "actorGrunt") && actor.system?.activeSpecialAttribute === "depth"
  }

  // AI outside any device (Data Trails p. 157): a persona alone, with no active device
  static isDevicelessAI(actor) {
    return this.isDepthActive(actor) && !actor.items.some(i => i.type === "itemDevice" && i.system.isActive)
  }

  // SR5 p. 229: each value of the active cyberdeck's attribute array must be assigned to a matrix attribute
  static isDeckUnconfigured(actorData) {
    if (actorData.matrix?.deviceType !== "cyberdeck") return false
    const collection = actorData.matrix.attributesCollection ?? {
    }
    return [1, 2, 3, 4].some(i => collection[`value${i}`] > 0 && !collection[`value${i}isSet`])
  }

  // Data Trails p. 157: the attribute an AI outside any device defends with where the defense calls for Logic
  static devicelessAILogicStandIn(actorData) {
    let intuition = actorData.attributes.intuition.augmented.value,
      willpower = actorData.attributes.willpower.augmented.value
    switch (game.settings.get("sr5", "sr5DevicelessAILogicDefense")) {
      case "intuition": return {
        label: "SR5.Intuition", value: intuition
      }
      case "willpower": return {
        label: "SR5.Willpower", value: willpower
      }
      default: return intuition >= willpower ? {
        label: "SR5.Intuition", value: intuition
      } : {
        label: "SR5.Willpower", value: willpower
      }
    }
  }

  // The book sets no cap of its own on an AI's active programs (Data Trails p. 151-161 is silent).
  // DjamZ's ruling: the smaller of Depth x 2 and the slots of the device the AI runs on
  static aiProgramCap(depth, deviceSlots) {
    return Math.min(depth * 2, deviceSlots)
  }

  // Apply DjamZ's ruling to an AI on a device: when Depth x 2 is the lower, it replaces the device as the cap
  static applyAIProgramCap(actor) {
    if (!this.isDepthActive(actor)) return
    let max = actor.system.matrix.programsMaximumActive
    let depth = actor.system.specialAttributes.depth?.augmented.value || 0
    // generateMatrixAttributes runs first in prepareEmbeddedDocuments, before updateSpecialAttributes, so Depth is still 0;
    // it runs again in updateItems with the real Depth: drop what the earlier call wrote
    let others = max.modifiers.filter(m => m.details !== "aiProgramCap" && m.type !== "device" && m.type !== "deviceRating")
    let deviceMods = max.modifiers.filter(m => m.type === "device" || m.type === "deviceRating")
    let slots = deviceMods.reduce((sum, m) => sum + m.value, 0)
    if (this.aiProgramCap(depth, slots) === slots) max.modifiers = [...deviceMods, ...others]
    else {
      max.modifiers = others
      SR5_EntityHelpers.updateModifier(max, `${game.i18n.localize('SR5.Depth')} ${depth} × 2`, "linkedAttribute", depth * 2, false, true, "aiProgramCap")
    }
    SR5_EntityHelpers.updateValue(max, 0)
  }

  // Warning shown when an AI loads one program too many. DjamZ's ruling: it warns and does not block.
  // An AI outside any device cannot load programs at all (Data Trails p. 157). Other actors are left alone
  static aiProgramCapWarning(actor) {
    if (!this.isDepthActive(actor)) return null
    if (this.isDevicelessAI(actor)) return game.i18n.localize('SR5.AIProgramsNoDevice')
    let current = actor.system.matrix.programsCurrentActive.value, max = actor.system.matrix.programsMaximumActive.value
    if (current + 1 <= max) return null
    return game.i18n.format('SR5.AIProgramsCapReached', {
      current: current + 1, max
    })
  }

  // An AI outside any device resists matrix damage with no device and no Firewall. The book gives it no pool
  // (Data Trails p. 157 and 161): it resists with the attribute it defends with where the defense calls for Logic.
  static generateDevicelessAIMatrixResistance(actor) {
    let matrixDamage = actor.system.matrix.resistances.matrixDamage
    let standIn = this.devicelessAILogicStandIn(actor.system)
    matrixDamage.base = 0
    SR5_EntityHelpers.updateModifier(matrixDamage, game.i18n.localize(standIn.label), "linkedAttribute", standIn.value)
    SR5_EntityHelpers.updateDicePool(matrixDamage)
  }

  // Generate Matrix attributes
  static generateMatrixAttributes(item, actor) {
    let actorData = actor.system, attributes = actorData.attributes
    let matrix = actorData.matrix, matrixAttributes = matrix.attributes

    matrix.deviceType = item.system.type
    matrix.deviceName = item.name

    switch (item.system.type) {
      case "cyberdeck":
        matrix.attributesCollection.value1 = item.system.attributesCollection.value1
        matrix.attributesCollection.value2 = item.system.attributesCollection.value2
        matrix.attributesCollection.value3 = item.system.attributesCollection.value3
        matrix.attributesCollection.value4 = item.system.attributesCollection.value4
        matrix.programsMaximumActive.base = 0
        SR5_EntityHelpers.updateModifier(matrix.programsMaximumActive, item.name, "device", item.system.program.max, false, false)
        matrix.deviceRating = item.system.deviceRating
        break
      case "riggerCommandConsole":
        matrix.attributes.attack.base = 0
        matrix.attributes.sleaze.base = 0
        matrix.attributes.dataProcessing.base = item.system.attributesCollection.value3
        matrix.attributes.firewall.base = item.system.attributesCollection.value4
        matrix.programsMaximumActive.base = 0
        SR5_EntityHelpers.updateModifier(matrix.programsMaximumActive, item.name, "deviceRating", item.system.deviceRating, false, false)
        matrix.deviceRating = item.system.deviceRating
        break
      case "commlink":
        matrix.attributes.attack.base = 0
        matrix.attributes.sleaze.base = 0
        matrix.attributes.dataProcessing.base = item.system.deviceRating
        matrix.attributes.firewall.base = item.system.deviceRating
        matrix.programsMaximumActive.base = 0
        SR5_EntityHelpers.updateModifier(matrix.programsMaximumActive, item.name, "deviceRating", item.system.deviceRating, false, false)
        matrix.deviceRating = item.system.deviceRating
        break
      case "livingPersona":
        matrix.attributes.attack.base = attributes.charisma.augmented.value
        matrix.attributes.sleaze.base = attributes.intuition.augmented.value
        matrix.attributes.dataProcessing.base = attributes.logic.augmented.value
        matrix.attributes.firewall.base = attributes.willpower.augmented.value
        matrix.deviceRating = actorData.specialAttributes.resonance.augmented.value
        //Worked out, never typed: the persona's Device Rating is the Resonance (SR5 p. 253), shown on its own sheet too
        item.system.deviceRating = matrix.deviceRating
        break
      case "headcase": {
        let nanite = actorData.specialAttributes.nanite.augmented.value
        if (originalStrainDevice(actor) === item) {
          // Original strain (Dark Terrors p. 88): an AI on its nanite swarm, a device rated by the Nanite Volume, whose
          // four attributes are each the Nanite Volume (arbitrage de DjamZ, 06/10); no program slot; always in hot sim
          for (let key of ["attack", "sleaze", "dataProcessing", "firewall"]) matrix.attributes[key].base = nanite
          matrix.deviceRating = nanite
          matrix.userMode = "hotsim"
          // The swarm's matrix monitor: 8 + NV / 2, worked out here because the device knows no Nanite Volume
          item.system.deviceRating = nanite
          item.system.conditionMonitors.matrix.base = monitorSize(nanite)
          SR5_EntityHelpers.updateValue(item.system.conditionMonitors.matrix, 0)
          SR5_EntityHelpers.updateValue(item.system.conditionMonitors.matrix.actual, 0)
          SR5_EntityHelpers.GenerateMonitorBoxes(item.system, 'matrix')
          break
        }
        // Head case matrix attributes (Lockdown p. 206): same attribute layout as a
        // living persona, with the full Nanite Volume added to each one.
        matrix.attributes.attack.base = attributes.charisma.augmented.value + nanite
        matrix.attributes.sleaze.base = attributes.intuition.augmented.value + nanite
        matrix.attributes.dataProcessing.base = attributes.logic.augmented.value + nanite
        matrix.attributes.firewall.base = attributes.willpower.augmented.value + nanite
        matrix.deviceRating = nanite
        break
      }
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${item.system.type}' deck type in generateMatrixAttributes()`)
        return
    }

    matrix.pan = item.system.pan
    matrix.marks = item.system.marks
    matrix.markedItems = item.system.markedItems
    //Noise Reduction and Sharing belong to a console, their total within its Device Rating (SR5 p. 269): a deck or a
    //commlink equipped instead no longer reduces the noise with the console's setting
    //A Machinist's persona takes Willpower and Charisma instead (Kill Code p. 101)
    const rcc = fixedRccRatings(actor) ?? rccRatings(matrixAttributes.noiseReduction.base, matrixAttributes.sharing.base, matrix.deviceRating, actsAsRcc(actor))
    matrixAttributes.noiseReduction.base = rcc.noiseReduction
    matrixAttributes.sharing.base = rcc.sharing
    //Erisian daemon: half the submersion grade, rounded up, on the persona's Firewall (Kill Code p. 146). Non-cumulative,
    //since this function runs twice in a preparation
    if (item.system.type === "livingPersona") {
      const firewallBonus = firewallBonusOfStream(streamOf(actor), matrix.submersionGrade)
      if (firewallBonus) SR5_EntityHelpers.updateModifier(matrixAttributes.firewall, game.i18n.localize('SR5.StreamErisian'), "technomancerStream", firewallBonus, false, false)
      //Apophenian daemon: the same on Sleaze (Kill Code p. 146)
      const sleazeBonus = sleazeBonusOfStream(streamOf(actor), matrix.submersionGrade)
      if (sleazeBonus) SR5_EntityHelpers.updateModifier(matrixAttributes.sleaze, game.i18n.localize('SR5.StreamApophenian'), "technomancerStream", sleazeBonus, false, false)
    }
    SR5_EntityHelpers.updateValue(matrix.noise)
    SR5_EntityHelpers.updateValue(matrix.programsMaximumActive, 0)
    SR5_EntityHelpers.updateValue(matrix.programsCurrentActive, 0)
    this.applyAIProgramCap(actor)

    for (let key of Object.keys(SR5.matrixAttributes)) {
      SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
    }
  }

  // Generate Resonance actions
  static generateResonanceMatrix(actor) {
    let actorData = actor.system, specialAttributes = actorData.specialAttributes, skills = actorData.skills
    let matrix = actorData.matrix, resonanceActions = matrix.resonanceActions

    matrix.registeredSprite.max = specialAttributes.resonance.augmented.value

    resonanceActions.compileSprite.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.compileSprite.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.compileSprite.test, `${game.i18n.localize('SR5.MatrixActionCompileSprite')}`, "skillRating", skills.compiling.rating.value)
    resonanceActions.decompileSprite.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.decompileSprite.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.decompileSprite.test, `${game.i18n.localize('SR5.MatrixActionDecompileSprite')}`, "skillRating", skills.decompiling.rating.value)
    resonanceActions.eraseResonanceSignature.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.eraseResonanceSignature.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.eraseResonanceSignature.test, `${game.i18n.localize('SR5.SkillComputer')}`, "skillRating", skills.computer.rating.value)
    resonanceActions.killComplexForm.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.killComplexForm.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.killComplexForm.test, `${game.i18n.localize('SR5.SkillSoftware')}`, "skillRating", skills.software.rating.value)
    resonanceActions.registerSprite.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.registerSprite.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.registerSprite.test, `${game.i18n.localize('SR5.SkillRegistering')}`, "skillRating", skills.registering.rating.value)
    resonanceActions.threadComplexForm.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.threadComplexForm.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.threadComplexForm.test, `${game.i18n.localize('SR5.SkillSoftware')}`, "skillRating", skills.software.rating.value)

    // handle resonance final calculation
    for (let key of Object.keys(SR5.resonanceActions)) {
      if (resonanceActions[key].test) {
        this.applyPenalty("condition", resonanceActions[key].test, actor)
        this.applyPenalty("matrix", resonanceActions[key].test, actor)
        this.applyPenalty("magic", resonanceActions[key].test, actor)
        this.applyPenalty("special", resonanceActions[key].test, actor)
        if (matrix.userMode === "hotsim" && key === "eraseResonanceSignature") {
          SR5_EntityHelpers.updateModifier(resonanceActions[key].test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 2)
        }
        //Écho Dissonance résonante (Better Than Bad p. 145, VO p. 161): in hot sim, +2 dice to compile and decompile a
        //sprite and to thread a complex form
        if (matrix.userMode === "hotsim" && RESONANT_DISSONANCE_ACTIONS.includes(key) && hasResonantDissonance(actor)) {
          SR5_EntityHelpers.updateModifier(resonanceActions[key].test, game.i18n.localize('SR5.EchoResonantDissonance'), "echo", 2)
        }
        //test
        SR5_EntityHelpers.updateDicePool(resonanceActions[key].test)
        if (resonanceActions[key].test.dicePool < 0) resonanceActions[key].test.dicePool = 0
        // limit calculation
        if (resonanceActions[key].limit) {
          let linkedLimit = resonanceActions[key].limit.base
          if (actorData.limits[linkedLimit]) {
            resonanceActions[key].limit.value = actorData.limits[linkedLimit].value + SR5_EntityHelpers.modifiersSum(resonanceActions[key].limit.modifiers)
          }
        }
      }
    }
  }

  // The rule constants of a matrix action (type, source, marks, legality, limit attribute) are those of the
  // schema: an actor created with an earlier version keeps them in its stored data, so a rule fix would
  // otherwise never reach existing actors
  static resetMatrixActionRules(actor, key) {
    const field = actor.system.schema?.getField(`matrix.actions.${key}`)
    const action = actor.system.matrix?.actions?.[key]
    if (!field?.fields || !action) return
    for (const name of ["actionType", "source", "increaseOverwatchScore", "neededMarks"]) {
      if (field.fields[name] && field.fields[name].initial !== undefined) action[name] = field.fields[name].initial
    }
    const linkedAttribute = field.fields.limit?.fields?.linkedAttribute
    if (linkedAttribute && action.limit) action.limit.linkedAttribute = linkedAttribute.initial
  }

  static generateMatrixActions(actor) {
    let actorData = actor.system, attributes = actorData.attributes, specialAttributes = actorData.specialAttributes, skills = actorData.skills,
      matrix = actorData.matrix, matrixAttributes = matrix.attributes, matrixActions = matrix.actions
    //Écho Dissonance résonante (Better Than Bad p. 145): in cold sim, the +2 dice of hot sim kept on every matrix action
    const coldSimBonus = matrix.userMode === "coldsim" && hasResonantDissonance(actor)

    SR5_EntityHelpers.updateModifier(matrixActions.jamSignals.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jamSignals.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.controlDevice.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.controlDevice.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.disarmDataBomb.test, game.i18n.localize('SR5.SkillSoftware'), "skillRating", skills.software.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.disarmDataBomb.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.editFile.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.editFile.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.eraseMark.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.eraseMark.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    if (specialAttributes.resonance.augmented.value > 0) {
      SR5_EntityHelpers.updateModifier(matrixActions.eraseMatrixSignature.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.eraseMatrixSignature.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    }
    SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.snoop.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.snoop.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.hackOnTheFly.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.hackOnTheFly.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.spoofCommand.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.spoofCommand.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.garbageInGarbageOut.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.garbageInGarbageOut.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.bruteForce.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.bruteForce.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixPerception.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixPerception.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.dataSpike.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.dataSpike.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.crackFile.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.crackFile.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.crashProgram.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.crashProgram.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.setDataBomb.test, game.i18n.localize('SR5.SkillSoftware'), "skillRating", skills.software.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.setDataBomb.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jumpIntoRiggedDevice.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jumpIntoRiggedDevice.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.rebootDevice.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.rebootDevice.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.trackback.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.trackback.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixSearch.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixSearch.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.hide.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.hide.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jackOut.test, game.i18n.localize('SR5.SkillHardware'), "skillRating", skills.hardware.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jackOut.test, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.traceIcon.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.traceIcon.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.checkOverwatchScore.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.checkOverwatchScore.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)

    if (game.settings.get("sr5", "sr5KillCodeRules")) {
      SR5_EntityHelpers.updateModifier(matrixActions.calibration.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.calibration.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.denialOfService.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.denialOfService.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.iAmTheFirewall.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.iAmTheFirewall.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.haywire.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.haywire.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.intervene.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.intervene.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.masquerade.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.masquerade.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.popupHacking.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.popupHacking.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.popupCybercombat.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.popupCybercombat.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.squelch.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.squelch.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.subvertInfrastructure.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.subvertInfrastructure.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.tag.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.tag.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.watchdog.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.watchdog.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    }		
    if (game.settings.get("sr5", "sr5Rigger5Actions")) {
      //The console's own noise reduction, without the Suppress Noise of the turn (Rigger 5.0 p. 34-35)
      const consoleNoise = consoleNoiseReductionDice(matrixAttributes.noiseReduction)
      SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
      SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
      SR5_EntityHelpers.updateModifier(matrixActions.detectTargetLock.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.detectTargetLock.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.detectTargetLock.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
      SR5_EntityHelpers.updateModifier(matrixActions.suppressNoise.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.suppressNoise.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.suppressNoise.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
    }

    // AI Depth action (Data Trails p. 160): Redefine Ownership, Logic + Computer [Depth]
    if (this.isDepthActive(actor)) {
      SR5_EntityHelpers.updateModifier(matrixActions.redefineOwnership.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.redefineOwnership.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    }

    for (let key of Object.keys(SR5.matrixActions)) {
      this.resetMatrixActionRules(actor, key)
      if (matrixActions[key].test !== undefined) {
        // test
        if (matrix.runningSilent) {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.RunningSilent'), "silentMode", -2)
        }
        if (matrix.userMode === "hotsim") {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 2)
        }
        if (coldSimBonus) SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.EchoResonantDissonance'), "matrixUserMode", 2)
        if (matrixActions[key].specialization) {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, `${game.i18n.localize('SR5.Specialization')}`, "specialization", 2, false, true)
        }
        this.applyPenalty("condition", matrixActions[key].test, actor)
        this.applyPenalty("matrix", matrixActions[key].test, actor)
        this.applyPenalty("magic", matrixActions[key].test, actor)
        this.applyPenalty("special", matrixActions[key].test, actor)
        SR5_EntityHelpers.updateDicePool(matrixActions[key].test, 0)
        // limits
        let linkedAttribute = matrixActions[key].limit.linkedAttribute
        matrixActions[key].limit.base = 0
        if (matrixActions[key].source === "dataTrails") SR5_EntityHelpers.updateModifier(matrixActions[key].limit, game.i18n.localize('SR5.Depth'), "linkedAttribute", actorData.specialAttributes?.depth?.augmented.value || 0)
        else SR5_EntityHelpers.updateModifier(matrixActions[key].limit, game.i18n.localize(SR5.matrixAttributes[linkedAttribute]), "linkedAttribute", matrixAttributes[linkedAttribute].value)
        SR5_EntityHelpers.updateValue(matrixActions[key].limit, 0)
      }
    }
  }


  static generateDeviceMatrixActions(actor){
    let actorData = actor.system, matrix = actorData.matrix, matrixAttributes = matrix.attributes, matrixActions = matrix.actions

    for (let key of Object.keys(SR5.matrixActions)) {
      this.resetMatrixActionRules(actor, key)
      if (matrixActions[key].test !== undefined) {
        SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.DeviceRating'), "linkedAttribute", matrix.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.DeviceRating'), "linkedAttribute", matrix.deviceRating)
        // test
        if (matrix.runningSilent) {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.RunningSilent'), "silentMode", -2)
        }
        if (matrix.userMode === "hotsim") {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 2)
        }
        if (matrixActions[key].specialization){
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, `${game.i18n.localize('SR5.Specialization')}`, "specialization", 2, false, true)
        }
        SR5_EntityHelpers.updateDicePool(matrixActions[key].test, 0)
        // limits
        let linkedAttribute = matrixActions[key].limit.linkedAttribute
        matrixActions[key].limit.base = 0
        if (matrixActions[key].source === "dataTrails") SR5_EntityHelpers.updateModifier(matrixActions[key].limit, game.i18n.localize('SR5.Depth'), "linkedAttribute", actorData.specialAttributes?.depth?.augmented.value || 0)
        else SR5_EntityHelpers.updateModifier(matrixActions[key].limit, game.i18n.localize(SR5.matrixAttributes[linkedAttribute]), "linkedAttribute", matrixAttributes[linkedAttribute].value)
        SR5_EntityHelpers.updateValue(matrixActions[key].limit, 0)
      }
    }
  }

  static generateMatrixActionsDefenses(actor) {
    let actorData = actor.system, matrix = actorData.matrix, matrixAttributes = matrix.attributes, matrixActions = matrix.actions
    let intuitionValue, willpowerValue, logicValue, firewallValue, sleazeValue, dataProcessingValue, attackValue
    let modifierTypeIntuition = "linkedAttribute"
    let modifierTypeWillpower = "linkedAttribute"
    let modifierTypeLogic = "linkedAttribute"
    let modifierTypeFirewall = "matrixAttribute"
    let modifierTypeSleaze = "matrixAttribute"
    let modifierTypeDataProcessing = "matrixAttribute"
    let modifierTypeAttack = "matrixAttribute"
    let modifierTypeSensor = "sensorAttribute"
    let modifierTypePilot = "pilotAttribute"
    let logicLabel = 'SR5.Logic', deviceless = false
    let intuitionLabel = 'SR5.Intuition', willpowerLabel = 'SR5.Willpower'

    if (actor.type === "actorPc" || actor.type === "actorGrunt" || actor.type === "actorAgent") {
      intuitionValue = actorData.attributes.intuition.augmented.value
      willpowerValue = actorData.attributes.willpower.augmented.value
      logicValue = actorData.attributes.logic.augmented.value
      firewallValue = matrixAttributes.firewall.value
      sleazeValue = matrixAttributes.sleaze.value
      dataProcessingValue = matrixAttributes.dataProcessing.value
      attackValue = matrixAttributes.attack.value
      //Data Trails p. 157: an AI outside any device defends with its Willpower or Intuition alone, no matrix attribute
      if (this.isDevicelessAI(actor)) {
        let standIn = this.devicelessAILogicStandIn(actorData)
        deviceless = true
        logicValue = standIn.value
        logicLabel = standIn.label
      }
    } else if (actor.type === "actorSprite" || (actor.type === "actorDevice" && matrix.deviceType !== "slavedDevice")) {
      intuitionValue = matrix.deviceRating
      willpowerValue = matrix.deviceRating
      logicValue = matrix.deviceRating
      //A sprite's rating is its Level
      intuitionLabel = willpowerLabel = logicLabel = actor.type === "actorSprite" ? 'SR5.Level' : 'SR5.DeviceRating'
      firewallValue = matrixAttributes.firewall.value
      sleazeValue = matrixAttributes.sleaze.value
      dataProcessingValue = matrixAttributes.dataProcessing.value
      attackValue = matrixAttributes.attack.value
    } else if (actor.type === "actorDrone" && actorData.vehicleOwner.id && actorData.slaved) {
      let controler = actorData.vehicleOwner.system
      if (controler.attributes.intuition.augmented.value > matrix.deviceRating) {
        intuitionValue = controler.attributes.intuition.augmented.value
        modifierTypeIntuition = "controler"
      } else {
        intuitionValue = matrix.deviceRating
        intuitionLabel = 'SR5.DeviceRating'
      }

      if (controler.attributes.willpower.augmented.value > matrix.deviceRating) {
        willpowerValue = controler.attributes.willpower.augmented.value
        modifierTypeWillpower = "controler"
      } else {
        willpowerValue = matrix.deviceRating
        willpowerLabel = 'SR5.DeviceRating'
      }

      if (controler.attributes.logic.augmented.value > matrix.deviceRating) {
        logicValue = controler.attributes.logic.augmented.value
        modifierTypeLogic = "controler"
      } else {
        logicValue = matrix.deviceRating
        logicLabel = 'SR5.DeviceRating'
      }

      if (controler.matrix.attributes.firewall.value > matrix.deviceRating) {
        firewallValue = controler.matrix.attributes.firewall.value
        modifierTypeFirewall = "controler"
      } else firewallValue = matrix.deviceRating

      if (controler.matrix.attributes.sleaze.value > matrix.deviceRating) {
        sleazeValue = controler.matrix.attributes.sleaze.value
        modifierTypeSleaze = "controler"
      } else sleazeValue = matrix.deviceRating

      if (controler.matrix.attributes.dataProcessing.value > matrix.deviceRating) {
        dataProcessingValue = controler.matrix.attributes.dataProcessing.value
        modifierTypeDataProcessing = "controler"
      } else dataProcessingValue = matrix.deviceRating

      if (controler.matrix.attributes.attack.value > matrix.deviceRating) {
        attackValue = controler.matrix.attributes.attack.value
        modifierTypeAttack = "controler"
      } else attackValue = matrix.deviceRating
    } else {
      intuitionValue = matrix.deviceRating
      willpowerValue = matrix.deviceRating
      logicValue = matrix.deviceRating
      intuitionLabel = willpowerLabel = logicLabel = 'SR5.DeviceRating'
      firewallValue = matrix.deviceRating
      sleazeValue = matrix.deviceRating
      dataProcessingValue = matrix.deviceRating
      attackValue = matrix.deviceRating
    }
    //A device of the scenery has no Attack nor Sleaze (SR5 p. 235-236): it defends with the first element alone
    //(SR5 p. 237, « Logique seule si l'objet ne dispose pas d'un attribut Corruption »)
    const noAttackSleaze = lacksAttackAndSleaze(actor)

    SR5_EntityHelpers.updateModifier(matrixActions.editFile.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.editFile.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.eraseMark.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.eraseMark.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    // A Monad adds its Nanite Volume to resist Format Device (Dark Terrors p. 88); kept for the Lockdown strain too, as
    // the sidebar p. 91 recommends (arbitrage de DjamZ, 06/10)
    if (activeHeadcase(actor)) SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.defense, game.i18n.localize('SR5.NaniteVolume'), "linkedAttribute", naniteVolume(actor))
    SR5_EntityHelpers.updateModifier(matrixActions.snoop.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    SR5_EntityHelpers.updateModifier(matrixActions.snoop.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.hackOnTheFly.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.hackOnTheFly.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.spoofCommand.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    SR5_EntityHelpers.updateModifier(matrixActions.spoofCommand.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.garbageInGarbageOut.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    SR5_EntityHelpers.updateModifier(matrixActions.garbageInGarbageOut.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.bruteForce.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.bruteForce.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixPerception.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.matrixPerception.defense, game.i18n.localize('SR5.Sleaze'), modifierTypeSleaze, sleazeValue)
    SR5_EntityHelpers.updateModifier(matrixActions.dataSpike.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.dataSpike.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.crashProgram.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.crashProgram.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.jumpIntoRiggedDevice.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.jumpIntoRiggedDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.rebootDevice.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.rebootDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.hide.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.hide.defense, game.i18n.localize('SR5.DataProcessing'), modifierTypeDataProcessing, dataProcessingValue)
    SR5_EntityHelpers.updateModifier(matrixActions.jackOut.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.jackOut.defense, game.i18n.localize('SR5.MatrixAttack'), modifierTypeAttack, attackValue)
    SR5_EntityHelpers.updateModifier(matrixActions.traceIcon.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.traceIcon.defense, game.i18n.localize('SR5.Sleaze'), modifierTypeSleaze, sleazeValue)
    SR5_EntityHelpers.updateModifier(matrixActions.controlDevice.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.controlDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)

    if (game.settings.get("sr5", "sr5KillCodeRules")) {
      SR5_EntityHelpers.updateModifier(matrixActions.denialOfService.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.denialOfService.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.haywire.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.haywire.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.masquerade.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
      SR5_EntityHelpers.updateModifier(matrixActions.masquerade.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.popupHacking.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.popupHacking.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.popupCybercombat.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.popupCybercombat.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.squelch.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
      if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.squelch.defense, game.i18n.localize('SR5.Sleaze'), modifierTypeSleaze, sleazeValue)
      SR5_EntityHelpers.updateModifier(matrixActions.subvertInfrastructure.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
      SR5_EntityHelpers.updateModifier(matrixActions.subvertInfrastructure.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.tag.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
      if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.tag.defense, game.i18n.localize('SR5.Sleaze'), modifierTypeSleaze, sleazeValue)
      SR5_EntityHelpers.updateModifier(matrixActions.watchdog.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
      SR5_EntityHelpers.updateModifier(matrixActions.watchdog.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    }

    if (game.settings.get("sr5", "sr5Rigger5Actions")) {
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      if (actor.type === "actorDrone") {	
        SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
        SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.defense, game.i18n.localize('SR5.VehicleStat_SensorFull'), modifierTypeSensor, actorData.attributes.sensor.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.defense, game.i18n.localize('SR5.VehicleStat_PilotFull'), modifierTypePilot, actorData.attributes.pilot.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      }
    }


    matrixActions.checkOverwatchScore.defense.base = 6

    if (deviceless) {
      for (let key of Object.keys(SR5.matrixActions)) {
        if (matrixActions[key].defense) matrixActions[key].defense.modifiers = matrixActions[key].defense.modifiers.filter(m => m.type !== "matrixAttribute")
      }
    }

    // handle final calculation
    for (let key of Object.keys(SR5.matrixActions)) {
      if (matrixActions[key].defense) {
        this.applyPenalty("condition", matrixActions[key].defense, actor)
        this.applyPenalty("matrix", matrixActions[key].defense, actor)
        this.applyPenalty("magic", matrixActions[key].defense, actor)
        this.applyPenalty("special", matrixActions[key].defense, actor)
        SR5_EntityHelpers.updateDicePool(matrixActions[key].defense, 0)
      }
    }
  }

  static generateMatrixResistances(actor, item) {
    let actorData = actor.system, attributes = actorData.attributes, specialAttributes = actorData.specialAttributes
    let matrix = actorData.matrix, matrixAttributes = matrix.attributes, matrixResistances = matrix.resistances

    matrixResistances.matrixDamage.base = 0
    matrixResistances.biofeedback.base = 0
    matrixResistances.dumpshock.base = 0
    matrixResistances.dataBomb.base = 0
    matrixResistances.fading.base = 0
    switch (item.system.type) {
      case "commlink":
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "deviceRating", item.system.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        //A commlink with a sim module goes into VR too: biofeedback and dumpshock are resisted with Willpower + Firewall,
        //whatever the device (SR5 p. 229 and 231). The pool was left empty, 0 dice
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        break
      case "cyberdeck":
      case "riggerCommandConsole":
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "deviceRating", item.system.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, item.name, "deviceRating", item.system.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        break
      case "livingPersona":
      case "headcase": {
        // Living personas resist with Resonance, head cases with their Nanite Volume
        let personaKey = item.system.type === "headcase" ? "nanite" : "resonance"
        let personaLabel = game.i18n.localize(SR5.characterSpecialAttributes[personaKey])
        SR5_EntityHelpers.updateModifier(matrixResistances.fading, personaLabel, "linkedAttribute", specialAttributes[personaKey].augmented.value)
        // Willpower by the book (SR5 p. 254); a module may name another attribute (hook sr5.fadingResistance)
        const fadingAttribute = fadingResistanceAttribute(actor, personaKey)
        SR5_EntityHelpers.updateModifier(matrixResistances.fading, game.i18n.localize(SR5.characterAttributes[fadingAttribute]), "linkedAttribute", attributes[fadingAttribute].augmented.value)
        // A Monad of the original strain resists with Willpower + Firewall, on both its monitors (Dark Terrors p. 88)
        if (originalStrainDevice(actor) === item) SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        else SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, personaLabel, "linkedAttribute", specialAttributes[personaKey].augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, item.name, "deviceRating", item.system.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        break
      }
      case "baseDevice":
        if (actor.type === "actorDrone") {
          if (actorData.vehicleOwner.id && actorData.slaved) {
            let controler = actorData.vehicleOwner.system
            SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "controler", controler.matrix.resistances.matrixDamage.dicePool)
          } else {
            SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "deviceRating", actorData.matrix.deviceRating)
            SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", actorData.matrix.attributes.firewall.value)
          }
        } else if (actor.type === "actorDevice") {
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "deviceRating", actorData.matrix.deviceRating)
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", actorData.matrix.attributes.firewall.value)
        } else if (actor.type === "actorSprite") {
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Level'), "level", matrix.deviceRating)
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
          SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Level'), "level", matrix.deviceRating)
          SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        } else if (actor.type === "actorAgent") {
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, `${game.i18n.localize('SR5.ProgramTypeAgent')}`, "itemRating", actorData.rating)
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
          SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, `${game.i18n.localize('SR5.ProgramTypeAgent')}`, "itemRating", actorData.rating)
          SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        }
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${item.system.type}' deck type in generateMatrixResistances()`)
        return
    }

    for (let key of Object.keys(SR5.matrixResistances)) {
      SR5_EntityHelpers.updateDicePool(matrixResistances[key])
    }
  }

  static generateVehicleMatrix(actor, itemData) {
    let actorData = actor.system

    actorData.matrix.deviceRating = actorData.attributes.pilot.augmented.value
    actorData.matrix.programsMaximumActive.value = Math.ceil(actorData.matrix.deviceRating / 2)
    actorData.matrix.marks = itemData.marks
    actorData.matrix.markedItems = itemData.markedItems

    for (let key of Object.keys(SR5.matrixAttributes)) {
      actorData.matrix.attributes[key].base = 0
      SR5_EntityHelpers.updateModifier(actorData.matrix.attributes[key], game.i18n.localize('SR5.DeviceRating'), "linkedAttribute", actorData.matrix.deviceRating)
      SR5_EntityHelpers.updateValue(actorData.matrix.attributes[key])
    }

    SR5_EntityHelpers.updateValue(actorData.matrix.noise)
  }

  // Host types (Kill Code p. 48-52): a typed host takes its attributes from its rating and its type, the free ones
  // keeping the gamemaster's arrangement while it fits; with no type the attributes stay as entered, save for a host
  // never arranged, which gets the default order of SR5 p. 248 instead of four attributes at 0
  static applyHostType(matrix) {
    const stored = Object.fromEntries(HOST_ATTRIBUTES.map(key => [key, matrix.attributes[key].base]))
    const resolved = resolveHostAttributes(matrix.hostType, matrix.deviceRating, stored)
    if (!resolved) {
      const collection = matrix.attributesCollection
      const defaults = untypedHostDefaults(matrix.deviceRating, stored, [1, 2, 3, 4].some(i => collection[`value${i}isSet`]))
      if (!defaults) return
      for (let i = 1; i <= 4; i++) collection[`value${i}isSet`] = true
      for (const key of HOST_ATTRIBUTES) {
        matrix.attributes[key].base = defaults[key]
        SR5_EntityHelpers.updateModifier(matrix.attributes[key], game.i18n.format('SR5.HostUntypedDealt', {
          offset: hostTypeOffsetLabel(defaults[key], matrix.deviceRating)
        }), "hostType", 0)
      }
      return
    }
    // The collection only offers the free values, all of them already dealt
    for (let i = 1; i <= 4; i++) {
      matrix.attributesCollection[`value${i}`] = resolved.collection[i - 1] ?? 0
      matrix.attributesCollection[`value${i}isSet`] = true
    }
    const type = `${game.i18n.localize(SR5.hostTypes[matrix.hostType])} (KC p. ${HOST_TYPE_PAGES[matrix.hostType]})`
    for (const key of HOST_ATTRIBUTES) {
      const value = resolved.values[key]
      matrix.attributes[key].base = value
      const label = game.i18n.format(resolved.fixed.includes(key) ? 'SR5.HostTypeFixed' : 'SR5.HostTypeDealt', {
        type, offset: hostTypeOffsetLabel(value, matrix.deviceRating)
      })
      SR5_EntityHelpers.updateModifier(matrix.attributes[key], label, "hostType", 0)
    }
  }

  static generateDeviceMatrix(actor, itemData) {
    let actorData = actor.system, matrix = actorData.matrix,
      matrixAttributes = matrix.attributes

    actorData.matrix.marks = itemData.marks
    actorData.matrix.markedItems = itemData.markedItems
    matrix.deviceName = actor.name

    if (matrix.deviceType === "host") {
      matrix.attributesCollection.value1 = matrix.deviceRating
      matrix.attributesCollection.value2 = matrix.deviceRating + 1
      matrix.attributesCollection.value3 = matrix.deviceRating + 2
      matrix.attributesCollection.value4 = matrix.deviceRating + 3
      this.applyHostType(matrix)
    }

    //Handle Ice attack and defense
    if (matrix.deviceType === "ice") {
      //A designed IC keeps its own description (its recipe, written by the module that made it)
      if (!iceDesignOf(matrix)) actorData.description = game.i18n.localize(SR5.iceTypes[matrix.deviceSubType] + "_GE")
      if (!matrix.ice) matrix.ice = {
        attackDicepool: 0, defenseFirstAttribute: "", defenseSecondAttribute: "" 
      }
      matrix.ice.attackDicepool = matrix.deviceRating * 2
      matrix.actions.matrixPerception.test.dicePool = matrix.deviceRating * 2
      //SR5 p. 249: an IC uses its host's matrix attributes; with no host, its own
      const host = iceHostOf(actor), hostValues = iceHostAttributes(host)
      if (hostValues) for (const key of ICE_HOST_ATTRIBUTES) {
        matrixAttributes[key].base = hostValues[key]
        SR5_EntityHelpers.updateModifier(matrixAttributes[key], game.i18n.format('SR5.IceHostAttribute', {
          host: host.name
        }), "iceHost", 0)
      }
      SR5_EntityHelpers.updateValue(matrixAttributes.dataProcessing, 0)
      matrix.actions.matrixPerception.limit.value = matrixAttributes.dataProcessing.value
      //A designed IC defends against with the pair of the book's IC its recipe names (system/ice-design.js)
      switch (iceDefenseType(matrix)) {
        case "iceAcid":
        case "iceScramble":
          matrix.ice.defenseFirstAttribute = "willpower"
          matrix.ice.defenseSecondAttribute = "firewall"
          break
        case "iceBinder":
          matrix.ice.defenseFirstAttribute = "willpower"
          matrix.ice.defenseSecondAttribute = "dataProcessing"
          break
        case "iceCrash":
        case "iceBlack":
        case "iceKiller":
        case "iceProbe":
        case "iceSparky":
        case "iceShocker":
          matrix.ice.defenseFirstAttribute = "intuition"
          matrix.ice.defenseSecondAttribute = "firewall"
          break
        case "iceBlaster":
        case "iceTarBaby":
        case "iceCatapult":
        case "iceFlicker":
        case "iceSleuther":
        case "iceBlueGoo":
          matrix.ice.defenseFirstAttribute = "logic"
          matrix.ice.defenseSecondAttribute = "firewall"
          break
        case "iceJammer":
          matrix.ice.defenseFirstAttribute = "willpower"
          matrix.ice.defenseSecondAttribute = "attack"
          break
        case "iceTrack":
        case "iceMarker":
        case "iceBloodhound":
          matrix.ice.defenseFirstAttribute = "willpower"
          matrix.ice.defenseSecondAttribute = "sleaze"
          break
        case "icePatrol":
          break
        default:
          SR5_SystemHelpers.srLog(1, `Unknown '${matrix.deviceSubType}' ice type in generateDeviceMatrix()`)
      }
    }

    //Handle Attributes
    //A device, a maglock among them, has a Device Rating and two matrix attributes, Data Processing and Firewall, equal
    //to it (SR5 p. 235-236): no Attack, no Sleaze, and Noise Reduction and Sharing belong to rigger consoles
    if (isPlainDevice(matrix.deviceType, actorData.isDirectlyConnected)) {
      for (let key of Object.keys(SR5.matrixAttributes)) {
        matrixAttributes[key].base = (key === "dataProcessing" || key === "firewall") ? matrix.deviceRating : 0
        SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
      }
    } else {
      for (let key of Object.keys(SR5.matrixAttributes)) {
        SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
      }
    }

    SR5_EntityHelpers.updateValue(matrix.noise)
  }

  static generateSpriteMatrix(actor, itemData) {
    let actorData = actor.system,
      matrix = actorData.matrix,
      matrixAttributes = matrix.attributes

    actorData.matrix.marks = itemData.marks
    actorData.matrix.markedItems = itemData.markedItems
    matrix.deviceRating = actorData.level

    //Handle base matrix attributes
    for (let key of Object.keys(SR5.matrixAttributes)) {
      matrixAttributes[key].base = matrix.deviceRating
    }

    //Apply matrix attributes by type
    let label = `${game.i18n.localize(SR5.spriteTypes[actorData.type])}`
    // The type's modifiers to the Level (SR5 p. 261, Kill Code p. 110; module types: sprite-types.js)
    if (!spriteTypeDefinition(actorData.type)) {
      SR5_SystemHelpers.srLog(1, `Unknown '${actorData.type}' sprite type in generateSpriteMatrix()`)
    }
    const typeModifiers = spriteMatrixModifiers(actorData.type)
    for (let key of SPRITE_MATRIX_KEYS) {
      if (typeModifiers[key]) SR5_EntityHelpers.updateModifier(matrixAttributes[key], label, "spriteType", typeModifiers[key])
    }
    const initiativeBonus = spriteInitiativeBonus(actorData.type, actorData.level)
    if (initiativeBonus) SR5_EntityHelpers.updateModifier(actorData.initiatives.matrixInit, label, "spriteType", initiativeBonus)

    //handle matrix attributes
    for (let key of Object.keys(SR5.matrixAttributes)) {
      SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
    }

    SR5_EntityHelpers.updateValue(matrix.noise)
  }

  static generateAgentMatrix(actor, itemData) {
    let actorData = actor.system,
      matrixAttributes = actorData.matrix.attributes,
      //An agent without a creator is loaded on no device: no matrix attributes (SR5 p. 248), its rating still counts
      creatorMatrix = actorData.creatorData?.system?.matrix

    actorData.matrix.marks = itemData.marks
    actorData.matrix.markedItems = itemData.markedItems
    //Device
    if (creatorMatrix) actorData.matrix.deviceRating = creatorMatrix.deviceRating

    //Agent attributes are equal to the rating (Kill code page 26)
    for (let key of Object.keys(SR5.characterAttributes)) {
      actorData.attributes[key].augmented.value = actorData.rating
    }
    //Agent matrix attributes are the same as decker attributes
    for (let key of Object.keys(SR5.deckerAttributes)) {
      matrixAttributes[key].base = creatorMatrix?.attributes[key].value ?? 0
      SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
    }
    //Agent skills are equal to program rating
    for (let key of Object.keys(SR5.agentSkills)) {
      actorData.skills[key].rating.base = actorData.rating
      SR5_EntityHelpers.updateValue(actorData.skills[key].rating, 0)
      actorData.skills[key].test.base = actorData.skills[key].rating.value
      SR5_EntityHelpers.updateDicePool(actorData.skills[key].test, 0)
    }
    //Noise
    SR5_EntityHelpers.updateValue(actorData.matrix.noise)
    //Grid
    if (creatorMatrix) actorData.userGrid = creatorMatrix.userGrid
  }

  static applyProgramToAgent(actor) {
    let actorData = actor.system
    if (!actorData.creatorData?.items) return
    for (let i of actorData.creatorData.items) {
      if (i.type === "itemProgram" && (i.system.type === "common" || i.system.type === "hacking") && i.system.isActive) {
        if (Object.keys(i.system.customEffects).length) SR5_CharacterUtility.applyCustomEffects(i, actor)
      }
    }

  }

  static async updateProgramAgent(actor) {
    let actorObject = actor.toObject(false)
    if (game.actors) {
      for (let a of game.actors) {
        if (a.type === "actorAgent" && a.system.creatorId === actor.id && a.isOwner) {
          await a.update({
            "system.creatorData.items": actorObject.items
          })
        }
      }
    }

    if (canvas.scene) {
      for (let t of canvas.tokens.placeables) {
        //A linked token is the world actor, copied just above
        if (t.actor?.type === "actorAgent" && !t.document.actorLink && t.actor.system.creatorId === actor.id && t.actor.isOwner) {
          await t.actor.update({
            "system.creatorData.items": actorObject.items
          })
        }
      }
    }
  }

  static async updateMatrixEffect(actor){
    if (!actor.id) return
    let status, isStatusEffectOn, statusEffects = []
    isStatusEffectOn = actor.effects.find(e => e.statuses.has("matrixInit"))
    if (!actor.system.isDirectlyConnected) {
      if (!isStatusEffectOn) {
        status = await _getSRStatusEffect("matrixInit")
        statusEffects = statusEffects.concat(status)
      }
    } else {
      if (isStatusEffectOn) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", [isStatusEffectOn.id])
      }
    }
    if (statusEffects.length) await actor.createEmbeddedDocuments("ActiveEffect", statusEffects)

  }

  // SR5 p. 246-248: the rules of a program are known by its name. An active program named like one of the
  // system's programs (in the current language or in English) switches the matching flag on, so the coded
  // programs work even when the item carries no custom effect.
  static switchProgramFlagByName(item, actor) {
    let programs = actor.system.matrix?.programs
    if (!programs) return
    let name = item.name.trim().toLowerCase()
    let key = Object.keys(SR5.programs).find(k => {
      let label = SR5.programs[k]
      return game.i18n.localize(label).trim().toLowerCase() === name || SR5_CharacterUtility._englishLabel(label) === name
    })
    if (key && programs[key]) programs[key].isActive = true
  }

  // English fallback label of a translation key ("SR5.ProgramHammer" -> "hammer"), for worlds played in another language
  static _englishLabel(label) {
    let english = game.i18n._fallback?.SR5?.[label.slice(4)]
    return typeof english === "string" ? english.trim().toLowerCase() : ""
  }
}
