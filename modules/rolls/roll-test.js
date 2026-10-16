import {
  refuseByRule, ruleLockBinds
} from "../system/rule-locks.js"
import {
  SR5_SystemHelpers 
} from "../system/utilitySystem.js"
import {
  SR5_EntityHelpers 
} from "../entities/helpers.js"
import {
  SR5_RollMessage 
} from "./roll-message.js"
import {
  spendPending
} from "../system/social-pending.js"
import {
  socialCardInfo
} from "../system/social-card.js"
import {
  SR5_RollTestHelper 
} from "./roll-test-helper.js"
import * as SR5_AddRollInfo from "./roll-test-case/index.js"

//The fixed id of the roll window: one at a time (SR5_RollTest.dialogQueue)
const ROLL_WINDOW_ID = "jet"

//An object hidden on oneself is the GM's to know too, not the table's (SR5 p. 422)
const PICKPOCKET_TESTS = ["pickpocket", "pickpocketPerception", "concealItem"]
import {
  SR5Combat 
} from "../system/srcombat.js"
import SR5_RollDialog from "./roll-dialog.js"
import {
  testsLeash
} from "../entities/items/spirit-bonds.js"
import {
  bloodSpending, martyrPoints, bloodAddictionThreshold, bloodDrain, bloodSpellUnpaid
} from "../system/blood-magic-rules.js"
import {
  bloodPointsOf, spendBloodPoints, athamePointsOf, spendAthamePoints
} from "../system/blood-magic.js"
import {
  thresholdModifierOf, applyThresholdModifier, hasOwnThreshold
} from "./roll-helpers/threshold.js"
import {
  isStructuredSpell, pushedHits
} from "./roll-helpers/arcana-metamagics.js"
import {
  refreshWoundModifiers
} from "./roll-helpers/extended-wounds.js"
import {
  rapidFireAfterUse
} from "../entities/items/magic-masteries.js"
import {
  isRecoilCarriedOver, buildsProgressiveRecoil
} from "./roll-helpers/recoil.js"
import {
  SR5_ConverterHelpers 
} from "./roll-helpers/converter.js"
import {
  SR5_CombatHelpers
} from "./roll-helpers/combat.js"
import {
  SR5_MiscellaneousHelpers
} from "./roll-helpers/miscellaneous.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  SR5_ActorHelper
} from "../entities/actors/entityActor-helpers.js"
import {
  reagentSystem, reagentChoices, reagentLimit, reagentTestKind, drainReduction, normalizeTier, tierStock, tierPath,
  effectiveDrachms, stockAfterSpending, TIER_LABELS
} from "../system/reagents.js"
import {
  rollLimitValue, secondChanceLimit
} from "./roll-helpers/limit.js"

export class SR5_RollTest {
  //The roll window open now, if any: the next one waits for it (generateRollDialog)
  static dialogQueue = Promise.resolve()

  //DialogV2.wait answers at the click of a button, before its window is closed: the next window of the same id,
  //rendered meanwhile, neither opened nor answered, and held every later roll of the client until a reload (lot 17b,
  //présentation de DjamZ du 08/10). The next one now waits for the window to be gone from Foundry's registry.
  static rollWindowClosed({
    step = 50, max = 5000
  } = {
  }){
    const open = () => !!globalThis.foundry?.applications?.instances?.get?.(ROLL_WINDOW_ID)
    return new Promise(resolve => {
      const started = Date.now()
      const check = () => (!open() || Date.now() - started >= max) ? resolve() : setTimeout(check, step)
      check()
    })
  }

  //The queue never holds the rolls of the client for good: a turn still pending with no roll window on screen for
  //`quiet` ms is stale (a window that failed to open), and the next roll goes on
  static queueSettled(queue, {
    step = 250, quiet = 2000
  } = {
  }){
    let settled = false
    const done = queue.then(() => {
      settled = true
    }, () => {
      settled = true
    })
    const stale = new Promise(resolve => {
      let since = null
      const check = () => {
        if (settled) return resolve()
        const open = !!globalThis.foundry?.applications?.instances?.get?.(ROLL_WINDOW_ID)
        since = open ? null : since ?? Date.now()
        if (since !== null && Date.now() - since >= quiet) {
          SR5_SystemHelpers.srLog(1, "Roll window queue stale: the next roll goes on")
          return resolve()
        }
        setTimeout(check, step)
      }
      setTimeout(check, step)
    })
    return Promise.race([done, stale])
  }

  //Prepare the roll window
  static async generateRollDialog(dialogData, edge = false) {
    let actor = SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId),
      actorData = actor.system,
      template = "systems/sr5/templates/rolls/roll-dialog.hbs"

    //Handle Edge
    //An Edge point already spent pushes the limit of the roll (a crazy stunt, chase-roll-prepare.js): no other one
    dialogData.edge.canUseEdge = !(dialogData.edge.prepaidPush > 0) && await SR5_RollTestHelper.canUseEdge(actor, dialogData)
    let edgeActor = await SR5_RollTestHelper.determineEdgeActor(actor)

    // Capture final DOM values before dialog closes
    const captureResult = (action, dialog) => ({
      action,
      reagentsSpent: parseInt(dialog.element.querySelector('[name="reagentsSpent"]')?.value || 0),
      reagentTier: dialog.element.querySelector('[name="reagentTier"]')?.value || "raw",
      reagentForeign: !!dialog.element.querySelector('[name="reagentForeign"]')?.checked,
      harvestZone: dialog.element.querySelector('[name="harvestZone"]')?.value,
    })

    //Reagent tiers offered in the dialog (Shadow Spells, Forbidden Arcana)
    dialogData.magic.reagentChoices = reagentChoices(actorData.magic)
    if (dialogData.magic.reagentChoices.hasTiers && !(tierStock(actorData.magic, dialogData.magic.reagentTier) > 0)) {
      dialogData.magic.reagentTier = dialogData.magic.reagentChoices.tiers.find(t => t.stock > 0)?.key ?? "raw"
    }

