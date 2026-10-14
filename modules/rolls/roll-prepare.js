import {
  SR5_RollTest
} from "./roll-test.js"
import {
  underFireRules, bbStabilizeDrain, advancedMedkitRules
} from "../system/bb-healing.js"
import {
  SR5_PrepareRollHelper 
} from "./roll-prepare-helpers.js"
import {
  SR5_EntityHelpers 
} from "../entities/helpers.js"
import {
  SR5_SystemHelpers
} from "../system/utilitySystem.js"
import {
  SR5FactionRegistry
} from "../interface/faction-registry.js"

// The social tests whose dialog shows the NPC attitude (rollDialogPartial/modifiers.hbs)
const SOCIAL_FACTION_SKILLS = ["etiquette", "con", "intimidation", "leadership", "negotiation", "impersonation", "performance"]
import {
  SR5_ActorHelper
} from "../entities/actors/entityActor-helpers.js"
import * as SR5_GetRollData from "./roll-prepare-case/index.js"
import {
  SR5_RitualCircle
} from "./roll-helpers/ritualCircle.js"
import {
  ritualAcceptsHelp
} from "./roll-helpers/ritualTeam.js"
import {
  targetsWirelessOffDrone, isWirelessOffDrone
} from "./roll-prepare-case/rollData-MatrixAction.js"
import {
  runningModifierKind
} from "../system/running.js"
import {
  rollAttributes, extractSituational, tickByTargetMetatype, METATYPE_FAMILIES, SPIRIT_TYPE_SKILLS, spiritTypeOffers,
  spiritTypeVisible
} from "./roll-helpers/situational.js"
import {
  addIndirectEffects
} from "../system/indirect-effects.js"
import {
  applyRiggerNoise
} from "../system/rigger-noise.js"
import {
  SR5
} from "../config.js"
import {
  SR5_Toxins
} from "../entities/items/toxins.js"
import {
  refuseByRule
} from "../system/rule-locks.js"
import {
  offerTestAttribute, offerVehicleAttribute
} from "./roll-helpers/skillAttribute.js"

// N91: matrix rolls aimed at a target besides matrixAction, which guards itself. Each refuses a drone
// with its wireless off (SR5 p. 424)
const WIRELESS_TARGETED_ROLLS = ["iceAttack", "complexForm", "resonanceAction"]
const WIRELESS_DEFENSE_ROLLS = ["matrixDefense", "iceDefense", "complexFormDefense", "matrixResistance"]

// A15, group A (inventory of Mélisande, arbitrage of Élise, 08/10): skill tests the system builds itself, where the
// book's rule of p. 130 lets the attribute change (repair and mod installation have it through the skill test)
export const ATTRIBUTE_CHOICE_TESTS = ["weapon", "vehicleTest", "ramming", "pickpocket", "concealItem", "sensorDefense", "sensorTarget",
  "grappleClinch", "grappleEscape", "movement"]

// The key the choice is kept under, per character: the test, and its movement or weapon type
export function testAttributeFlagKey(rollType, rollKey, item){
  let sub = rollType === "movement" && typeof rollKey === "string" ? rollKey : rollType === "weapon" ? item?.system?.type : ""
  return `test-${rollType}${sub ? `-${String(sub).replace(/[^A-Za-z0-9]/g, "")}` : ""}`
}

export class SR5_PrepareRollTest {