    // Build DialogV2 buttons
    let buttons = [
      {
        action: "roll",
        label: game.i18n.localize("SR5.RollDice"),
        icon: "fas fa-dice-six",
        default: true,
        callback: (event, button, dialog) => captureResult("roll", dialog),
      },
    ]
    if (dialogData.edge.canUseEdge) {
      buttons.push({
        action: "edge",
        label: game.i18n.localize("SR5.PushTheLimit"),
        icon: "fas fa-bomb",
        callback: (event, button, dialog) => captureResult("edge", dialog),
      })
    }

    //Threshold modifier of the character (Bliss, Purple Orchid), shown in the dialog and added once it closes
    dialogData.thresholdModifier = hasOwnThreshold(dialogData.test) ? thresholdModifierOf(actorData, dialogData.test) : {
      value: 0, sources: []
    }

    // Render template and show dialog
    const dlg = await foundry.applications.handlebars.renderTemplate(template, dialogData)
    //One roll window at a time (its id is fixed): a second one asked meanwhile (two actors of the same user in the
    //area of a spell, M5 D3) opens once the first is closed, instead of being lost
    const turn = SR5_RollTest.queueSettled(SR5_RollTest.dialogQueue).then(() => SR5_RollTest.rollWindowClosed()).then(() => foundry.applications.api.DialogV2.wait({
      window: {
        title: dialogData.test.title
      },
      id: ROLL_WINDOW_ID,
      position: {
        width: 450 
      },
      content: dlg,
      buttons,
      rejectClose: false,
      render: (event, dialog) => {
        const element = dialog.element
        const rollDialog = new SR5_RollDialog(dialog, element, dialogData)
        rollDialog.activateListeners(element)
        //An action the character no longer has keeps the dialog open, when the world setting asks for it
        element.querySelectorAll('button[data-action="roll"], button[data-action="edge"]').forEach(b => b.addEventListener("click", ev => {
          if (!SR5_RollTest.rollClickRefused(actor, dialogData)) return
          ev.preventDefault()
          ev.stopImmediatePropagation()
        }))
      },
    }))
    SR5_RollTest.dialogQueue = turn.catch(() => null)
    const result = await turn

    //If roll is cancelled (dialog dismissed without clicking a button)
    if (!result) return SR5_RollTestHelper.handleCanceledTest(actor, dialogData)

    //If roll "push the limits"
    if (result.action === "edge") {
      edge = true
      if (edgeActor) dialogData = await SR5_RollTestHelper.handleEdgeUse(edgeActor, dialogData)
    } else if (dialogData.edge.prepaidPush > 0) {
      //Its point was spent as the test was launched (R5 p. 182): the usual Edge dice, nothing more to spend
      edge = true
      dialogData.dicePool.modifiers.push({
        type: "edge", label: game.i18n.localize("SR5.Edge"), value: dialogData.edge.prepaidPush,
      })
      dialogData.edge.canUseEdge = false
    }

    //Verify if reagents are used, if so, remove from actor
    if (dialogData.magic.hasUsedReagents && result.reagentsSpent > 0) {
      const tier = normalizeTier(result.reagentTier)
      const spent = Math.min(result.reagentsSpent, tierStock(actorData.magic, tier))
      dialogData.magic.reagentsSpent = spent
      dialogData.magic.reagentTier = tier
      dialogData.magic.reagentForeign = result.reagentForeign
      //Another tradition's reagents work at half their Power (SR5 p. 320)
      dialogData.magic.reagentsEffective = effectiveDrachms(spent, result.reagentForeign)
      await actor.update({
        [tierPath(tier)]: stockAfterSpending(tierStock(actorData.magic, tier), spent)
      })
    } else dialogData.magic.hasUsedReagents = false
    if (result.harvestZone) dialogData.magic.reagentHarvestZone = result.harvestZone

    //Rapid-Fire Caster (Forbidden Arcana p. 38): a reckless spell cast without the Drain increase uses one of the day
    if (dialogData.magic.rapidFireCaster?.used && dialogData.magic.recklessCast) {
      const record = dialogData.magic.rapidFireCaster.rest ? null : actor.getFlag("sr5", "rapidFireCaster")
      await actor.setFlag("sr5", "rapidFireCaster", rapidFireAfterUse(record, game.time?.worldTime ?? 0))
    }

    //Rename chatCard title for extended test
    if (dialogData.test.isExtended) dialogData.test.title = dialogData.test.title.replace("Test", game.i18n.localize("SR5.ExtendedTest"))

    //Ensure force and level are determined
    if ((dialogData.test.type === "spell" || dialogData.test.typeSub === "summoning" || dialogData.test.type === "preparationFormula") && isNaN(dialogData.magic.force)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_NoForce"))
      dialogData.magic.force = actorData.specialAttributes.magic.augmented.value
    }
    if ((dialogData.test.type === "complexForm" || dialogData.test.typeSub === "compileSprite") && isNaN(dialogData.matrix.level)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_NoLevel"))
      dialogData.matrix.level = actorData.specialAttributes.resonance.augmented.value
    }

    //Blood magic (Street Grimoire p. 90, Forbidden Arcana p. 130): the points spent, read again against those at hand.
    //The Force they add calls for no Drain and may exceed twice the Magic; the martyr's wounds are taken now; the
    //sacrifice's points call for an addiction test, offered on the card
    const blood = dialogData.test.type === "spell" ? dialogData.magic.bloodMagic : null
    if (blood) {
      const martyr = martyrPoints(blood.martyrBoxes, blood.selfCost)
      const spent = bloodSpending({
        force: blood.force, drainMagic: blood.drainMagic, drain: blood.drain, martyr, athame: athamePointsOf(actor), pool: bloodPointsOf(actor)
      })
      Object.assign(blood, spent, {
        martyrPoints: martyr
      })
      delete blood.woundModifier
      delete dialogData.limit.modifiers.bloodMagic
      if (spent.fromAthame > 0) await spendAthamePoints(actor, spent.fromAthame)
      if (spent.fromPool > 0) await spendBloodPoints(actor, spent.fromPool)
      //The athame's points come from sacrifices too: only the martyr's call for no test
      if (spent.fromPool + spent.fromAthame > 0) {
        blood.addictionThreshold = bloodAddictionThreshold(spent, actorData.specialAttributes?.magic?.augmented?.value)
      }
      dialogData.magic.force = (Number(dialogData.magic.force) || 0) + spent.force
      if (blood.martyrBoxes > 0) await SR5_RollTest.martyrWounds(actor, blood.martyrBoxes)
    }

    //Add limit for force, reagents and level
    if ((dialogData.magic.force || dialogData.magic.hasUsedReagents) && dialogData.test.type !== "spellResistance"){
      if (dialogData.magic.force > 0) {
        dialogData.limit.base = dialogData.magic.force
        dialogData.limit.type = "force"
      }
      if (dialogData.magic.hasUsedReagents) {
        const magic = actorData.specialAttributes?.magic?.augmented?.value ?? 0
        const system = reagentSystem()
        const reagents = reagentLimit({
          system, test: dialogData.test, tier: dialogData.magic.reagentTier, effective: dialogData.magic.reagentsEffective,
          spent: dialogData.magic.reagentsSpent, baseLimit: dialogData.limit.base, magic
        })
        if (reagents.base !== dialogData.limit.base) {
          dialogData.limit.base = reagents.base
          dialogData.limit.type = "reagents"
        }
        if (reagents.bonus) dialogData.limit.modifiers.reagentTier = {
          value: reagents.bonus, label: game.i18n.localize(TIER_LABELS[dialogData.magic.reagentTier]),
        }
        dialogData.limit.unlimited = reagents.unlimited
        //Forbidden Arcana p. 181: the Drain the tier takes off, within what the limit bonus left of the Magic
        dialogData.magic.reagentDrainReduction = drainReduction({
          system, tier: dialogData.magic.reagentTier, testKind: reagentTestKind(dialogData.test),
          spent: dialogData.magic.reagentsSpent, magic, limitBonusUsed: reagents.bonus
        })
        if (dialogData.magic.reagentDrainReduction && dialogData.test.type === "spell") {
          dialogData.magic.drain.modifiers.reagentTier = {
            value: -dialogData.magic.reagentDrainReduction, label: game.i18n.localize(TIER_LABELS[dialogData.magic.reagentTier]),
          }
          //Blood Magic Points come off after the floor, down to 0 (Street Grimoire p. 90)
          const bloodOff = Math.max(0, -(Number(dialogData.magic.drain.modifiers.bloodMagic?.value) || 0))
          dialogData.magic.drain.value = bloodDrain(Math.max(dialogData.magic.drainFloor ?? 2, dialogData.magic.drain.value + bloodOff - dialogData.magic.reagentDrainReduction), bloodOff)
        }
      }
    }
    if (dialogData.matrix.level) {
      dialogData.limit.base = dialogData.matrix.level
      dialogData.limit.type = "level"
    }

    //Raise the threshold of the test, if it has one (Bliss SR5 p. 412, Purple Orchid Chrome Flesh p. 190)
    if (hasOwnThreshold(dialogData.test)) dialogData.threshold = applyThresholdModifier(dialogData.threshold, dialogData.thresholdModifier)

    //Add limit modifiers
    dialogData = await SR5_RollTestHelper.handleLimitModifiers(dialogData)

    //Add dice pool modifiers
    dialogData = await SR5_RollTestHelper.handleDicePoolModifiers(dialogData)

    //Cutting Aces p. 153-154: what an earlier maneuver left is spent by this test (social-dialog.js); the card
    //keeps no copy of the dialog's lists
    if (dialogData.social?.ca) {
      await spendPending(actor, dialogData.social.usedPending, dialogData.social.droppedPending)
      delete dialogData.social.ca
    }

    // SR5 p. 178: recoil builds up shot after shot until the character spends a simple or complex action on something other than firing
    // SR5 p. 180: single-shot (SS) and suppressive fire (SF) weapons neither build nor suffer progressive recoil,
    // nor do weapons with no firing mode (bows, thrown weapons)
    // Outside combat there are no action phases to carry recoil over: each shot stands alone
    if (dialogData.combat.ammo.fired > 0){
      if (buildsProgressiveRecoil(dialogData.combat.firingMode.selected) && isRecoilCarriedOver(actor)){
        //A change of firing mode or choke spent with this roll ended the earlier recoil (SR5 p. 178)
        let actualRecoil = SR5_MiscellaneousHelpers.changeEndsRecoil(dialogData.combat.actions) ? 0 : (actor.getFlag("sr5", "cumulativeRecoil") || 0)
        actualRecoil += dialogData.combat.ammo.fired
        await actor.setFlag("sr5", "cumulativeRecoil", actualRecoil)
      }
    } else if (dialogData.combat.actions.some(a => a.type === "simple" || a.type === "complex")) await actor.resetRecoil()

    // Roll dices
    if (edge) {
      // push the limits
      //Structured Spellcasting (Forbidden Arcana p. 43): Edge no longer lifts the limit of the spell
      dialogData.roll = await SR5_RollTest.rollDice({
        dicePool: dialogData.dicePool.value,
        explose: edge,
        limit: isStructuredSpell(dialogData) ? dialogData.limit.value : undefined,
      })
      dialogData.edge.hasUsedPushTheLimit = true
    } else {
      //Radical reagents lift the limit (Forbidden Arcana p. 181): the card shows none either
      if (dialogData.limit.unlimited) dialogData.limit.value = rollLimitValue(dialogData.limit)
      dialogData.roll = await SR5_RollTest.rollDice({
        dicePool: dialogData.dicePool.value,
        limit: dialogData.limit.value,
      })
    }

    //Add info to chatCard
    await SR5_RollTest.addInfoToCard(dialogData, dialogData.owner.actorId)

    // Return roll result and card info to chat message.
    await SR5_RollTest.renderRollCard(dialogData)

    //Update items according to roll
    if (dialogData.owner.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(dialogData)

    //Update spirit if spirit aid is used
    await SR5_RollTest.spendSpiritAidService(dialogData)

    //Update combatant if Active defense or full defense is used.
    SR5_RollTest.applyDefenseStance(dialogData, actor)

    //Change actions in combat tracker
    if (game.combat && dialogData.combat.actions.length){
      const fighter = SR5_RollTest.actionsFighter(actor, dialogData)
      await SR5Combat.changeActionInCombat(fighter === actor ? dialogData.owner.actorId : SR5Combat.fighterIdOf(fighter), dialogData.combat.actions)
    }
  }