  static async rollTest(document, rollType, rollKey, chatData) {
    //Get the actor who is rolling the test
    let actor = SR5_PrepareRollHelper.getRollingActor(document)
    //Get the item rolling the test
    let item = document

    //Get the base infos for roll
    let rollData = this.getBaseRollData(document, actor)

    //Add system optionnal rules
    if (game.settings.get("sr5", "sr5CalledShotsRules")) rollData.systemRules.calledShots = true
    if (game.settings.get("sr5", "sr5MatrixGridRules")) rollData.systemRules.grid = true

    //A drone with its wireless off is reached by no wireless matrix action, an IC, a complex form or a
    //resonance action included: only a direct connection does (p. 234), played by switching it on (N91)
    //A roll relaunched from a chat card (Blue Goo's explosion) also checks the target the card knows
    if (WIRELESS_TARGETED_ROLLS.includes(rollType) && (targetsWirelessOffDrone(actor) ||
      (chatData?.target?.actorId && isWirelessOffDrone(SR5_EntityHelpers.getRealActorFromID(chatData.target.actorId, chatData.actorUuids), actor))) &&
      refuseByRule("matrix", "SR5.WARN_TargetWirelessOff", null, {
        actor
      })) return
    //An attack launched with no target selected is defended from its card by the drone itself: not reached either
    //The "matrix" rule lock lifted (B13), the attack reached the drone, so the drone defends and resists it
    if (WIRELESS_DEFENSE_ROLLS.includes(rollType) && isWirelessOffDrone(actor, null) && refuseByRule("matrix", "SR5.WARN_TargetWirelessOff", null, {
      actor
    })) return

    //Better Than Bad p. 141: cut from the manasphere by Blight, no magic of any kind (decisions G2 and H1 of DjamZ)
    //The "magic" rule lock lifted (B13), the roll goes, on the values Blight leaves (Magic at 0), and the gamemaster hears of it
    if (SR5_Toxins.blightBlocksRoll(actor, rollType, rollKey) && refuseByRule("magic", "SR5.WARN_BlightNoSpell", null, {
      actor
    })) return

    //Iterate through roll type and add data to rollData;
    switch (rollType){
      case "astralTracking":
        rollData = await SR5_GetRollData.astralTracking(rollData, actor)
        break
      case "attribute":
        rollData = await SR5_GetRollData.attributeOnly(rollData, rollKey, actor)
        break
      case "banishingResistance":
        rollData = await SR5_GetRollData.banishingResistance(rollData, actor, chatData)
        break
      case "bindingResistance":
        rollData = await SR5_GetRollData.bindingResistance(rollData, actor, chatData)
        break
      case "calledShotBuckled":
        rollData = await SR5_GetRollData.calledShotBuckled(rollData, actor, chatData)
        break
      case "calledShotFear":
        rollData = await SR5_GetRollData.calledShotFear(rollData, actor, chatData)
        break
      case "calledShotKnockdown":
        rollData = await SR5_GetRollData.calledShotKnockdown(rollData, actor, chatData)
        break
      case "calledShotNauseous":
        rollData = await SR5_GetRollData.calledShotNauseous(rollData, actor, chatData)
        break
      case "calledShotStunned":
        rollData = await SR5_GetRollData.calledShotStunned(rollData, actor, chatData)
        break
      case "complexForm":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.complexForm(rollData, actor, item)
        break
      case "complexFormDefense":
        rollData = await SR5_GetRollData.complexFormDefense(rollData, actor, chatData)
        break
      case "decompilingResistance":
        rollData = await SR5_GetRollData.decompilingResistance(rollData, actor, chatData)
        break
      case "defense":
        rollData = await SR5_GetRollData.defense(rollData, actor, chatData)
        break
      case "defenseSimple":
        rollData = await SR5_GetRollData.defenseSimple(rollData, rollKey, actor)
        break
      case "derivedAttribute":
        rollData = await SR5_GetRollData.derived(rollData, rollKey, actor)
        break
      case "drain":
        rollData = await SR5_GetRollData.drain(rollData, actor, chatData)
        break
      case "escapeEngulf":
        rollData = await SR5_GetRollData.escapeEngulf(rollData, actor, chatData)
        break
      case "grappleEscape":
        rollData = await SR5_GetRollData.grappleEscape(rollData, actor)
        break
      case "grappleClinch":
        rollData = await SR5_GetRollData.grappleClinch(rollData, actor)
        break
      case "grappleClinchDefense":
        rollData = await SR5_GetRollData.grappleClinchDefense(rollData, actor, chatData)
        break
      case "pickpocket":
        rollData = await SR5_GetRollData.pickpocket(rollData, actor, chatData)
        break
      case "pickpocketPerception":
        rollData = await SR5_GetRollData.pickpocketPerception(rollData, actor, chatData)
        break
      case "concealItem":
        rollData = await SR5_GetRollData.concealItem(rollData, actor, chatData)
        break
      case "fading":
        rollData = await SR5_GetRollData.fading(rollData, actor, chatData)
        break
      case "healing":
        if (SR5_ActorHelper.stunHealsFirstRefused(actor, "healing", rollKey)) return
        rollData = await SR5_GetRollData.healing(rollData, rollKey, actor)
        break
      case "iceAttack":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.iceAttack(rollData, actor, rollKey)
        break
      case "iceDefense":
        rollData = await SR5_GetRollData.iceDefense(rollData, actor, chatData)
        break
      case "itemRoll":
        rollData = await SR5_GetRollData.itemRoll(rollData, item)
        break
      case "knowledgeSkill":
      case "languageSkill":
        rollData = await SR5_GetRollData.knowledgeSkill(rollData, rollType, item)
        break
      case "lift":
        rollData = await SR5_GetRollData.lift(rollData, rollKey, actor)
        break
      case "reagentHarvest":
      case "reagentRefine":
        rollData = await SR5_GetRollData.reagentWork(rollData, rollType, rollKey, actor)
        break
      case "martialArtDefense":
        rollData = await SR5_GetRollData.martialArtsDefense(rollData, actor, chatData)
        break
      case "matrixAction":
        //Launched from the crown of a PAN (lot 4, Q6): the attacker already chose the token (targeted by
        //rollMatrixActionOn, so that the checks on game.user.targets read it) and the device
        if (chatData?.panTarget) rollData = SR5_PrepareRollHelper.getPanTargetData(rollData, chatData.panTarget)
        else if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.matrixAction(rollData, rollKey, actor)
        break
      case "matrixDefense":
        rollData = await SR5_GetRollData.matrixDefense(rollData, rollKey, actor, chatData)
        break
      case "matrixDefenseSimple":
        rollData = await SR5_GetRollData.matrixDefenseSimple(rollData, rollKey, actor)
        break
      case "matrixResistance":
        rollData = await SR5_GetRollData.matrixResistance(rollData, actor, chatData)
        break
      case "movement":
        rollData = await SR5_GetRollData.movement(rollData, rollKey, actor)
        break
      case "objectResistance":
        rollData = await SR5_GetRollData.objectResistance(rollData, chatData)
        break
      case "passThroughBarrier":
        rollData = await SR5_GetRollData.passThroughBarrier(rollData, actor)
        break
      case "passThroughDefense":
        rollData = await SR5_GetRollData.passThroughDefense(rollData, chatData)
        break
      case "power":
      case "adeptPower":
      case "martialArt":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.power(rollData, rollType, item)
        break
      case "powerDefense":
        rollData = await SR5_GetRollData.powerDefense(rollData, actor, chatData)
        break
      case "preparation":
        // SR5 p. 309: at 0 Potency the preparation is no longer magical, its spell is lost
        if (!(Number(item.system?.potency) > 0) && refuseByRule("magic", "SR5.WARN_PreparationSpent", null, {
          actor
        })) return
        rollData = await SR5_GetRollData.preparation(rollData, actor, item)
        break
      case "preparationFormula":
        rollData = await SR5_GetRollData.preparationFormula(rollData, actor, item)
        break
      case "ramming":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.ramming(rollData, actor)
        break
      case "rammingDefense":
        rollData = await SR5_GetRollData.rammingDefense(rollData, actor, chatData)
        break
      case "regeneration":
        rollData = await SR5_GetRollData.regeneration(rollData, actor)
        break
      case "registeringResistance":
        rollData = await SR5_GetRollData.registeringResistance(rollData, actor, chatData)
        break
      case "resonanceAction":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.resonanceAction(rollData, rollKey, actor)
        break
      case "resistanceCard":
      case "resistanceCardAura":
      case "fatiguedCard":
      case "resistanceToxin":
        rollData = await SR5_GetRollData.resistance(rollData, rollType, actor, chatData)
        break
      case "resistanceSimple":
        rollData = await SR5_GetRollData.resistanceSimple(rollData, rollKey, actor)
        break
      case "resistanceDisease":
        rollData = await SR5_GetRollData.resistanceDisease(rollData, rollKey, actor, chatData)
        break
      case "resistanceRadiation":
        rollData = await SR5_GetRollData.resistanceRadiation(rollData, actor, chatData)
        break
      case "resistFire":
        rollData = await SR5_GetRollData.resistFire(rollData, actor, chatData)
        break
      case "addictionTest":
        rollData = await SR5_GetRollData.addictionTest(rollData, rollKey, actor)
        break
      case "mentorDrawback":
        rollData = await SR5_GetRollData.mentorDrawback(rollData, actor, item)
        break
      case "ritual":
        // SR5 p. 298: a ritual open to a group starts with the circle card, the roll comes when the leader seals it
        if (!chatData?.ritualCircle && ritualAcceptsHelp(item.system)) return SR5_RitualCircle.open(actor, item)
        rollData = await SR5_GetRollData.ritual(rollData, actor, item, chatData)
        break
      case "sensorTarget":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.sensorTarget(rollData, actor)
        break
      case "sensorDefense":
        rollData = await SR5_GetRollData.sensorDefense(rollData, actor, chatData)
        break
      case "skill":
      case "skillDicePool":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.skill(rollData, rollType, rollKey, actor, chatData)
        // A refused roll (astral combat out of astral perception) has already said why (M5 M1)
        if (!rollData) return
        // Faction Reputation moves the default NPC attitude (Cutting Aces p. 160); the list stays free
        if (rollData.target?.actorId && SOCIAL_FACTION_SKILLS.includes(rollData.test?.typeSub)){
          const faction = SR5FactionRegistry.attitudeFor(actor.id, SR5_EntityHelpers.getRealActorFromID(rollData.target.actorId, rollData.actorUuids))
          // Only the attitude travels with the roll: the faction and the score stay the gamemaster's
          if (faction) rollData.social = {
            attitude: faction.attitude
          }
        }
        break
      case "spell":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.spell(rollData, actor, item)
        break
      case "spellResistance":
        rollData = await SR5_GetRollData.spellResistance(rollData, actor, chatData)
        break
      case "illusionResistance":
        rollData = await SR5_GetRollData.illusionResistance(rollData, actor, chatData)
        break
      case "spritePower":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.spritePower(rollData, actor, item)
        break
      case "weapon":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.weapon(rollData, actor, item)
        break
      case "weaponAstral":
        if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)
        rollData = await SR5_GetRollData.weaponAstral(rollData, item)
        break
      case "vehicleTest":
        rollData = await SR5_GetRollData.vehicleTest(rollData, actor, chatData)
        break
      //Rigger 5.0 p. 33-34: the options come from the repair window of the drone sheet, in place of a roll key
      case "vehicleRepair":
        rollData = await SR5_GetRollData.vehicleRepair(rollData, actor, rollKey)
        break
      //Rigger 5.0 p. 153-154: the options come from the workshop of the drone sheet, in place of a roll key
      case "vehicleModInstall":
        rollData = await SR5_GetRollData.vehicleModInstall(rollData, actor, rollKey)
        break
      //RG p. 67: the options come from the weapon's Armurerie tab, in place of a roll key
      case "accessoryInstall":
        rollData = await SR5_GetRollData.accessoryInstall(rollData, actor, rollKey)
        break
      case "autopilotUnforeseen":
        rollData = SR5_GetRollData.autopilotUnforeseen(rollData, actor, chatData)
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown ${rollType} roll type in 'actorRoll()'`)
    }
        
    if (rollData) {
      //A15 (SR5 p. 130): the attribute menu, kept per character, on the skill tests the system builds itself; the
      //default stays the pair of the test (arbitrage of Élise, 08/10)
      if (ATTRIBUTE_CHOICE_TESTS.includes(rollType) && !rollData.skillAttribute) {
        const choice = {
          flagKey: testAttributeFlagKey(rollType, rollKey, item), labels: SR5.allAttributes, localize: k => game.i18n.localize(k),
        }
        //A driven vehicle rolls with its driver's skill and attribute
        if (actor?.type === "actorDrone") rollData = offerVehicleAttribute(rollData, actor, {
          ...choice, driver: game.actors.get(actor.system.vehicleOwner?.id) ?? null,
        })
        else rollData = offerTestAttribute(rollData, actor, choice)
      }
      //Running (SR5 p. 164): the running box of the modifiers list, for the tests that have no box of their own
      const runningKind = runningModifierKind(rollData.test)
      rollData.dialogSwitch.running = (runningKind === "general" || runningKind === "defense") ? runningKind : false
      //Situational effects (SR5 p. 462, Chrome Flesh p. 160-172): offered as boxes, unticked
      const attributeLabels = Object.fromEntries(Object.entries(SR5.allAttributes).map(([k, v]) => [k, game.i18n.localize(v)]))
      const {
        offers, always, scoped
      } = extractSituational(rollData, actor?.situationalEffects || [], rollAttributes(rollData.dicePool.composition, attributeLabels),
        actor?.system?.limits?.[rollData.limit?.type]?.modifiers)
      rollData.situational = offers
      //A weapon held by a cyberlimb: the limb's enhancements are in its Agility already (cyberlimb.js)
      if (rollData.various?.limbEnhancements?.length) rollData.situational = offers.filter(o => !(o.attribute && rollData.various.limbEnhancements.includes(o.label)))
      //Forbidden Arcana p. 90-95: the boxes of a spirit type, shown once the type is known (dialog, or the targeted spirit)
      if (rollData.test.type === "skillDicePool" && SPIRIT_TYPE_SKILLS.includes(rollData.test.typeSub)){
        rollData.situational = offers.concat(spiritTypeOffers(actor.system.skills[rollData.test.typeSub]?.spiritType, actor.situationalEffects || []))
        const targetType = rollData.target?.actorId ? SR5_EntityHelpers.getRealActorFromID(rollData.target.actorId, rollData.actorUuids)?.system?.type : null
        spiritTypeVisible(rollData.situational, targetType || rollData.magic?.spiritType)
      }
      //A condition on the target's metatype (The Complete Trog p. 179) ticks its box when it is met
      if (offers.some(o => o.targetMetatype) && game.user.targets.size){
        const target = await SR5_PrepareRollHelper.getTargetedActor()
        const biography = target?.system?.biography
        tickByTargetMetatype(rollData, biography?.metatype || biography?.characterMetatype || "", METATYPE_FAMILIES)
      }
      //Kept for the dialog, which matches them again when the attribute is changed there
      rollData.situationalScoped = scoped
      if (always.length) rollData.dicePool.modifiers = (rollData.dicePool.modifiers || []).concat(always)
      //Effects other actors carry on this roll: its target's, the auras around the roller (roll-helpers/indirect.js)
      addIndirectEffects(rollData, actor)
      //SR5 p. 268: a drone's action suffers the noise of the distance to its wireless rigger (rigger-noise.js)
      applyRiggerNoise(rollData, actor, {
        resolve: id => SR5_EntityHelpers.getRealActorFromID(id), label: game.i18n.localize("SR5.RiggerNoise")
      })
      //Bullets & Bandages p. 14-16: the dialog of First Aid and Medicine asks what the test is for
      if (underFireRules() && (rollData.test.typeSub === "firstAid" || rollData.test.typeSub === "medecine")) rollData.various.bbUnderFire = true
      //Bullets & Bandages p. 18: improvised supplies take the hits of an improvising roll off the -3
      if (advancedMedkitRules()) rollData.various.bbImprovised = true
      if (rollData.test.type === "spell" && rollData.target?.hasTarget){
        const drain = bbStabilizeDrain(rollData.owner?.itemUuid ? fromUuidSync(rollData.owner.itemUuid)?.name : null, SR5_EntityHelpers.getRealActorFromID(rollData.target.actorId, rollData.actorUuids), rollData.magic.drainFloor ?? 2)
        if (drain !== null) rollData.magic.bbStabilizeDrain = drain
      }
      //Whoever reads the card later (a GM on another scene) finds the same tokens as the roller (helpers.js)
      rollData.actorUuids = SR5_EntityHelpers.cardActorUuids(rollData, actor, chatData)
      SR5_RollTest.generateRollDialog(rollData)
    }
  }

  //Get the base data to build a roll test
  static getBaseRollData(document, actor) {
    let item, speakerActor, speakerId, speakerImg

    if (document?.documentName === "Item"){
      item = document
    }

    //Get owner chat message base data
    if (actor.isToken){
      speakerActor = actor.token.name
      speakerId = actor.token.id
      speakerImg = actor.token.texture.src
    } else {
      speakerId = actor.id
      let token = canvas.scene?.tokens.find((t) => t.actorId === speakerId)
      if (token){
        speakerActor = token.name
        speakerImg = token.texture.src
      } else {
        speakerActor = actor.name
        speakerImg = actor.img
      }
    }

    let rollData = {
      chatCard: {
        calledShotButton: false,
        canEditResult: false,
        templatePlace: false,
        templateRemove: false,
        buttons: {
        },
      },
      combat: {
        actions: [],
        environmentalMod: null,
        activeDefenses: {
          dodge: 0,
          block: 0,
          parryClubs: 0,
          parryBlades: 0,
          full: 0,
          selected: null,
        },
        ammo: {
          type: "",
          value: 0,
          max: 0,
          fired: 0,
          effects: null,
        },
        armorPenetration: 0,
        calledShot: {
          name: null,
          effects: [],
          hitsSpent: false,
          initiative: null,
          limitDV: 0,
          location: null,
          martialArts: {
            pin: false,
            disarm: false,
            entanglement: false,
            breakWeapon: false,
            feint: false,
          },
          martialArtsModifiers: {
          },
          itemModifiers: {
          },
        },
        firingMode: {
          singleShot: false,
          semiAutomatic: false,
          burstFire: false,
          fullyAutomatic: false,
          selected: "",
        },
        grenade: {
          isGrenade: false,
          damageFallOff: 0,
          blastRadius: 0,
          templateId: "",
        },
        range: {
          short: 0,
          medium: 0,
          long: 0,
          extreme: 0,
        },
        choke: {
          selected: "",
          limit: "",
          defense: "",
          damageModify: 0,
        },
        ramming: {
          angle: "side",
          attackerSpeed: 0,
          attackerLocomotion: "ground",
          targetSpeed: 0,
          targetLocomotion: "ground",
          targetIsVehicle: false,
          gait: "walk",
          relativeSpeed: 0,
        },
        reach: 0,
        recoil:{
          compensationWeapon: 0,
          compensationActor: 0,
          cumulative: 0,
          value: 0,
        },
        weaponType: "",
      },
      damage: {
        base: 0,
        value: 0,
        type: "",
        element: null,
        elementSecond: null,
        toxin: {
        },
        isContinuous: false,
        source: "",
        resistanceType: "",
        // Only an attack can knock down (SR5 p. 195): set where an attack lands, never on other damage
        isAttack: false,
        aggravated: false,
        matrix: {
          value: 0,
          base: 0,
          modifiers:{
          },
        },
      },
      dialogSwitch:{
        attribute: false,
        centering: false,
        chooseDamageType: false,
        cover: false,
        extended: false,
        penalty: false,
        publicGrid: false,
        reagents: false,
        specialization: false,
        spellShaping: false,
        spiritAid: false,
        transferEffect: false,
        transferEffectOnItem: false,
      },
      dicePool: {
        base: 0,
        composition: [],
        modifiers: [],
        modifiersTotal: 0,
        value: 0,
        cumulativeDefense: 0
      },
      edge: {
        canUseEdge: false,
        hasUsedPushTheLimit: false,
        hasUsedSecondChance: false,
      },
      effects: {
        canApplyEffect: false,
        canApplyEffectOnItem: false,
      },
      limit: {
        base: 0,
        composition: [],
        modifiers: {
        },
        modifiersTotal: 0,
        type: "",
        value: 0,
      },
      lists: {
        allAttributesWithoutEdge: actor.system.lists.allAttributesWithoutEdge,
        extendedIntervals: SR5_EntityHelpers.sortByTranslatedTerm(actor.system.lists.extendedIntervals, "extendedIntervals"),
        characterAttributes: actor.system.lists.characterAttributes,
        vehicleAttributes: actor.system.lists.vehicleAttributes,
        perceptionModifiers: SR5_EntityHelpers.sortByTranslatedTerm(actor.system.lists.perceptionModifiers, "perceptionModifiers"),
        perceptionTypes: SR5_EntityHelpers.sortByTranslatedTerm(actor.system.lists.perceptionTypes, "perceptionTypes"),
        spiritTypes: actor.system.lists.spiritTypes,
        damageTypes: actor.system.lists.damageTypes,
        gridTypes: actor.system.lists.gridTypes,
        spriteTypes: actor.system.lists.spriteTypes,
        targetSignature: actor.system.lists.targetSignature,
        objectTypes: actor.system.lists.objectTypes,
        perceptionThresholdType: actor.system.lists.perceptionThresholdType,
        matrixSearchInfoType: actor.system.lists.matrixSearchInfoType,
        matrixNoiseDistance: actor.system.lists.matrixNoiseDistance,
        matrixMarks: actor.system.lists.matrixMarks,
        healingConditions: actor.system.lists.healingConditions,
        healingSupplies: actor.system.lists.healingSupplies,
        restraintType: actor.system.lists.restraintType,
        weaponModesCode: actor.system.lists.weaponModesCode,
        coverTypes: actor.system.lists.coverTypes,
        characterSpecialDefensesDodge: actor.system.lists.characterSpecialDefensesDodge,
        characterSpecialDefenses: actor.system.lists.characterSpecialDefenses,
        chokeSettings: actor.system.lists.chokeSettings,
        workingCondition: actor.system.lists.workingCondition,
        toolsAndParts: actor.system.lists.toolsAndParts,
        plansMaterial: actor.system.lists.plansMaterial,
        weaponRanges: actor.system.lists.weaponRanges,
        preparationTriggerTypes: actor.system.lists.preparationTriggerTypes,
        socialAttitude: actor.system.lists.socialAttitude,
        socialResult: actor.system.lists.socialResult,
        survivalWeather: actor.system.lists.survivalWeather,
        survivalTerrain: actor.system.lists.survivalTerrain,
      },
      magic: {
        drain: {
          value: 0,
          type: "",
          modifiers: {
          },
        },
        force: null,
        hasUsedReagents: false,
        //Reagent tier spent and reagents of another tradition (modules/system/reagents.js)
        reagentTier: "raw",
        reagentForeign: false,
        spell: {
          category: "",
          isResisted: false,
          objectCanResist: false,
          range: 0,
          area: 0,
          // Spell Shaping (SR5 p. 329): shaping points spent on widening the area,
          // and points spent on bubbles that leave characters untouched.
          areaShaping: 0,
          sparedCount: 0,
          sparedActors: [],
          type: "",
          // Death Sower (Forbidden Arcana p. 40): DV bonus of a combat spell
          damageBonus: 0,
        },
        spiritAid: {
          id: "",
          modifier: 0,
        },
        elements: null,
        spiritType: null,
        tradition: actor.system.magic?.tradition,
        preparationTrigger: null,
      },
      matrix: {
        defenderDoBiofeedbackDamage: false,
        iceType: "",
        mark: 0,
        actionType: "",
        overwatchScore: false,
        depth: 0,
        emulateRating: 0,
        emulateMax: 0,
        emulateAttributeValue: 0,
        noiseRange: "wired",
        noiseScene: 0,
        level: null,
        fading: {
          value: 0,
          type: "",
          modifiers: {
          },
        }
      },
      owner: {
        actorId: speakerId,
        actorType: actor?.type,
        itemId: item?.id,
        itemUuid: item?.uuid,
        messageId: null,
        speakerActor: speakerActor,
        speakerId: speakerId,
        speakerImg: speakerImg,
      },
      previousMessage:{
        actorId: null,
        itemUuid: null,
        attackerStrength: 0,
        damage: 0,
        messageId: null,
        hits: 0,
      },
      roll: {
      },
      systemRules:{
        calledShots: false,
        grid: false,
      },
      target: {
        hasTarget: false,
        actorId: null,
        actorType: "",
        itemUuid: null,
        itemList: {
        },
        grid: "",
        rangeInMeters: 0,
        range: 0,
        sceneId: null,
      },
      test: {
        actionType: "",
        isExtended: false,
        isOpposed: false,
        extended: {
          interval: "",
          intervalValue: 0,
          multiplier: 1,
          //Intervals already put on the world clock (system/extended-clock.js): a card rolled before the calendar
          //has no such field and offers no clock button
          clockAdvanced: 0,
        },
        title: "",
        type: "",
        typeSub: "",
      },
      threshold: {
        value: 0,
        type: null,
      },
      various: {
      },
    }

    return rollData
  }
}