  //The fighter whose actions a test spends: a vehicle test's (a chase action, Control a Vehicle) is the vehicle's
  //when it is in the combat, else its driver's (SR5Combat.vehicleFighter)
  static actionsFighter(actor, dialogData) {
    return dialogData?.test?.type === "vehicleTest" ? SR5Combat.vehicleFighter(actor) : actor
  }

  //SR5 p. 305-306: aiding a test is a service of a bound spirit. The dice pool modifiers are a list, and an
  //update keyed 'data' (Foundry V9) is ignored: the service is written by its path
  /**
   * Must a click on "roll" keep the dialog open? Suppressive fire and the flamethrower sweep need all their rounds
   * (SR5 p. 179, Gun H(e)aven 3 p. 3): refused by the "ammo" rule lock family. Lifted, the roll goes with the rounds
   * left and the clip stops at 0 (roll-test-helper); the gamemaster hears of it only once the roll really goes,
   * after the actions check (B13, lot 2)
   */
  //Martyr blood magic (Forbidden Arcana p. 130): the Physical damage the caster gives himself, unresisted
  static async martyrWounds(actor, boxes){
    const {
      SR5_PrepareRollTest
    } = await import("./roll-prepare.js")
    const chatData = SR5_PrepareRollTest.getBaseRollData(null, actor)
    chatData.damage.value = boxes
    chatData.damage.type = "physical"
    await actor.takeDamage(chatData)
  }

  static rollClickRefused(actor, dialogData) {
    //A Blood spell is cast with at least one Blood Magic Point spent (Forbidden Arcana p. 122): the dialog stays open
    if (bloodSpellUnpaid(dialogData.magic?.bloodMagic)) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_BloodSpellNeedsPoint"))
      return true
    }
    const mode = dialogData.combat.firingMode.selected, left = dialogData.combat.ammo.value ?? 0
    const missingAmmo = dialogData.test.typeSub === "rangedWeapon" && SR5_ConverterHelpers.missingAmmo(mode, left)
    //Suppressive fire is refused on an empty magazine only (SR5 p. 181): it does not ask for 20 rounds (Lucas#2058, C3)
    const refuse = () => refuseByRule("ammo", mode === "SF" ? "SR5.WARN_SuppressiveFireEmpty" : "SR5.WARN_FiringModeAmmo", {
      needed: SR5_ConverterHelpers.firingModeToBullet(mode), left
    }, {
      actor
    })
    if (missingAmmo && ruleLockBinds("ammo")) return refuse()
    if (!SR5Combat.hasActionsLeft(SR5_RollTest.actionsFighter(actor, dialogData), dialogData.combat.actions)) return true
    if (missingAmmo) refuse()
    //Fewer than 20 rounds: the zone is narrower, the fire is not refused (SR5 p. 181)
    else if (mode === "SF" && dialogData.test.typeSub === "rangedWeapon" && left < 20) ui.notifications.info(game.i18n.format("SR5.INFO_SuppressiveFireNarrowed", {
      left, width: SR5_ConverterHelpers.suppressiveFireWidth(left)
    }))
    return false
  }

  static async spendSpiritAidService(dialogData) {
    if (!(dialogData.dicePool.modifiers.find(m => m.type === "spiritAid")?.value > 0)) return
    let spiritItem = await fromUuid(dialogData.magic.spiritAid.id)
    await spiritItem.update({
      "system.services.value": spiritItem.system.services.value - 1
    })
    ui.notifications.info(`${spiritItem.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format('SR5.INFO_ServicesReduced', {
      service: 1
    })}`)
    //A duplicated summoner carries the same item ids: the spirit is the one this summoner called
    let spiritActor = spiritItem.parent ? SR5_ActorHelper.findSidekick(game.actors, SR5_ActorHelper.sidekickCreatorId(spiritItem.parent), spiritItem.id) : null
    if (spiritActor){
      let services = spiritActor.system.services.value - 1
      //A summoned spirit is often the GM's: a player who does not own it hands the update to the GM
      if (spiritActor.isOwner) await spiritActor.update({
        "system.services.value": services
      })
      else await SR5_SocketHandler.emitForGM("updateActorData", {
        actorId: spiritActor.id,
        dataToUpdate: {
          services: {
            value: services
          }
        },
        //The GM lets one service go, for the owner of the summoner (socket-guard.js)
        use: "spiritService",
      })
    }
  }

  // Full defense (SR5 p. 170 and 189) costs 10 initiative and stays for the turn;
  // dicePool.modifiers is an array, the checkbox adds a "fullDefense" entry
  static applyDefenseStance(dialogData, actor){
    let fullDefense = dialogData.dicePool.modifiers.some(m => m.type === "fullDefense")
    if (!fullDefense && dialogData.combat.activeDefenseSelected === "none") return
    let initModifier = 0
    if (fullDefense && !actor.effects.find(e => e.origin === "fullDefense")){
      initModifier += -10
      SR5_CombatHelpers.applyFullDefenseEffect(actor)
    }
    if (dialogData.combat.activeDefenseSelected !== "") initModifier += SR5_ConverterHelpers.activeDefenseToInitMod(dialogData.combat.activeDefenseSelected)
    if (initModifier < 0) SR5Combat.changeInitInCombatHelper(SR5Combat.fighterIdOf(actor), initModifier)
  }

  /** Roll a shadowrun 5 test
	 * @param {Number} dicePool - Number of dice to roll
	 * @param {Number} limit - Limit maximum success
	 * @param {Boolean} explose - Handle explosing 6 result
	 */
  static async rollDice({
    dicePool, limit, explose, edgeRoll 
  }) {
    let formula = `${dicePool}d6`
    if (explose) formula += "x6"
    if (limit) formula += `kh${limit}`
    formula += "cs>=5"

    let roll = new Roll(formula)
    let rollMode = game.settings.get("core", "rollMode")
    let rollRoll = await roll.evaluate()
    let rollJSON = await roll.toJSON(rollRoll)
    //Glitch
    //Rule of Six (SR5 p. 58): Die#explode adds the rerolled dice after the pool. Their 1s do not count
    //for the glitch, only the first roll does (DjamZ's ruling B30)
    let realHits = 0
    for (let [i, d] of rollJSON.terms[0].results.entries()) {
      if (explose && i >= dicePool) d.ruleOfSix = true
      if (d.result === 1 && !d.ruleOfSix) d.glitch = true
      if (edgeRoll) d.edge = true
      if (d.result >= 5) realHits ++
    }

    let rollResult = {
      dicePool: dicePool,
      hits: rollRoll.total,
      realHits: realHits,
      ...SR5_RollTest.glitchStatus(rollJSON.terms[0].results, dicePool),
      dices: rollJSON.terms[0].results,
      limit: limit,
      rollMode: rollMode,
      r: rollJSON,
      originalRoll: roll
    }

    return rollResult
  }

  /** SR5 p. 47: more than half the dice show 1 is a glitch; a glitch with no hit is a critical glitch.
   * Hits are counted on the dice rolled (a serialized Die term has no total, and a limit never brings them to 0).
   * The 1s of dice rerolled by the Rule of Six are left out, as they are out of the pool (SR5 p. 58).
   * @param {Array} dices - Results of every die rolled for the test
   * @param {Number} dicePool - Number of dice in the pool
   */
  static glitchStatus(dices, dicePool) {
    let ones = dices.filter(d => d.result === 1 && !d.ruleOfSix).length,
      hits = dices.filter(d => d.result >= 5).length,
      glitch = ones > dicePool/2
    return {
      glitchRoll: glitch && hits > 0,
      criticalGlitchRoll: glitch && hits === 0,
    }
  }

  //Handle extended roll
  static async extendedRoll(message, actor){
    let messageData = message.flags.sr5data
    //A test whose healing was applied is over (SR5 p. 207): a new roll added its hits to those already healed, and the
    //card offered to heal them all again (lot 17c: 4 boxes, then 6 more, from 6 hits)
    if (messageData.extendedTest === false) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_ExtendedTestOver"))
      return false
    }
    //SR5 p. 207: the next roll of a natural Physical recovery waits for the Stun damage to be healed, as the first one
    if (SR5_ActorHelper.stunHealsFirstRefused(actor, messageData.test.type, messageData.test.typeSub)) return false

    //Prepare new chat card: the base pool and its modifiers, minus one die per earlier roll (SR5 p. 50).
    //GM ruling (05/10): Push the limit joins the starting pool of an extended test, every roll keeps its Edge dice
    //(exploding, no limit) and the point is spent once. Edge is only offered on the first roll
    //SR5 p. 58 says nothing of Edge during an extended test: DjamZ filled the gap. A ruling, not a house rule, so no setting
    let newMessage = foundry.utils.duplicate(messageData)
    newMessage.test.extended.roll += 1
    SR5_EntityHelpers.removeElementFromArray(newMessage.dicePool.modifiers, 'type', "extendedTest")
    //SR5 p. 50 and 171: each roll is made with the wounds the character has at that time, not those of the first roll
    const skillKey = ["skill", "skillDicePool"].includes(newMessage.test.type) ? newMessage.test.typeSub : null
    newMessage.dicePool.modifiers = refreshWoundModifiers(newMessage.dicePool.modifiers, actor.system?.penalties, {
      sheetModifiers: skillKey ? actor.system?.skills?.[skillKey]?.test?.modifiers ?? null : null
    })
    delete newMessage.originalModifiers
    let pushedTheLimit = !!messageData.edge.hasUsedPushTheLimit
    newMessage.edge.canUseEdge = false
    newMessage.dicePool.modifiers.push({
      type: "extendedTest",
      label: game.i18n.localize("SR5.ExtendedTest"),
      value: -(newMessage.test.extended.roll - 1),
    })
    newMessage = await SR5_RollTestHelper.handleDicePoolModifiers(newMessage)

    //roll new test
    let newRoll = await SR5_RollTest.rollDice({
      dicePool: newMessage.dicePool.value,
      limit: pushedTheLimit ? undefined : messageData.limit.value,
      explose: pushedTheLimit,
    })

    //Keep only original hits and concatenat with new hits
    let dicesKeeped = messageData.roll.dices.filter(function (d) {
      return d.result > 4
    })
    let dicesTotal = newRoll.dices.concat(dicesKeeped)

    newMessage.roll.hits = messageData.roll.hits + newRoll.hits
    newMessage.roll.dices = dicesTotal
    //Edge spent after this roll works on this roll alone (SR5 p. 58): keep its own dice and hits apart from the kept ones
    newMessage.roll.rollDices = newRoll.dices
    newMessage.roll.rollHits = newRoll.hits
    newMessage.roll.realHits = messageData.roll.hits + newRoll.realHits
    //Earlier glitches stay counted for the whole test (SR5 p. 208: each glitched healing roll counts double)
    if (messageData.roll.glitchRoll || messageData.roll.criticalGlitchRoll) newMessage.test.extended.glitchedRolls = (messageData.test.extended.glitchedRolls || 0) + 1
    //Each roll of an extended test can glitch on its own (SR5 p. 47, 51)
    newMessage.roll.glitchRoll = newRoll.glitchRoll
    newMessage.roll.criticalGlitchRoll = newRoll.criticalGlitchRoll
    delete newMessage.roll.criticalGlitchDamage
    delete newMessage.roll.overwatchRaised
    await SR5_RollTest.addInfoToCard(newMessage, actor.id)

    if (newMessage.owner.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(newMessage, actor)

    //Handle Dice so Nice
    await SR5_RollTest.showDiceSoNice(newRoll.originalRoll, newRoll.rollMode)

    SR5_RollMessage.updateRollCardHelper(message.id, newMessage)
  }

  /** An extended test, even once its pool fell to one die (the card then stops offering a new roll) */
  static isExtendedTest(data) {
    return !!(data.test?.isExtended || data.test?.extended?.roll > 1)
  }

  //Handle second chance : reroll failed dice and update message with new message
  static async secondeChance(message, actor) {
    let messageData = message.flags.sr5data
    //GM ruling (05/10): during an extended test, Push the limit is the only use of Edge
    //B13: refused by the "actions" rule lock family; lifted, Second Chance goes and the gamemaster is whispered
    if (SR5_RollTest.isExtendedTest(messageData) && refuseByRule("actions", "SR5.WARN_EdgeExtendedTestPushOnly", null, {
      actor
    })) return false

    //Re roll failed dices
    let rollDices = messageData.roll.rollDices
    let rollHits = messageData.roll.rollHits ?? messageData.roll.hits
    //The dice that did not hit, counted on the dice themselves: the pool less the hits rerolled too many dice when the
    //limit had cut the hits (séance de DjamZ du 09/10)
    const rolled = rollDices ?? messageData.roll.dices
    let dicePool = Array.isArray(rolled) ? rolled.filter(d => d.result < 5).length : messageData.dicePool.value - messageData.roll.hits
    if (dicePool < 0) dicePool = 0
    //SR5 p. 58: Second Chance has no effect on limits. A test whose hits already reached its limit gains nothing,
    //only a test without limit (value 0, or lifted by radical reagents) keeps every new hit
    let limit = secondChanceLimit(messageData.limit, rollHits)
    let chance = await SR5_RollTest.rollDice({
      dicePool: dicePool, limit: limit ?? 0, edgeRoll: true
    })
    let chanceHit = chance.hits
    if (limit !== null) chanceHit = Math.min(chance.hits, limit)
    let dicesKeeped = messageData.roll.dices.filter(function (d) {
      return d.result > 4
    })

    //Met à jour les infos sur le nouveau message avec le résultat du nouveau jet.
    let newMessage = foundry.utils.duplicate(messageData)
    newMessage.roll.hits = messageData.roll.hits + chanceHit
    newMessage.roll.dices = dicesKeeped.concat(chance.dices)
    if (rollDices) newMessage.roll.rollDices = rollDices.filter(d => d.result > 4).concat(chance.dices)
    //The rerolled dice, kept apart on the roll the GM reads again (socket-guard.js recountHits): its own dice stay as rolled
    if (typeof newMessage.roll.r === "string") newMessage.roll.r = JSON.parse(newMessage.roll.r)
    if (newMessage.roll.r) newMessage.roll.r.secondChance = chance.r
    //Glitch status not read again: it stays the one of the initial roll. Second Chance cannot erase a glitch
    //(SR5 p. 58), and rerolled dice full of 1 do not create one (ruling of DjamZ, 2026-10-06, G5)
    newMessage.edge.hasUsedSecondChance = true
    newMessage.edge.canUseEdge = false
    await SR5_RollTest.addInfoToCard(newMessage, actor.id)
    if (newMessage.owner.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(newMessage, actor)

    //Remove 1 to actor's Edge
    await SR5_RollTestHelper.removeEdgeFromActor(messageData, actor)

    //Handle Dice so Nice
    await SR5_RollTest.showDiceSoNice(chance.originalRoll, chance.rollMode)

    //update message with new infos
    SR5_RollMessage.updateRollCardHelper(message.id, newMessage)
  }

  //Handle Push the Limit test
  static async pushTheLimit(message, actor, fromCard = false) {
    let messageData = message.flags.sr5data
    let dicePool
    //GM ruling (05/10): Edge joins the starting pool of an extended test, once: not on a later roll
    //B13: refused by the "actions" rule lock family; lifted, the push goes and the gamemaster is whispered
    if (SR5_RollTest.isExtendedTest(messageData) && (messageData.test.extended?.roll > 1 || messageData.edge.hasUsedPushTheLimit) &&
      refuseByRule("actions", "SR5.WARN_EdgeExtendedTestStartOnly", null, {
        actor
      })) return false

    //A spirit with no Edge left pushes the limit with its summoner's (SR5 p. 306)
    const edgeActor = await SR5_RollTestHelper.determineEdgeActor(actor)
    dicePool = edgeActor.system.specialAttributes?.edge?.augmented?.value ?? 0

    let newRoll = await SR5_RollTest.rollDice({
      dicePool: dicePool,
      explose: true,
      edgeRoll: true,
    })

    // SR5 p. 58: pushing the limit ignores the test limit, so start from the unlimited hits of the original roll
    let originalHits = messageData.roll.realHits ?? messageData.roll.hits
    let newMessage = foundry.utils.duplicate(messageData)
    //Structured Spellcasting (Forbidden Arcana p. 43): the limit of the spell still holds
    newMessage.roll.hits = pushedHits(isStructuredSpell(messageData) ? messageData.roll.hits : originalHits, newRoll.hits,
      messageData.limit.value, isStructuredSpell(messageData))
    newMessage.roll.realHits = originalHits + newRoll.realHits
    newMessage.roll.dices = messageData.roll.dices.concat(newRoll.dices)
    //The Edge dice join the pool: glitch is read again on every die rolled for this roll (SR5 p. 47, 58),
    //without the hits kept from earlier rolls of an extended test
    let rollDices = (messageData.roll.rollDices ?? messageData.roll.dices).concat(newRoll.dices)
    if (messageData.roll.rollDices) newMessage.roll.rollDices = rollDices
    Object.assign(newMessage.roll, SR5_RollTest.glitchStatus(rollDices, messageData.dicePool.value + dicePool))
    newMessage.edge.hasUsedPushTheLimit = true
    newMessage.edge.canUseEdge = false
    newMessage.dicePool.modifiers.push({
      type: "pushTheLimit",
      label: game.i18n.localize("SR5.PushTheLimit"),
      value: dicePool,
    })
    newMessage = await SR5_RollTestHelper.handleDicePoolModifiers(newMessage)
    await SR5_RollTest.addInfoToCard(newMessage, actor.id)
    if (newMessage.itemUuid) SR5_RollTestHelper.updateItemAfterRoll(newMessage, actor)

    //Handle Dice so Nice
    if (fromCard) await SR5_RollTest.showDiceSoNice(newRoll.originalRoll, newRoll.rollMode)

    //Remove 1 to actor's Edge
    await SR5_RollTestHelper.removeEdgeFromActor(messageData, actor)

    //Rafraichi le message avec les nouvelles infos.
    SR5_RollMessage.updateRollCardHelper(message.id, newMessage)
  }

  //Render the chat message
  // The full speaker of a card: scene, token and world actor, so that Foundry finds an unlinked token's actor (N95)
  static cardSpeaker(owner, uuids) {
    const actor = SR5_EntityHelpers.getRealActorFromID(owner.speakerId, uuids)
    if (!actor) return {
      actor: owner.speakerId, token: owner.speakerId, alias: owner.speakerActor
    }
    return {
      ...ChatMessage.getSpeaker({
        actor, token: actor.token
      }),
      alias: owner.speakerActor,
    }
  }

  static async renderRollCard(cardData) {
    //Add button to edit result for GM
    //if (game.user.isGM) cardData.chatCard.canEditResult = true;

    const templateData = cardData
    const template = `systems/sr5/templates/rolls/roll-card.hbs`
    let html = await foundry.applications.handlebars.renderTemplate(template, templateData)

    //Add chat buttons to chat card
    const temp = document.createElement("div")
    temp.innerHTML = html
    let divButtons = temp.querySelector('[id="srButtonTest"]')
    for (let button in cardData.chatCard.buttons){
      divButtons.insertAdjacentHTML("beforeend", `<button class="messageAction ${cardData.chatCard.buttons[button].testType} ${cardData.chatCard.buttons[button].gmAction}" data-action="${cardData.chatCard.buttons[button].testType}" data-type="${cardData.chatCard.buttons[button].actionType}">${cardData.chatCard.buttons[button].label}</button>`)
    }
    html = temp.innerHTML

    //A pocket is picked in secret: the target hears of it only if he notices, so both cards go to the GM
    if (PICKPOCKET_TESTS.includes(cardData.test.type) && !["gmroll", "blindroll"].includes(cardData.roll.rollMode)) cardData.roll.rollMode = "gmroll"

    let chatData = {
      roll: cardData.roll.r,
      rollMode: cardData.roll.rollMode,
      user: game.user.id,
      content: html,
      speaker: SR5_RollTest.cardSpeaker(cardData.owner, cardData.actorUuids),
    }

    if (["gmroll", "blindroll"].includes(cardData.roll.rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
    if (cardData.roll.rollMode === "blindroll") chatData["blind"] = true
    else if (cardData.roll.rollMode === "selfroll") chatData["whisper"] = [game.user]

    let userActive = game.users.get(chatData.user)
    cardData.owner.userId = game.user.id

    // v13: store all custom data under sr5data to avoid non-namespaced flag issues
    // Convert user.color to string (v13 Color object)
    cardData.owner.borderColor = typeof userActive.color === "string" ? userActive.color : String(userActive.color ?? "")
    cardData.sr5template = template
    chatData.flags = {
      sr5data: cardData
    }

    //Handle Dice so Nice
    if (cardData.roll.originalRoll) await SR5_RollTest.showDiceSoNice(cardData.roll.originalRoll, cardData.roll.rollMode)

    //Create chat message
    ChatMessage.create(chatData)
  }

  //Add support for the Dice So Nice module
  static async showDiceSoNice(roll, rollMode) {
    console.log(roll)
    if (game.modules.get("dice-so-nice") && game.modules.get("dice-so-nice").active) {
      let whisper = null
      let blind = false
      switch (rollMode) {
        case "blindroll": //GM only
          blind = true
          // falls through
        case "gmroll": { //GM + rolling player
          let gmList = game.users.filter(user => user.isGM)
          let gmIDList = []
          gmList.forEach(gm => gmIDList.push(gm.id))
          whisper = gmIDList
          break
        }
        case "roll": { //everybody
          let userList = game.users.filter(user => user.active)
          let userIDList = []
          userList.forEach(user => userIDList.push(user.id))
          whisper = userIDList
          break
        }
      }
      await game.dice3d.showForRoll(roll, game.user, true, whisper, blind)
    }
  }

  //Iterate througt test type to handle results
  static async addInfoToCard(cardData, actorId) {
    //Reset button
    cardData.chatCard.buttons = {
    }

    //Testing the Leash (Forbidden Arcana p. 176, optional rule): a spirit that scores 6 - (Force / 2) hits or more
    //tests it. The card only offers the gamemaster's button; the test itself reads nothing from the card
    if (game.settings.get("sr5", "spiritLeash") === true && actorId) {
      const spirit = SR5_EntityHelpers.getRealActorFromID(actorId)
      if (spirit?.type === "actorSpirit" && testsLeash({
        hits: cardData.roll?.hits, force: spirit.system.force.value, isElemental: spirit.system.isElemental, services: spirit.system.services.value
      }) && spirit.system.creatorId) {
        cardData.chatCard.buttons.leashTest = SR5_RollMessage.generateChatButton("nonOpposedTest", "leashTest", game.i18n.localize("SR5.LeashTest"))
      }
    }

    //Handle Extended Test
    if (cardData.test.isExtended){
      if (!cardData.test.extended.roll) cardData.test.extended.roll = 1
      cardData.test.extended.intervalValue = cardData.test.extended.multiplier * cardData.test.extended.roll
      if (cardData.dicePool.value <= 1) cardData.test.isExtended = false
      //SR5 p. 51: a critical glitch fails the extended test, no more rolls. The card hides "New roll" instead of
      //ending the test here, so Edge spent after the roll (SR5 p. 58) can reopen it by erasing the critical glitch
    }

    switch (cardData.test.type) {
      case "attack":
        await SR5_AddRollInfo.attackInfo(cardData)
        break
      case "defense":
      case "rammingDefense":
        await SR5_AddRollInfo.defenseInfo(cardData, actorId)
        break
      case "resistanceCard":
      case "splitted":
        await SR5_AddRollInfo.resistanceInfo(cardData, actorId)
        break
      case "spell":
      case "preparation":
      case "adeptPower":
        await SR5_AddRollInfo.spellInfo(cardData)
        break
      case "sensorTarget":
      case "preparationFormula":
      case "iceAttack":
      case "spritePower":
      case "martialArt":
      case "ritual":
      case "passThroughBarrier":
      case "escapeEngulf":
      case "ramming":
      case "grappleClinch":
        await SR5_AddRollInfo.actionHitInfo(cardData, cardData.test.type)
        break
      case "power":
        if (cardData.magic.spell.category === "regeneration") return SR5_AddRollInfo.regenerationInfo(cardData, cardData.test.type)
        if (cardData.test.typeSub !== "powerWithDefense") {
          if (!cardData.effects.canApplyEffect) return
          else await SR5_AddRollInfo.spellInfo(cardData)
        } else await SR5_AddRollInfo.actionHitInfo(cardData, cardData.test.type)
        break
      case "drain":
        await SR5_AddRollInfo.drainInfo(cardData, actorId)
        break
      case "complexForm":
        await SR5_AddRollInfo.complexFormInfo(cardData)
        break
      case "complexFormDefense":
        await SR5_AddRollInfo.complexFormDefenseInfo(cardData)
        break
      case "fading":
        await SR5_AddRollInfo.fadingInfo(cardData, actorId)
        break
      case "matrixAction":
        await SR5_AddRollInfo.matrixActionInfo(cardData, actorId)
        break
      case "matrixDefense":
        await SR5_AddRollInfo.matrixDefenseInfo(cardData, actorId)
        break
      case "matrixResistance":
        await SR5_AddRollInfo.matrixResistanceInfo(cardData, actorId)
        break
      case "iceDefense":
        await SR5_AddRollInfo.iceDefenseInfo(cardData, actorId)
        break
      case "grappleEscape":
        await SR5_AddRollInfo.grappleEscapeInfo(cardData, actorId)
        break
      case "netEscape":
        await SR5_AddRollInfo.netEscapeInfo(cardData, actorId)
        break
      case "grappleClinchDefense":
        await SR5_AddRollInfo.grappleClinchDefenseInfo(cardData)
        break
      case "pickpocket":
        await SR5_AddRollInfo.pickpocketInfo(cardData)
        break
      case "pickpocketPerception":
        await SR5_AddRollInfo.pickpocketPerceptionInfo(cardData)
        break
      case "concealItem":
        await SR5_AddRollInfo.concealItemInfo(cardData)
        break
      case "lift":
        await SR5_AddRollInfo.liftInfo(cardData, actorId)
        break
      case "movement":
        await SR5_AddRollInfo.movementInfo(cardData, actorId)
        break
      case "reagentHarvest":
      case "reagentRefine":
        await SR5_AddRollInfo.reagentWorkInfo(cardData)
        break
      case "skill":
      case "skillDicePool":
        await SR5_AddRollInfo.skillInfo(cardData)
        break
      case "resonanceAction":
        await SR5_AddRollInfo.resonanceActionInfo(cardData)
        break
      case "resistFire":
        await SR5_AddRollInfo.fireResistanceInfo(cardData)
        break
      case "addictionTest":
        await SR5_AddRollInfo.addictionInfo(cardData)
        break
      case "preparationResistance":
      case "ritualResistance":
      case "summoningResistance":
      case "compilingResistance":
      case "sensorDefense":
      case "jackOutDefense":
      case "eraseMark":
      case "passThroughDefense":
      case "engulfResistance":
      case "intimidationResistance":
      case "ricochetResistance":
      case "warningResistance":
      case "stunnedResistance":
      case "buckledResistance":
      case "nauseousResistance":
      case "knockdownResistance":
        await SR5_AddRollInfo.defenseResultInfo(cardData, cardData.test.type)
        break
      case "overwatchResistance":
        await SR5_AddRollInfo.overwatchResistanceInfo(cardData)
        break
      case "registeringResistance":
      case "decompilingResistance":
      case "bindingResistance":
      case "banishingResistance":
        await SR5_AddRollInfo.sidekickResistanceInfo(cardData, cardData.test.type)
        break
      case "dispellResistance":
      case "spellResistance":
      case "complexFormResistance":
      case "enchantmentResistance":
      case "disjointingResistance":
      case "powerDefense":
      case "martialArtDefense":
      case "etiquetteResistance":
      case "weaponResistance":
        await SR5_AddRollInfo.resistanceResultInfo(cardData, cardData.test.type)
        break
      case "objectResistance":
        await SR5_AddRollInfo.objectResistanceResultInfo(cardData)
        break
      case "regeneration":
        await SR5_AddRollInfo.regenerationResultInfo(cardData, actorId)
        break
      case "healing":
        await SR5_AddRollInfo.healingInfo(cardData)
        break
      case "vehicleTest":
        await SR5_AddRollInfo.vehicleTestInfo(cardData, actorId)
        break
      case "vehicleRepair":
        await SR5_AddRollInfo.vehicleRepairInfo(cardData)
        break
      case "vehicleModInstall":
        await SR5_AddRollInfo.vehicleModInstallInfo(cardData)
        break
      case "accessoryInstall":
        await SR5_AddRollInfo.accessoryInstallInfo(cardData)
        break
      case "mentorDrawback":
        await SR5_AddRollInfo.mentorDrawbackInfo(cardData)
        break
      case "woundResolve":
        await SR5_AddRollInfo.woundResolveInfo(cardData)
        break
      case "autopilotUnforeseen":
        //Confused by a hacker, the threshold is known (Rigger 5.0 p. 34); otherwise the gamemaster compares the hits with
        //the threshold of the situation (SR5 p. 271)
        if (cardData.threshold.value > 0) cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize(cardData.roll.hits >= cardData.threshold.value ? "SR5.AutopilotKeepsControl" : "SR5.AutopilotConfused"))
        break
      case "attributeOnly":
      case "languageSkill":
      case "knowledgeSkill":
      case "defenseSimple":
      case "resistanceSimple":
      case "matrixDefenseSimple":
      case "astralTracking":
      case "derivedAttribute":
      case "illusionResistance": //The active GM compares it with the threshold in his ledger (system/illusion.js)
      case "itemRoll":
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${cardData.test.type}' type in addInfoToCard`)
    }

    //Cutting Aces (lot 21): a social maneuver's outcome, the con step, the bartering window, on any card
    socialCardInfo(cardData)
  }
}
