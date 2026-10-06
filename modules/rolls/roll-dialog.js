import {
  halveCalledShot
} from '../entities/items/weaponTraits.js'
import {
  bbPatientEntry, advancedMedkitRules
} from "../system/bb-healing.js"
import {
  advancedMedkitDice, bbModeDiagnosisDice, improvisedSuppliesDice
} from "../system/bb-healing-rules.js"
import {
  SR5 
} from "../config.js"
import {
  SR5_EntityHelpers 
} from "../entities/helpers.js"
import {
  SR5_PrepareRollHelper 
} from "./roll-prepare-helpers.js"
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
  SR5_CalledShotHelpers 
} from "./roll-helpers/calledShot.js"
import {
  martialArtsLocationBonus
} from "./roll-helpers/martialArtsLocation.js"
import {
  SR5Combat 
} from "../system/srcombat.js"
import {
  SR5_SpiritTypes
} from "../entities/items/spirit-types.js"
import {
  SR5_Toxins
} from "../entities/items/toxins.js"
import {
  replacedValue
} from "../entities/actors/effect-replace.js"
import {
  SR5_SystemHelpers
} from "../system/utilitySystem.js"
import {
  holdsTarget, isSubdued
} from "./roll-helpers/grapple-rules.js"
import {
  isRunning, runningModifierValue
} from "../system/running.js"
import {
  attributeValue, swapLinkedAttribute, skillAttributeTitle, SKILL_ATTRIBUTE_FLAG, syncBackgroundCount, backgroundCountApplies, setDialogWindowTitle
} from "./roll-helpers/skillAttribute.js"
import {
  rollAttributes, attributeTestsState, ROLL_TESTS_TYPE, situationalListShown, spiritTypeVisible, withoutSituationalMarkers
} from "./roll-helpers/situational.js"
import {
  normalizeTier, tierStock
} from "../system/reagents.js"

export default class SR5_RollDialog {

  constructor(dialog, element, dialogData) {
    this.dialog = dialog
    this.element = element
    this.dialogData = dialogData
    this.dicePoolModifier = {
    }
    this.limitModifier = {
    }
    this.drainModifier = {
    }
    this.fadingModifier = {
    }
  }

  updateDicePoolValue(html) {
    let dicePoolModifier = 0
    for (let key of Object.values(this.dialogData.dicePool.modifiers)){
      dicePoolModifier += key.value
    }
    if (html.querySelector('[name="dicePoolModifiers"]')) html.querySelector('[name="dicePoolModifiers"]').value = dicePoolModifier
    let modifiedDicePool = dicePoolModifier + parseInt(html.querySelector('[name="baseDicePool"]').value)
    this.dialogData.dicePool.base = parseInt(html.querySelector('[name="baseDicePool"]').value)
    if (modifiedDicePool < 0) modifiedDicePool = 0
    html.querySelector('[data-action="roll"]').innerHTML = `<i class="fas fa-dice-six"></i> ${game.i18n.localize("SR5.RollDice")} (${modifiedDicePool})`
  }

  updateLimitValue(html) {
    if (html.querySelector('[name="baseLimit"]')){
      let modifiedLimit = parseInt(html.querySelector('[name="baseLimit"]').value)
      let limitModifier = 0
      for (let key of Object.values(this.dialogData.limit.modifiers)){
        limitModifier += key.value
        //if (key === "reagents") modifiedLimit = value;
      }
      modifiedLimit += limitModifier
      if (this.dialogData.limit.replace !== undefined) modifiedLimit = this.dialogData.limit.replace
      if (modifiedLimit < 0) modifiedLimit = 0
      html.querySelector('[name="modifiedLimit"]').value = modifiedLimit
      this.dialogData.limit.base = parseInt(html.querySelector('[name="baseLimit"]').value)
    }
  }

  updateDrainValue(html) {
    this.dialogData.magic.force = parseInt(html.querySelector('[name="force"]').value)
    if (html.querySelector('[name="drainValue"]')){
      let drainModifier = 0
      for (let key of Object.values(this.dialogData.magic.drain.modifiers)){
        drainModifier += key.value
      }
      let drainFinalValue = parseInt(html.querySelector('[name="force"]').value) + drainModifier
      //SR5 p. 284: never under 2; Structured Spellcasting (Forbidden Arcana p. 43): never under 1
      const drainFloor = this.dialogData.magic.drainFloor ?? 2
      if (drainFinalValue < drainFloor) drainFinalValue = drainFloor
      //Bullets & Bandages p. 15 (VO): the Drain of Stabilize follows the patient's wounds, not the Force
      if (Number.isFinite(this.dialogData.magic.bbStabilizeDrain)) drainFinalValue = this.dialogData.magic.bbStabilizeDrain
      html.querySelector('[name="drainValue"]').value = drainFinalValue
      this.dialogData.magic.drain.value = drainFinalValue
    }
  }

  updateFadingValue(html) {
    this.dialogData.matrix.level = parseInt(html.querySelector('[name="level"]').value)
    if (html.querySelector('[name="fadingValue"]')){
      let fadingModifier = 0
      for (let key of Object.values(this.dialogData.matrix.fading.modifiers)){
        fadingModifier += key.value
      }
      let fadingFinalValue = parseInt(html.querySelector('[name="level"]').value) + fadingModifier
      if (fadingFinalValue < 2) fadingFinalValue = 2
      html.querySelector('[name="fadingValue"]').value = fadingFinalValue
      this.dialogData.matrix.fading.value = fadingFinalValue
    }
  }

  // SR5 p. 170: an interruption action can only be taken if the initiative score is higher than its cost
  static hasInitiativeForInterruption(actor, cost){
    if (!game.combat || !(cost > 0)) return true
    let combatant = SR5Combat.getCombatantFromActor(actor)
    if (!combatant || combatant.initiative === null || combatant.initiative === undefined) return true
    if (combatant.initiative > cost) return true
    ui.notifications.warn(game.i18n.format("SR5.WARN_NotEnoughInitiative", {
      actor: actor.name, initiative: combatant.initiative, cost: cost
    }))
    return false
  }

  // SR5 p. 191-192: block needs Unarmed Combat and parry the weapon's skill; dodge is open to anyone
  static hasActiveDefenseSkill(actor, defenseMode){
    let skillKey = SR5_RollDialog.activeDefenseSkills[defenseMode]
    if (!skillKey || !actor || (actor.system?.skills?.[skillKey]?.rating.value || 0) > 0) return true
    ui.notifications.warn(game.i18n.format("SR5.WARN_ActiveDefenseNoSkill", {
      actor: actor.name, skill: game.i18n.localize(SR5.skills[skillKey])
    }))
    return false
  }

  static activeDefenseSkills = {
    block: "unarmedCombat", parryClubs: "clubs", parryBlades: "blades"
  }

  // SR5 p. 170 and 192: full defense (-10, once per turn) and an active defense (-5) are paid together,
  // so the initiative must be higher than their combined cost
  static defenseStanceCost(actor, fullDefense, defenseMode){
    let cost = -SR5_ConverterHelpers.activeDefenseToInitMod(defenseMode)
    if (fullDefense && !actor.effects.find(e => e.origin === "fullDefense")) cost += 10
    return cost
  }

  calculRecoil(html){
    let firingModeValue,
      dialogData = this.dialogData

    // SR5 p. 180: single-shot (SS) and suppressive fire (SF) weapons neither build nor suffer progressive recoil
    let noRecoil = dialogData.combat.firingMode.selected === "SS" || dialogData.combat.firingMode.selected === "SF" || dialogData.combat.firingMode.selected === "FN"
    let cumulativeRecoil = noRecoil ? 0 : dialogData.combat.recoil.cumulative
    if (noRecoil) firingModeValue = 0
    else firingModeValue = SR5_ConverterHelpers.firingModeToBullet(dialogData.combat.firingMode.selected)
    html.querySelectorAll(".hideBulletsRecoil").forEach(el => el.style.display = noRecoil ? 'none' : '')

    dialogData.combat.ammo.fired = SR5_ConverterHelpers.firingModeToBullet(dialogData.combat.firingMode.selected)
    html.querySelector('[name="recoilBullets"]').value = firingModeValue
    html.querySelector('[name="recoilCumulative"]').value = cumulativeRecoil
    if (dialogData.combat.recoil.compensationWeapon < 1) html.querySelectorAll(".hideWeaponRecoil").forEach(el => el.style.display = 'none')
    html.querySelectorAll(".hideCumulativeRecoil").forEach(el => el.style.display = cumulativeRecoil < 1 ? 'none' : '')

    let modifiedRecoil = (dialogData.combat.recoil.compensationActor + dialogData.combat.recoil.compensationWeapon) - (firingModeValue + cumulativeRecoil)
    if (modifiedRecoil > 0) modifiedRecoil = 0
    return modifiedRecoil || 0
  }

  //Toggle reset recoil
  _onResetRecoil(ev, html, dialogData, actor){
    ev.preventDefault()
    let resetedActor = SR5_EntityHelpers.getRealActorFromID(actor.id)
    resetedActor.resetRecoil()
    dialogData.combat.recoil.cumulative = 0
    dialogData.combat.recoil.value = dialogData.combat.recoil.compensationActor
    let recoil = this.calculRecoil(html)
    this.dialog.setPosition(this.dialog.position)
    html.querySelector('[name="recoil"]').value = recoil
    SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', "recoil")
    this.updateDicePoolValue(html)
  }

  async getTargetType(target){
    let item = await fromUuid(target)
    if (item?.type === "itemSpell") return item.system.category
    else return null
  }

  activateListeners(html) {
    const element = html
    let dialogData = this.dialogData
    let actor = SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId)

    this.updateDicePoolValue(element)
    this.updateLimitValue(element)

    //Show some block on initial draw
    if (dialogData.test.type === "ritual") this._showReagents(element, true)
    //Binding: the (Force x 25) drachms are spent from the start (SR5 p. 304)
    if (dialogData.magic.bindingReagents > 0 && element.querySelector('[name="reagentsSpent"]')) this._updateReagents(dialogData.magic.bindingReagents, actor, element, dialogData)
    element.querySelectorAll('.SR-ReagentTier, .SR-ReagentForeign').forEach(el => el.addEventListener('change', () => this._onReagentOption(element, dialogData, actor)))

    //General commands for input
    element.querySelectorAll('.SR-ModInput').forEach(el => el.addEventListener('change', ev => this._manualInputModifier(ev, element, dialogData)))
    //General commands for input buttons
    element.querySelectorAll('.SR-ModControl').forEach(el => el.addEventListener('click', ev => this._manualInputModifier(ev, element, dialogData, true)))
    //General commands for input already filled by dialogData
    const filledInputs = element.querySelectorAll('.SR-ModInputFilled'); if (filledInputs.length) this._filledInputModifier(filledInputs, element, dialogData)
    //General commands for checkbox
    const filledCheckboxes = element.querySelectorAll('.SR-ModCheckboxFilled'); if (filledCheckboxes.length) this._filledCheckBox(filledCheckboxes, element, dialogData)
    element.querySelectorAll('.SR-ModCheckbox').forEach(el => el.addEventListener('change', ev => this._checkboxModifier(ev, element, dialogData)))
    //Situational effects, ticked by hand (roll-helpers/situational.js)
    element.querySelectorAll('.SR-SituationalCheckbox').forEach(el => el.addEventListener('change', ev => this._situationalModifier(ev, element, dialogData)))
    this._toggleSituationalList(element, dialogData)
    //An invisible target already brings its blind fire box (system/illusion.js): the hand-ticked one would count -6 twice
    this._syncBlindFire(element, dialogData)
    element.querySelectorAll('[data-modifier="attackBlindFire"]').forEach(el => el.addEventListener('change', () => this._syncBlindFire(element, dialogData)))
    //The attribute picked in the dialog brings its "tests linked to" effects (Pushed)
    element.querySelectorAll('.SR-ModSelect[data-modifier="attribute"]').forEach(el => el.addEventListener('change', ev => {
      dialogData.secondaryAttribute = ev.target.value
      this._syncAttributeTests(element, dialogData)
    }))
    //General commands for select
    element.querySelectorAll('.SR-ModSelect').forEach(el => el.addEventListener('change', ev => this._selectModifiers(ev, element, dialogData)))
    //Bullets & Bandages p. 18: the improvising hits read again by the supplies select
    element.querySelector('[name="bbImprovisedHits"]')?.addEventListener('change', () => element.querySelector('[data-modifier="healingSupplies"]')?.dispatchEvent(new Event('change')))
    //General commands for select already filled by dialogData
    const filledSelects = element.querySelectorAll('.SR-ModSelectFilled'); if (filledSelects.length) this._filledSelectModifier(filledSelects, element, dialogData)
    //Bullets & Bandages: the care selected when the window opens counts at once (the diagnosis bonus of a treatment
    //rolled without touching the list)
    const bbModeSelect = element.querySelector('.SR-ModSelect[data-modifier="bbMode"]')
    if (bbModeSelect) this._selectModifiers({
      currentTarget: bbModeSelect, target: bbModeSelect
    }, element, dialogData)
    //Ramming: speeds and angle of the impact
    element.querySelectorAll('.SR-RammingInput').forEach(el => el.addEventListener('change', ev => this._updateRamming(element, dialogData, ev.target.name)))
    //Manage Threshold
    element.querySelectorAll('.SR-ManageThreshold').forEach(el => el.addEventListener('change', ev => this._manageThreshold(ev, element, dialogData)))
    const thresholdEls = element.querySelectorAll('.SR-ManageThreshold'); if (thresholdEls.length) this._filledThreshold(thresholdEls, element, dialogData)
    //Grapple escape: the net hits of the grapple or subdue test, typed by hand (Run & Gun p. 135)
    element.querySelectorAll('.SR-GrappleEscapeThreshold').forEach(el => el.addEventListener('change', ev => {
      dialogData.threshold.value = Math.max(parseInt(ev.target.value) || 0, 0)
    }))

    // Reset Recoil
    element.querySelectorAll(".resetRecoil").forEach(el => el.addEventListener('click', ev => this._onResetRecoil(ev, element, dialogData, actor)))
    // Reset Cumulative Defense
    element.querySelectorAll(".resetCumulativeDefense").forEach(el => el.addEventListener('click', ev => this._onResetDefense(ev, element, dialogData, actor)))

    // Extended test
    element.querySelectorAll('[name="toggleExtendedTest"]').forEach(el => el.addEventListener('change', ev => this._onToggleExtendedTest(ev.target.checked, dialogData, element)))
    element.querySelectorAll('[name="extendedTime"]').forEach(el => el.addEventListener('change', ev => this._onChangeExtendedTest(ev.target.checked, dialogData, element)))
    element.querySelectorAll('[name="extendedMultiplier"]').forEach(el => el.addEventListener('change', ev => this._onChangeExtendedTest(ev.target.checked, dialogData, element)))

    //auto fill extended test if data are already present
    if (dialogData.test.isExtended){
      element.querySelector('[name="toggleExtendedTest"]').checked = true
      element.querySelector('[name="extendedTime"]').value = dialogData.test.extended.interval
      element.querySelector('[name="extendedMultiplier"]').value = dialogData.test.extended.multiplier
      const extendedBlockEl = element.querySelector('#extendedBlock')
      if (extendedBlockEl) extendedBlockEl.style.display = ''
    }
    //AI Emulate: an AI without a device can only emulate, so the dialog opens at its default rating (Data Trails p. 157)
    if (dialogData.matrix?.emulateRequired) this._applyEmulateRating(element, dialogData, dialogData.matrix.emulateDefault)
    element.querySelectorAll('[name="emulateLegal"]').forEach(el => el.addEventListener('change', ev => {
      dialogData.matrix.emulateLegal = ev.target.checked
    }))
    //Toggle hidden div
    element.querySelectorAll(".SR-DialogToggle").forEach(el => el.addEventListener('click', ev => this._toggleDiv(ev, element)))
    //Attribute paired with the skill (SR5 p. 130)
    element.querySelectorAll(".SR-SkillAttribute").forEach(el => el.addEventListener('change', ev => this._onChangeSkillAttribute(ev.target.value, element, dialogData, actor)))
    element.querySelectorAll(".SR-SkillAttributeKeep").forEach(el => el.addEventListener('change', ev => this._onKeepSkillAttribute(ev.target.checked, dialogData, actor)))
  }

  // SR5 p. 130: another attribute replaces the linked one in the pool and the title; the limit stays the skill's
  _onChangeSkillAttribute(attributeKey, html, dialogData, actor){
    let choice = dialogData.skillAttribute
    choice.selected = attributeKey
    let source = game.i18n.localize(choice.choices[attributeKey])
    let value = attributeValue(actor.system, attributeKey)
    dialogData.dicePool.composition = swapLinkedAttribute(dialogData.dicePool.composition, source, value)
    dialogData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(dialogData)
    html.querySelector('[name="baseDicePool"]').value = dialogData.dicePool.base
    let row = html.querySelector('#dicePoolComposition [data-type="linkedAttribute"]')
    if (row){
      row.querySelector('span').textContent = source
      row.querySelector('.SR-TextCenter').textContent = value
    }
    dialogData.test.title = skillAttributeTitle(choice, k => game.i18n.localize(k))
    //The window title shows the pair in use, as the chat card will
    setDialogWindowTitle(html, dialogData.test.title)
    //The background count follows the attribute in use (Grimoire des Ombres p. 30)
    if (choice.skillKey) syncBackgroundCount(dialogData, actor.system.magic?.bgCount, backgroundCountApplies(choice.skillKey, attributeKey))
    if (choice.keep) this._onKeepSkillAttribute(true, dialogData, actor)
    this._syncAttributeTests(html, dialogData)
    this.updateDicePoolValue(html)
    this.updateLimitValue(html)
  }

  // Arbitrage de DjamZ: the choice is kept in an actor flag for that skill until the box is unchecked
  async _onKeepSkillAttribute(keep, dialogData, actor){
    let choice = dialogData.skillAttribute
    choice.keep = keep
    //Keeping the linked attribute is the default: nothing to remember
    if (keep && choice.selected !== choice.linked) await actor.setFlag("sr5", `${SKILL_ATTRIBUTE_FLAG}.${choice.flagKey}`, choice.selected)
    else await actor.unsetFlag("sr5", `${SKILL_ATTRIBUTE_FLAG}.${choice.flagKey}`)
  }

  // AI Emulate (Data Trails p. 159): rating capped by Depth, -(rating / 2) dice, the limit becomes the emulated rating.
  // Without a device the rating cannot drop below 1: there is no attribute to act with otherwise (Data Trails p. 157)
  _applyEmulateRating(html, dialogData, value){
    let max = dialogData.matrix.emulateMax || 0,
      min = dialogData.matrix.emulateRequired ? Math.min(1, max) : 0
    if (isNaN(value) || value < min) value = min
    if (value > max) {
      value = max
      ui.notifications.warn(game.i18n.format('SR5.WARN_EmulateMaxDepth', {
        depth: max
      }))
    }
    html.querySelector('[name="emulateRating"]').value = value
    dialogData.matrix.emulateRating = value
    SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', "emulate")
    delete dialogData.limit.modifiers.limitModEmulate
    delete this.limitModifier.limitModEmulate
    let emulatePenalty = 0
    if (value > 0) {
      emulatePenalty = -Math.ceil(value / 2)
      dialogData.dicePool.modifiers.push({
        type: "emulate",
        label: `${game.i18n.localize(SR5.dicePoolModTypes.emulate)} (${value})`,
        value: emulatePenalty
      })
      let emulateLimit = value - (dialogData.matrix.emulateAttributeValue || 0)
      dialogData.limit.modifiers.limitModEmulate = {
        value: emulateLimit,
        label: `${game.i18n.localize(SR5.limitModTypes.limitModEmulate)} (${value})`,
      }
      this.limitModifier.limitModEmulate = emulateLimit
    }
    html.querySelector('[name="dicePoolModEmulate"]').value = emulatePenalty
    this.updateDicePoolValue(html)
    this.updateLimitValue(html)
  }

  //Show or Hide section of the dialog
  _toggleDiv(ev, html){
    let target = ev.currentTarget.dataset.target,
      action = ev.currentTarget.dataset.action,
      position = this.dialog.position

    if (action === "show"){
      const targetEl = html.querySelector(`#${target}`)
      if (targetEl) targetEl.style.display = ''
      html.querySelectorAll(`[data-target="${target}"][data-action="show"]`).forEach(el => el.style.display = 'none')
      html.querySelectorAll(`[data-target="${target}"][data-action="hide"]`).forEach(el => el.style.display = '')
    } else {
      const targetEl = html.querySelector(`#${target}`)
      if (targetEl) targetEl.style.display = 'none'
      html.querySelectorAll(`[data-target="${target}"][data-action="hide"]`).forEach(el => el.style.display = 'none')
      html.querySelectorAll(`[data-target="${target}"][data-action="show"]`).forEach(el => el.style.display = '')
    }

    position.height = "auto"
    this.dialog.setPosition(position)
  }

  //Ramming damage from the initiator's Structure and the speed of the impact: Rigger 5 p. 179 against a vehicle, SR5 p. 203-204 otherwise
  _updateRamming(html, dialogData, changed){
    let actor = SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId),
      ramming = dialogData.combat.ramming,
      readNumber = name => Math.max(0, parseInt(html.querySelector(`[name="${name}"]`).value) || 0)
    if (ramming.targetIsVehicle){
      ramming.angle = html.querySelector('[name="rammingAngle"]').value
      ramming.attackerSpeed = readNumber("rammingAttackerSpeed")
      ramming.targetSpeed = readNumber("rammingTargetSpeed")
      ramming.attackerLocomotion = html.querySelector('[name="rammingAttackerLocomotion"]').value
      ramming.targetLocomotion = html.querySelector('[name="rammingTargetLocomotion"]').value
      //Kept in step with the speeds, in case a pedestrian ends up defending
      SR5_ConverterHelpers.rammingRefreshRelativeSpeed(ramming)
    } else {
      ramming.gait = html.querySelector('[name="rammingGait"]').value
      //The gait fills in the relative speed, which the GM may then correct
      if (changed === "rammingGait") html.querySelector('[name="rammingRelativeSpeed"]').value = SR5_ConverterHelpers.rammingRefreshRelativeSpeed(ramming).relativeSpeed
      ramming.relativeSpeed = readNumber("rammingRelativeSpeed")
      //SR5 p. 203: -3 dice when the vehicle has to reach its running rate
      SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', "rammingRun")
      if (ramming.gait === "run") dialogData.dicePool.modifiers.push({
        type: "rammingRun", label: game.i18n.localize(SR5.dicePoolModTypes.rammingRun), value: -3
      })
      this.updateDicePoolValue(html)
    }
    dialogData.damage.base = SR5_ConverterHelpers.rammingAttackDamage(ramming, actor.system.attributes.body.augmented.value)
    dialogData.damage.value = dialogData.damage.base
    html.querySelector('[name="modifiedDamage"]').value = dialogData.damage.value
  }

  //Tick or untick a situational effect: on the dice pool, or on the limit
  _situationalModifier(ev, html, dialogData){
    let offer = dialogData.situational?.[parseInt(ev.target.dataset.index)]
    if (!offer) return
    //The chat card keeps the box as it was left
    offer.checked = ev.target.checked
    if (offer.kind === "limit" && offer.replace){
      //A replacing box: the limit becomes its value while ticked (AutoVoice for singing, No Future p. 157)
      if (ev.target.checked){
        dialogData.limit.replace = offer.value
        dialogData.limit.typeBeforeReplace ??= dialogData.limit.type
        dialogData.limit.type = "replaced"
      } else {
        delete dialogData.limit.replace
        if (dialogData.limit.typeBeforeReplace !== undefined) dialogData.limit.type = dialogData.limit.typeBeforeReplace
      }
      this.updateLimitValue(html)
    } else if (offer.kind === "limit"){
      if (ev.target.checked) dialogData.limit.modifiers[offer.key] = {
        label: offer.label, value: offer.value
      }
      else delete dialogData.limit.modifiers[offer.key]
      this.updateLimitValue(html)
    } else {
      SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', offer.key)
      if (ev.target.checked) dialogData.dicePool.modifiers.push({
        type: offer.key, label: offer.label, value: offer.value
      })
      this.updateDicePoolValue(html)
    }
    if (offer.blindFire) this._syncBlindFire(html, dialogData)
  }

  //Blind fire counts once (SR5 p. 180): the invisibility box ticked greys the hand one, and the other way round
  _syncBlindFire(html, dialogData){
    const index = (dialogData.situational || []).findIndex(o => o.blindFire)
    if (index < 0) return
    const manual = html.querySelectorAll('[data-modifier="attackBlindFire"]')
    const manualTicked = [...manual].some(el => el.checked)
    manual.forEach(el => {
      el.disabled = !!dialogData.situational[index].checked
    })
    const box = html.querySelector(`.SR-SituationalCheckbox[data-index="${index}"]`)
    if (box) box.disabled = manualTicked
  }

  //Effects on "tests linked to an attribute" (Pushed, Chrome Flesh p. 167) follow the attributes in use:
  //the one paired with the skill (SR5 p. 130) and the secondary one picked in the dialog
  _syncAttributeTests(html, dialogData){
    if (!dialogData.situationalScoped?.length) return
    const labels = Object.fromEntries(Object.entries(SR5.allAttributes).map(([k, v]) => [k, game.i18n.localize(v)]))
    const attributes = rollAttributes(dialogData.dicePool.composition, labels, dialogData.secondaryAttribute)
    const {
      always, visible
    } = attributeTestsState(dialogData.situationalScoped, attributes)
    dialogData.dicePool.modifiers = dialogData.dicePool.modifiers.filter(m => !m.type?.startsWith?.(ROLL_TESTS_TYPE)).concat(always)
    dialogData.situational.forEach((offer, i) => {
      if (!offer.attribute) return
      offer.hidden = !visible.includes(offer.index)
      const box = html.querySelector(`.SR-SituationalCheckbox[data-index="${i}"]`)
      if (!box) return
      box.closest('li').style.display = offer.hidden ? 'none' : ''
      if (offer.hidden && box.checked){
        box.checked = false
        dialogData.dicePool.modifiers = dialogData.dicePool.modifiers.filter(m => m.type !== offer.key)
      }
    })
    this._toggleSituationalList(html, dialogData)
    this.updateDicePoolValue(html)
  }

  //Forbidden Arcana p. 90-95: a spirit type picked in the dialog shows its own boxes and hides the others'.
  //The type's modifiers are copied without their markers, which the boxes stand for; boxes ticked
  //elsewhere in the dialog are kept
  _syncSpiritTypeOffers(html, dialogData, spiritType, typeModifiers){
    //The Astral Reputation penalty (Street Grimoire p. 207) is the summoner's, whatever the type: kept too
    const kept = (dialogData.dicePool.modifiers || []).filter(m => m.type?.startsWith?.("situational_") || m.type === "astralReputation")
    dialogData.dicePool.modifiers = withoutSituationalMarkers(typeModifiers).concat(kept)
    const unticked = spiritTypeVisible(dialogData.situational, spiritType)
    dialogData.dicePool.modifiers = dialogData.dicePool.modifiers.filter(m => !unticked.includes(m.type))
    ;(dialogData.situational || []).forEach((offer, i) => {
      if (!offer.spiritType) return
      const box = html.querySelector(`.SR-SituationalCheckbox[data-index="${i}"]`)
      if (!box) return
      box.closest('li').style.display = offer.hidden ? 'none' : ''
      if (offer.hidden) box.checked = false
    })
    this._toggleSituationalList(html, dialogData)
  }

  //The list of situational boxes, and its separator, only shows when one box does
  _toggleSituationalList(html, dialogData){
    const list = html.querySelector('.SR-SituationalList')
    if (list) list.style.display = situationalListShown(dialogData.situational) ? '' : 'none'
  }

  //Add checkbox modifiers
  _checkboxModifier(ev, html, dialogData){
    let isChecked = ev.target.checked,
      target = ev.currentTarget.dataset.target,
      name = `[name=${target}]`,
      modifierName = ev.currentTarget.dataset.modifier,
      label = game.i18n.localize(SR5.dicePoolModTypes[modifierName]),
      value = 0

    let actor = SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId)

    switch (modifierName){
      case "socialReputation":
        value = actor.system.streetCred.value
        break
      case "workingFromMemory":
        if (actor.system.attributes.logic.augmented.value >= 5) value = 0
        else value = -(5 - actor.system.attributes.logic.augmented.value)
        break
      case "penalty":
        value = actor.system.penalties.condition?.actual.value + actor.system.penalties.matrix?.actual.value + actor.system.penalties.magic?.actual.value + actor.system.penalties.special?.actual.value
        break
      case "fullDefense":
        value = actor.system.specialProperties.fullDefenseValue || 0
        if (isChecked && !actor.effects.find(e => e.origin === "fullDefense") && !SR5_RollDialog.hasInitiativeForInterruption(actor, SR5_RollDialog.defenseStanceCost(actor, true, dialogData.combat.activeDefenseSelected))) {
          ev.target.checked = false
          isChecked = false
        }
        break
      case "reagents":
        this._showReagents(html, isChecked)
        //Unticked, no reagent is spent
        dialogData.magic.hasUsedReagents = isChecked && (parseInt(html.querySelector('[name="reagentsSpent"]')?.value) || 0) > 0
        return
      case "recklessSpellcasting":
        dialogData.combat.actions = []
        if (isChecked) {
          value = 3
          dialogData.combat.actions = SR5_MiscellaneousHelpers.addActions(dialogData.combat.actions, {
            type: "simple", value: 1, source: "castRecklessSpell"
          })
        } else {
          dialogData.combat.actions = SR5_MiscellaneousHelpers.addActions(dialogData.combat.actions, {
            type: "complex", value: 1, source: "castSpell"
          })
        }
        html.querySelector(name).value = value
        dialogData.magic.drain.modifiers.recklessSpellcasting = {
          value: value,
          label: game.i18n.localize(SR5.drainModTypes[modifierName]),
        }
        this.drainModifier.recklessSpellcasting = value
        this.updateDrainValue(html)
        return
      case "mageHunter": {
        //Mage Hunter (Forbidden Arcana p. 34): the Drain is paid only when the trade is made
        const level = dialogData.magic.mageHunter?.level || 0
        value = isChecked ? level : 0
        dialogData.magic.mageHunter.used = isChecked
        const input = html.querySelector(name)
        if (input) input.value = value
        if (isChecked) dialogData.magic.drain.modifiers.mageHunter = {
          value, label: game.i18n.localize(SR5.drainModTypes.mageHunter),
        }
        else delete dialogData.magic.drain.modifiers.mageHunter
        this.updateDrainValue(html)
        return
      }
      case "spiritAid":
        value = dialogData.magic.spiritAid.modifier
        break
      case "astralReputation":
        value = dialogData.magic.astralReputationMod || 0
        break
      case "centering":
        value = actor.system.magic.metamagics.centeringValue.value
        if (isChecked) dialogData.combat.actions = SR5_MiscellaneousHelpers.addActions(dialogData.combat.actions, {
          type: "free", value: 1, source: "useCentering"
        })
        break
      case "restraintReinforced": {
        if (isChecked) value = 1
        html.querySelector(name).value = value
        let threshold = parseInt(html.querySelector('[name="restraintThreshold"]').value)
        dialogData.threshold.value = threshold + 1
        return
      }
      case "defenseProneFar":
        value = 4
        break
      case "specificallyLooking":
      case "defenseInsideVehicle":
        value = 3
        break
      case "escapeSituationPicks":
      case "specialization":
      case "standsOutInSomeWay":
      case "camping":
      case "socialAce":
      case "socialRomantic":
      case "socialOutnumber":
      case "socialWieldingWeapon":
      case "socialTorture":
      case "socialObliviousToDanger":
      case "socialFan":
      case "socialBlackmailed":
      case "defenseRunning":
      case "attackSuperiorPosition":
      case "attackTouchOnly":
        value = 2
        break
      case "attackCharge":
        //SR5 p. 164 and 188: a charge ignores the -2 of running, which comes back if the charge is unchecked
        if (isChecked) this._uncheckModifier(html, dialogData, "running")
        else if (isRunning(actor)) this._checkModifier(html, dialogData, "running", runningModifierValue(dialogData.dialogSwitch.running))
        value = 2
        break
      case "running":
        value = runningModifierValue(dialogData.dialogSwitch.running)
        break
      case "controlAvailable":
      case "socialIsDistracted":
      case "socialAuthority":
      case "defenseReceivingCharge":
      case "attackFriendsInMelee":
      case "attackOpponentProne":
      case "attackTakeAim":
        value = 1
        break
      case "socialIsDistractedInverse":
      case "socialIntoxicated":
      case "socialEvaluateSituation":
      case "attackProne":
        value = -1
        break
      case "escapeSituationWatched":
      case "patientAwakenedOrEmerged":
      case "patientCooperation":
      case "distracted":
      case "notInImmediateVicinity":
      case "interfering":
      case "noFoundOrWater":
      case "socialBadLook":
      case "socialNervous":
      case "socialOutnumberTarget":
      case "socialWieldingWeaponTarget":
      case "socialLacksKnowledge":
      case "defenseProne":
      case "defenseProneClose":
      case "defenseTargetedByArea":
      case "attackWrongHand":
      case "attackFromVehicle":
      case "attackIsRunning":
        value = -2
        break
      case "farAway":
      case "defenseInMelee":
      case "attackWithImagingDevice":
      case "attackInMelee":
        value = -3
        break
      case "attackBlindFire":
        value = -6
        break
    }

    if (isChecked){
      html.querySelector(name).value = value
      dialogData.dicePool.modifiers.push({
        type: modifierName,
        label: label,
        value: value
      })
      this.updateDicePoolValue(html)
    } else {
      html.querySelector(name).value = 0
      SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', modifierName)
      this.updateDicePoolValue(html)
    }
  }

  //Uncheck a checkbox modifier and take its value off the dice pool
  _uncheckModifier(html, dialogData, modifierName){
    const checkbox = html.querySelector(`[data-modifier=${modifierName}]`)
    if (!checkbox?.checked) return
    checkbox.checked = false
    const input = html.querySelector(`[name=${checkbox.dataset.target}]`)
    if (input) input.value = 0
    SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', modifierName)
    this.updateDicePoolValue(html)
  }

  //Check a checkbox modifier and add its value to the dice pool
  _checkModifier(html, dialogData, modifierName, value){
    const checkbox = html.querySelector(`[data-modifier=${modifierName}]`)
    if (!checkbox || checkbox.checked) return
    checkbox.checked = true
    const input = html.querySelector(`[name=${checkbox.dataset.target}]`)
    if (input) input.value = value
    dialogData.dicePool.modifiers.push({
      type: modifierName,
      label: game.i18n.localize(SR5.dicePoolModTypes[modifierName]),
      value: value
    })
    this.updateDicePoolValue(html)
  }

  //Auto check checkbox modifiers
  _filledCheckBox(checkboxs, html, dialogData){
    if (checkboxs.length === 0) return
    let checkboxName, modifierName, inputName, value

    let actor = SR5_EntityHelpers.getRealActorFromID(this.dialogData.owner.actorId),
      targetActor = SR5_EntityHelpers.getRealActorFromID(dialogData.target.actorId),
      label,
      isProned = actor.effects.find(e => e.statuses.has("prone")),
      grappling = game.settings.get("sr5", "sr5GrapplingRules")
    //SR5 p. 195: a subdued character counts as prone for any attack against them (grappling rules only)
    if (grappling && isSubdued(actor.effects)) isProned = true
    //SR5 p. 164: the running status of the roller
    const running = isRunning(actor)

    for (let e of checkboxs){
      modifierName = e.dataset.modifier
      checkboxName = `[data-modifier=${modifierName}]`
      inputName = `[name=${e.dataset.target}]`
      label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])

      switch (modifierName){
        case "patientAwakenedOrEmerged":
          // Spirits have no Resonance, an AI may have no Magic: read only what the patient has
          if (targetActor?.system.specialAttributes?.magic?.augmented.value > 0 || targetActor?.system.specialAttributes?.resonance?.augmented.value > 0){
            html.querySelector(checkboxName).checked = true
            value = -2
            html.querySelector(inputName).value = value
            dialogData.dicePool.modifiers.push({
              type: modifierName,
              label: label,
              value: value
            })
            this.updateDicePoolValue(html)
          }
          continue
        case "fullDefense": {
          let fullDefenseEffect = actor.effects.find(e => e.origin === "fullDefense")
          let isInFullDefense = (fullDefenseEffect) ? true : false
          if (isInFullDefense){
            html.querySelector(checkboxName).checked = true
            value = actor.system.specialProperties.fullDefenseValue || 0
          }
          break
        }
        case "defenseProneClose":
          if (isProned && SR5_MiscellaneousHelpers.proneDefenseRange(dialogData.target.rangeInMeters) === "close"){
            html.querySelector(checkboxName).checked = true
            value = -2
          }
          break
        case "defenseProneFar":
          if (isProned && SR5_MiscellaneousHelpers.proneDefenseRange(dialogData.target.rangeInMeters) === "far"){
            html.querySelector(checkboxName).checked = true
            value = 4
          }
          break
        case "defenseProne":
          if (isProned){
            html.querySelector(checkboxName).checked = true
            value = -2
          }
          break
        case "defenseTargetedByArea":
          html.querySelector(checkboxName).checked = true
          value = -2
          break
        //SR5 p. 164, 179 and 190: running, -2 on an action, +2 on a defense test
        case "running":
          if (running){
            html.querySelector(checkboxName).checked = true
            value = runningModifierValue(dialogData.dialogSwitch.running)
          }
          break
        case "attackIsRunning":
          if (running){
            html.querySelector(checkboxName).checked = true
            value = -2
          }
          break
        case "defenseRunning":
          if (running){
            html.querySelector(checkboxName).checked = true
            value = 2
          }
          break
        case "attackSuperiorPosition":
          //SR5 p. 188 and 196: the holder attacking the fighter they hold has the superior position (grappling rules only)
          if (grappling && holdsTarget(actor.effects, dialogData.target.actorId)){
            html.querySelector(checkboxName).checked = true
            value = 2
          }
          break
      }

      if (html.querySelector(checkboxName).checked){
        html.querySelector(inputName).value = value
        dialogData.dicePool.modifiers.push({
          type: modifierName,
          label: label,
          value: value
        })
        this.updateDicePoolValue(html)
      }
    }


  }

  //Manage manual input modifier
  _manualInputModifier(ev, html, dialogData, button = false){
    let target, name, modifierName, value, operator
    let actor = SR5_EntityHelpers.getRealActorFromID(this.dialogData.owner.actorId)
    if (button){ //Manage plus minus input
      target = ev.currentTarget.dataset.target
      operator = ev.currentTarget.dataset.type
      modifierName = ev.currentTarget.dataset.modifier
      name = `[name=${target}]`
      value = html.querySelector(name).value
      if (operator === "plus"){
        value++
        html.querySelector(name).value = value
      } else {
        value--
        html.querySelector(name).value = value
      }
    } else {
      target = ev.currentTarget.getAttribute("name")
      name = `[name=${target}]`
      modifierName = ev.currentTarget.dataset.modifier
      value = parseInt(ev.target.value)
    }

    switch (target){
      case "emulateRating":
        this._applyEmulateRating(html, dialogData, value)
        return
      case "force":
        this.updateDrainValue(html)
        if (html.querySelector('#force')) {
          html.querySelector('#force').value = value
          dialogData.limit.base = value
        }
        //The limit is the Force (spells SR5 p. 285, ritual sealing p. 299): show the new one with its modifiers.
        //The ritual's Force field has no #force id: the limit is updated whatever field gave the Force
        {
          const baseLimit = html.querySelector('[name="baseLimit"]')
          if (baseLimit) {
            dialogData.limit.base = value
            baseLimit.value = value
            this.updateLimitValue(html)
          }
        }
        if (dialogData.test.type === "ritual") this._updateReagents(value, actor, html, dialogData)
        //The participants rolled their assist at the Force announced on the circle card: they are not rolled again
        if (dialogData.magic.ritualCircleForce && parseInt(value) !== dialogData.magic.ritualCircleForce) ui.notifications.warn(game.i18n.format("SR5.WARN_RitualForceChanged", {
          force: dialogData.magic.ritualCircleForce
        }))
        return
      case "reagentsSpent":
        this._updateReagents(value, actor, html, dialogData)
        return
      case "level":
        this.updateFadingValue(html)
        if (html.querySelector('#level')) html.querySelector('#level').value = value
        return
      case "dicePoolModSpellShaping":
        if (value > 0) {
          ui.notifications.warn(game.i18n.format('SR5.WARN_SpellShapingMin'))
          value = 0
        } else if (-value > actor.system.magic.metamagics.spellShapingValue.value){
          value = -actor.system.magic.metamagics.spellShapingValue.value
          ui.notifications.warn(game.i18n.format('SR5.WARN_SpellShapingMaxMagic', {
            magic: value
          }))
        }
        dialogData.magic.spell.area = -value
        break
      case "toxinDoses": {
        //Several doses at once: +1 Power per extra dose (SR5 p. 410)
        let doses = Math.max(1, parseInt(html.querySelector('[name="toxinDoses"]').value) || 1)
        html.querySelector('[name="toxinDoses"]').value = doses
        dialogData.toxinDoses = doses
        //The antitoxin comes off after the doses (Chrome Flesh p. 154)
        dialogData.damage.toxin.power = SR5_Toxins.effectivePower(dialogData.damage.toxin.basePower + doses - 1, dialogData.damage.toxin.antitoxin)
        //The title shows the Power: [10P] becomes [12P]
        dialogData.test.title = dialogData.test.title.replace(/\[\d+/, `[${dialogData.damage.toxin.power}`)
        return
      }
      case "manaBarrierRating": {
        let barrierRating = parseInt((html.querySelector('[name="manaBarrierRating"]').value || 1))
        html.querySelector('[name="baseDicePool"]').value = barrierRating * 2
        this.dialogData.dicePool.value = barrierRating * 2
        this.updateDicePoolValue(html)
        return
      }
      case "patientEssence":
        value = -Math.floor((6 - Math.ceil(value))/2)
        html.querySelector('[name="dicePoolModPatientEssence"]').value = value
        SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', "patientEssence")
        dialogData.dicePool.modifiers.push({
          type: "patientEssence",
          label: `${game.i18n.localize(SR5.dicePoolModTypes[target])} (${value})`,
          value: value
        })
        this.updateDicePoolValue(html)
        return
      case "limitModHealingSupplies":
      case "limitModPerception":
      case "limitModVarious":
        html.querySelector(name).value = value
        dialogData.limit.modifiers[modifierName] = {
          value: value,
          label: `${game.i18n.localize(SR5.limitModTypes[modifierName])}`,
        }
        this.limitModifier[modifierName] = value
        this.updateLimitValue(html)
        return
    }

    html.querySelector(name).value = value
    SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', modifierName)
    dialogData.dicePool.modifiers.push({
      type: modifierName,
      label: game.i18n.localize(SR5.dicePoolModTypes[modifierName]),
      value: value
    })
    this.updateDicePoolValue(html)
  }

  _filledInputModifier(ev, html, dialogData){
    if (ev.length === 0) return
    let modifierName, name, value
    let actor = SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId),
      targetActor = SR5_EntityHelpers.getRealActorFromID(dialogData.target.actorId),
      label

    for (let e of ev){
      modifierName = e.dataset.modifier
      name = `[data-modifier=${modifierName}]`
      label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])

      switch (modifierName){
        case "matrixNoiseReduction":
          if (html.querySelector('[data-modifier="matrixRange"]').value === "wired") {
            this.dicePoolModifier.matrixNoiseReduction = 0
            value = 0
          }
          else {
            let rangeMod = dialogData.matrix.noiseRangeValue || 0,
              sceneNoise = dialogData.matrix.noiseScene || 0,
              actorNoise = dialogData.matrix.personalNoise || 0
            value = actor.system.matrix.attributes.noiseReduction.value
            if (-value < rangeMod + sceneNoise + actorNoise) value = -(rangeMod + sceneNoise + actorNoise)
            if (rangeMod + sceneNoise + actorNoise === 0) value = 0
          }
          break
        case "matrixSceneNoise":
          if (html.querySelector('[data-modifier="matrixRange"]').value !== "wired") value = dialogData.matrix.noiseScene
          else value = 0
          break
        case "matrixActorNoise":
          if (html.querySelector('[data-modifier="matrixRange"]').value !== "wired") value = dialogData.matrix.personalNoise
          else value = 0
          break
        case "incomingPA": {
          let armorValue = parseInt((html.querySelector('[data-modifier="armor"]').value || 0))
          let incomingAP = parseInt((html.querySelector('[data-modifier="incomingPA"]').value || 0))
          if (armorValue >= -incomingAP) value = incomingAP
          else {
            let usedAP = armorValue + incomingAP
            value = incomingAP - usedAP
          }
          break
        }
        case "armor":
          continue
        case "publicGrid":
          if (html.querySelector('[data-modifier="matrixRange"]').value !== "wired" && game.settings.get("sr5", "sr5MatrixGridRules")) value = -2
          else value = 0
          break
        case "force":
          this.updateDrainValue(html)
          if (dialogData.test.type === "ritual") this._updateReagents(1, actor, html, dialogData)
          continue
        case "level":
          this.updateFadingValue(html)
          continue
        case "spiritType": {
          // Binding reads the type off the targeted spirit, so the type may be
          // one the list no longer holds: a custom type whose item was deleted
          // leaves its spirits behind with a key nothing answers to.
          const boundType = targetActor?.system.type
          const boundSpiritPool = (dialogData.target.actorId && dialogData.test.typeSub === "binding") ?
            actor.system.skills.binding.spiritType[boundType] :
            null
          if (boundSpiritPool) {
            value = boundSpiritPool.dicePool - actor.system.skills.binding.test.dicePool
            label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${SR5_SpiritTypes.label(boundType)})`
          } else {
            if (boundType && dialogData.test.typeSub === "binding") {
              SR5_SystemHelpers.srLog(2, `Unknown spirit type '${boundType}' on the bound spirit, no type modifier applied`)
            }
            value = 0
          }
          break
        }
        case "patientEssence": {
          let patientEssence = (targetActor?.system.essence.value ? targetActor.system.essence.value : 6)
          html.querySelector('[name="patientEssence"]').value = patientEssence
          value = -Math.floor((6 - Math.ceil(patientEssence))/2)
          html.querySelector('[name="dicePoolModPatientEssence"]').value = value
          dialogData.dicePool.modifiers.push({
            type: "patientEssence",
            label: `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${patientEssence})`,
            value: value
          })
          this.updateDicePoolValue(html)
          continue
        }
        case "backgroundCount":
          value = parseInt((html.querySelector(name).value || 0))
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.traditionTypes[dialogData.sceneData.backgroundAlignement])})`
          break
        default:
          value = parseInt((html.querySelector(name).value || 0))
      }

      html.querySelector(name).value = value
      dialogData.dicePool.modifiers.push({
        type: modifierName,
        label: label,
        value: value
      })
      this.updateDicePoolValue(html)
    }
  }

  //Select modifiers
  async _selectModifiers(ev, html, dialogData){
    let target = ev.currentTarget.dataset.target,
      name = `[name=${target}]`,
      modifierName = ev.currentTarget.dataset.modifier,
      value, limitDV, action,
      actor = SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId),
      label = game.i18n.localize(SR5.dicePoolModTypes[modifierName]),
      position = this.dialog.position,
      chokeLimitModify, chokeLimitModified, weapon, changeCost

    position.height = "auto"

    if (ev === null) value = 0
    else {
      switch (modifierName){
        case "weather":
          value = SR5_ConverterHelpers.weatherConditionToMod(ev.target.value)
          break
        case "socialAttitude":
          value = SR5_ConverterHelpers.socialAttitudeToMod(ev.target.value)
          break
        case "socialResult":
          value = SR5_ConverterHelpers.socialResultToMod(ev.target.value)
          break
        case "workingCondition":
          value = SR5_ConverterHelpers.workingConditionToMod(ev.target.value)
          break
        case "toolsAndParts":
          value = SR5_ConverterHelpers.toolsAndPartsToMod(ev.target.value)
          break
        case "plansMaterial":
          value = SR5_ConverterHelpers.plansMaterialToMod(ev.target.value)
          break
        case "attribute":
          if (ev.target.value === "none") value = 0
          else {
            if (SR5.characterSpecialAttributes[ev.target.value]){
              value = actor.system.specialAttributes[ev.target.value].augmented.value
            } else {
              value = actor.system.attributes[ev.target.value].augmented.value
            }
          }
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.allAttributes[ev.target.value])})`
          break
        case "incomingFiringMode":
          value = SR5_ConverterHelpers.firingModeToDefenseMod(ev.target.value)
          label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])
          break
        case "targetRange": {
          let baseRange = SR5_ConverterHelpers.rangeToEnvironmentalLine(ev.target.value)
          baseRange += actor.system.itemsProperties.environmentalMod.range.value
          value = SR5_CombatHelpers.rangeModifierWithEnvironment(baseRange, dialogData.combat.environmentalColumns)
          label = game.i18n.localize(dialogData.combat.environmentalColumns ? "SR5.RangeWithEnvironment" : SR5.dicePoolModTypes[modifierName])
          dialogData.target.range = ev.target.value
          // Handle choke
          if (dialogData.combat.weaponType === "shotgun") {
            dialogData.combat.choke.damageModify = SR5_PrepareRollHelper.chokeSettingsOnDamage(dialogData.combat.choke.selected, dialogData.target.range)
            chokeLimitModify = SR5_PrepareRollHelper.chokeSettingsOnLimit(dialogData.combat.choke.selected, dialogData.target.range)
            dialogData.combat.choke.defense = SR5_PrepareRollHelper.chokeSettingsOnDefense(dialogData.combat.choke.selected, dialogData.target.range)
            chokeLimitModified = Object.keys(dialogData.limit.modifiers).find(e => e === "chokeSettings")
            if (chokeLimitModify && !chokeLimitModified) {
              dialogData.limit.modifiers["chokeSettings"] = {
                value: chokeLimitModify,
                label: `${game.i18n.localize(SR5.chokeSettings[dialogData.combat.choke.selected])}`,
              }
              html.querySelector("[name=chokeSettings]").value = chokeLimitModify
              this.limitModifier[modifierName] = chokeLimitModify
              this.updateLimitValue(html)
              dialogData.combat.choke.limit = chokeLimitModify
            }
          }
          break
        }
        case "chokeSettings":
          dialogData.combat.choke.selected = ev.target.value
          html.querySelector(name).value = value
          label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])
          dialogData.combat.choke.damageModify = SR5_PrepareRollHelper.chokeSettingsOnDamage(ev.target.value, dialogData.target.range)
          chokeLimitModify = SR5_PrepareRollHelper.chokeSettingsOnLimit(ev.target.value, dialogData.target.range)
          dialogData.combat.choke.defense = SR5_PrepareRollHelper.chokeSettingsOnDefense(dialogData.combat.choke.selected, dialogData.target.range)
          value = chokeLimitModify
          chokeLimitModified = Object.keys(dialogData.limit.modifiers).find(e => e === "chokeSettings")
          if (chokeLimitModify && !chokeLimitModified) {
            dialogData.limit.modifiers[modifierName] = {
              value: chokeLimitModify,
              label: `${game.i18n.localize(SR5.chokeSettings[dialogData.combat.choke.selected])}`,
            }
            this.limitModifier[modifierName] = chokeLimitModify
            this.updateLimitValue(html)
            dialogData.combat.choke.limit = chokeLimitModify
          }
          //actions
          weapon = await fromUuid(dialogData.owner.itemUuid)
          if (SR5_ConverterHelpers.chokeToCode(weapon.system.choke) !== dialogData.combat.choke.selected && !dialogData.combat.choke.actionSpent){
            action = [{
              type: "simple", value: 1, source: "changeChokeSettings"
            }]
            if (weapon.system.isWireless && (weapon.system.accessory.find(a => a.name === "smartgunSystemInternal" || a.name === "smartgunSystemExternal")) && (actor.system.specialProperties.smartlink.value > 0)) action = [{
              type: "free", value: 1, source: "changeChokeSettings"
            }]
            SR5Combat.changeActionInCombat(dialogData.owner.actorId, action)
            dialogData.combat.choke.actionSpent = true
          } else if (SR5_ConverterHelpers.chokeToCode(weapon.system.choke) === dialogData.combat.choke.selected && dialogData.combat.choke.actionSpent){
            action = [{
              type: "simple", value: -1, source: "changeChokeSettings"
            }]
            if (weapon.system.isWireless && (weapon.system.accessory.find(a => a.name === "smartgunSystemInternal" || a.name === "smartgunSystemExternal")) && (actor.system.specialProperties.smartlink.value > 0)) action = [{
              type: "free", value: -1, source: "changeChokeSettings"
            }]
            SR5Combat.changeActionInCombat(dialogData.owner.actorId, action)
            dialogData.combat.choke.actionSpent = false
          }

          break
        case "firingMode":
          dialogData.combat.firingMode.selected = ev.target.value
          // Bull's Eye counts the bullets of the burst: picked before the mode, it kept the old mode's AP
          if (dialogData.combat.calledShot?.name === "bullsEye" && dialogData.combat.armorPenetrationBeforeCalledShot !== undefined) {
            const bullsEyeWeapon = await fromUuid(dialogData.owner.itemUuid)
            dialogData.combat.armorPenetration = SR5_CalledShotHelpers.bullsEyeArmorPenetration(dialogData.combat.armorPenetrationBeforeCalledShot, bullsEyeWeapon?.system.armorPenetration.base ?? 0, ev.target.value)
          }
          value = this.calculRecoil(html)
          action = SR5_ConverterHelpers.firingModeToAction(ev.target.value)
          dialogData.combat.actions = SR5_MiscellaneousHelpers.addActions(dialogData.combat.actions, action)
          modifierName = "recoil"
          label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])
          //actions
          weapon = await fromUuid(dialogData.owner.itemUuid)
          changeCost = SR5_ConverterHelpers.firingModeChangeCost(weapon.system.firingMode, dialogData.combat.firingMode.selected, dialogData.combat.firingMode.actionSpent)
          if (changeCost > 0){
            action = [{
              type: "simple", value: 1, source: "changeFiringMode"
            }]
            if (weapon.system.isWireless && (weapon.system.accessory.find(a => a.name === "smartgunSystemInternal" || a.name === "smartgunSystemExternal")) && (actor.system.specialProperties.smartlink.value > 0)) action = [{
              type: "free", value: 1, source: "changeFiringMode"
            }]
            SR5Combat.changeActionInCombat(dialogData.owner.actorId, action)
            dialogData.combat.firingMode.actionSpent = true
          } else if (changeCost < 0){
            action = [{
              type: "simple", value: -1, source: "changeFiringMode"
            }]
            if (weapon.system.isWireless && (weapon.system.accessory.find(a => a.name === "smartgunSystemInternal" || a.name === "smartgunSystemExternal")) && (actor.system.specialProperties.smartlink.value > 0)) action = [{
              type: "free", value: -1, source: "changeFiringMode"
            }]
            SR5Combat.changeActionInCombat(dialogData.owner.actorId, action)
            dialogData.combat.firingMode.actionSpent = false
          }
          break
        case "matrixActionType": {
          // Kill Code p. 43: I Am the Firewall is a Complex action or an Interruption action (-5 Initiative)
          // Kill Code p. 45: a Watchdog mark opens the same choice on Haywire, Popup (-10) and Squelch (-5)
          let cost = dialogData.combat.interruptionInitiativeCost || 5
          let chosen = ev.target.value
          if (chosen === "interruption" && !SR5_RollDialog.hasInitiativeForInterruption(actor, cost)) chosen = ev.target.value = dialogData.combat.matrixActionTypeDefault
          dialogData.combat.matrixActionType = chosen
          dialogData.combat.actions = SR5_MiscellaneousHelpers.addActions(dialogData.combat.actions, {
            type: chosen, value: 1, source: "matrixAction", initiativeCost: cost
          })
          return
        }
        case "defenseMode": {
          let fullDefense = dialogData.dicePool.modifiers.some(m => m.type === "fullDefense")
          if (!SR5_RollDialog.hasActiveDefenseSkill(actor, ev.target.value)) ev.target.value = "none"
          else if (!SR5_RollDialog.hasInitiativeForInterruption(actor, SR5_RollDialog.defenseStanceCost(actor, fullDefense, ev.target.value))) ev.target.value = "none"
          value = SR5_ConverterHelpers.activeDefenseToMod(ev.target.value, dialogData.combat.activeDefenses)
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.characterDefenses[ev.target.value])})`
          dialogData.combat.activeDefenseSelected = ev.target.value
          // SR5 p. 191-192: dodge, block and parry use a skill, so the Physical limit applies to the defense test
          let usesSkill = ["dodge", "block", "parryClubs", "parryBlades"].includes(ev.target.value)
          // A test that already had a limit (a ramming defense) gets it back when the active defense is dropped
          dialogData.combat.activeDefenses.ownLimit ??= {
            base: dialogData.limit.base || 0, type: dialogData.limit.type || ""
          }
          let ownLimit = dialogData.combat.activeDefenses.ownLimit
          dialogData.limit.base = usesSkill ? (dialogData.combat.activeDefenses.limit || 0) : ownLimit.base
          dialogData.limit.type = usesSkill ? "physicalLimit" : ownLimit.type
          let limitRow = html.querySelector('#activeDefenseLimit')
          if (limitRow) limitRow.style.display = usesSkill ? '' : 'none'
          break
        }
        case "cover":
          value = SR5_ConverterHelpers.coverToMod(ev.target.value)
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.coverTypes[ev.target.value])})`
          if (ev.target.value === "partial") {
            SR5_EntityHelpers.addEffectToActor(actor, "cover")
            SR5_EntityHelpers.deleteEffectOnActor(actor, "coverFull")
          } else if (ev.target.value === "full") {
            SR5_EntityHelpers.addEffectToActor(actor, "coverFull")
            SR5_EntityHelpers.deleteEffectOnActor(actor, "cover")
          }
          else {
            SR5_EntityHelpers.deleteEffectOnActor(actor, "cover")
            SR5_EntityHelpers.deleteEffectOnActor(actor, "coverFull")
          }
          break
        case "mark":
          value = SR5_ConverterHelpers.markToMod(ev.target.value)
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${ev.target.value})`
          dialogData.matrix.mark = parseInt(ev.target.value)
          break
        case "matrixRange":
          value = SR5_ConverterHelpers.matrixDistanceToMod(ev.target.value)
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.matrixNoiseDistance[ev.target.value])})`
          if (ev.target.value !== "wired") {
            const matrixNoiseSceneEl = html.querySelector('#matrixNoiseScene')
            if (matrixNoiseSceneEl) matrixNoiseSceneEl.style.display = ''
            const matrixNoiseReductionEl = html.querySelector('#matrixNoiseReduction')
            if (matrixNoiseReductionEl) matrixNoiseReductionEl.style.display = ''
            const matrixTargetGridEl = html.querySelector('#matrixTargetGrid')
            if (matrixTargetGridEl) matrixTargetGridEl.style.display = ''
            if (dialogData.target.grid !== actor.system.matrix.userGrid) {
              html.querySelector('[name="dicePoolModTargetGrid"]').value = -2
              SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', "targetGrid")
              dialogData.dicePool.modifiers.push({
                type: "targetGrid",
                label: `${game.i18n.localize(SR5.dicePoolModTypes["targetGrid"])} (${game.i18n.localize(SR5.gridTypes[html.querySelector('[data-modifier="targetGrid"]').value])})`,
                value: -2
              })
              this.dicePoolModifier.targetGrid = -2
            }
            if ((dialogData.matrix.personalNoise < 0) && (html.querySelector('#matrixNoiseActor'))) {
              const matrixNoiseActorEl = html.querySelector('#matrixNoiseActor')
              if (matrixNoiseActorEl) matrixNoiseActorEl.style.display = ''
            }
          } else {
            const matrixNoiseSceneEl = html.querySelector('#matrixNoiseScene')
            if (matrixNoiseSceneEl) matrixNoiseSceneEl.style.display = 'none'
            const matrixNoiseReductionEl = html.querySelector('#matrixNoiseReduction')
            if (matrixNoiseReductionEl) matrixNoiseReductionEl.style.display = 'none'
            const matrixTargetGridEl = html.querySelector('#matrixTargetGrid')
            if (matrixTargetGridEl) matrixTargetGridEl.style.display = 'none'
            const matrixNoiseActorEl = html.querySelector('#matrixNoiseActor')
            if (matrixNoiseActorEl) matrixNoiseActorEl.style.display = 'none'
            html.querySelector('[name="dicePoolModTargetGrid"]').value = 0
          }
          dialogData.matrix.noiseRangeValue = value
          dialogData.matrix.noiseRange = ev.target.value
          break
        case "targetGrid":
          if (ev.target.value !== actor.system.matrix.userGrid && ev.target.value !== "none") {
            value = -2
            label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.gridTypes[ev.target.value])})`
          } else value = 0
          break
        case "spriteType":
          dialogData.matrix.spriteType = ev.target.value
          return
        case "spiritType":
          if (ev.target.value !== ""){
            html.querySelector(name).value = actor.system.skills.summoning.spiritType[ev.target.value].dicePool - actor.system.skills.summoning.test.dicePool
            dialogData.dicePool.composition = SR5_PrepareRollHelper.getDicepoolComposition(actor.system.skills.summoning.spiritType[ev.target.value].modifiers)
            dialogData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(dialogData)
            //The base dice pool field feeds updateDicePoolValue back: keep it in step with the recomputed base
            html.querySelector('[name="baseDicePool"]').value = dialogData.dicePool.base
            this._syncSpiritTypeOffers(html, dialogData, ev.target.value,
              SR5_PrepareRollHelper.getDicepoolModifiers({
                dicePool: {
                }
              }, actor.system.skills.summoning.spiritType[ev.target.value].modifiers))
          }
          dialogData.magic.spiritType = ev.target.value
          this.updateDicePoolValue(html)
          return
        case "preparationTrigger":
          value = SR5_ConverterHelpers.triggerToMod(ev.target.value)
          html.querySelector(name).value = value
          dialogData.magic.drain.modifiers.trigger = {
            value: value,
            label: `${game.i18n.localize("SR5.PreparationTrigger")} (${game.i18n.localize(SR5.preparationTriggerTypes[ev.target.value])})`,
          }
          dialogData.magic.preparationTrigger = ev.target.value
          this.drainModifier.preparationTrigger = value
          this.updateDrainValue(html)
          return
        case "perceptionType": {
          let limitMod = 0
          value = 0
          delete dialogData.limit.replace
          if (dialogData.limit.typeBeforeReplace !== undefined) dialogData.limit.type = dialogData.limit.typeBeforeReplace
          if (ev.target.value !== ""){
            value = actor.system.skills.perception.perceptionType[ev.target.value].test.value
            limitMod = actor.system.skills.perception.perceptionType[ev.target.value].limit.value
            //Eyes of the Pack (Street Grimoire p. 106): the sense borrowed has the net hits as its Limit, in place of any other
            const replaced = replacedValue(actor.system.skills.perception.perceptionType[ev.target.value].limit.modifiers)
            if (replaced !== undefined) {
              dialogData.limit.replace = replaced
              dialogData.limit.typeBeforeReplace ??= dialogData.limit.type
              dialogData.limit.type = "replaced"
              limitMod = 0
            }
          }
          if (ev.target.value === "sight") {
            const sightPerceptionEl = html.querySelector('#sightPerception')
            if (sightPerceptionEl) sightPerceptionEl.style.display = ''
            // dicePool.modifiers is an array: reading .environmentalSceneMod on it threw, and the end of this case
            // (perception type and limit) never ran. With no scene, handleEnvironmentalModifiers warns and returns 0.
            const environmentalMod = SR5_CombatHelpers.handleEnvironmentalModifiers(SR5_CombatHelpers.environmentScene(), actor.system, true)
            SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', "environmentalSceneMod")
            if (environmentalMod !== 0) dialogData.dicePool.modifiers.push({
              type: "environmentalSceneMod",
              label: game.i18n.localize(SR5.dicePoolModTypes["environmentalSceneMod"]),
              value: environmentalMod,
            })
            label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.perceptionTypes[ev.target.value])})`
            const environmentalInput = html.querySelector('[data-modifier="environmentalSceneMod"]')
            if (environmentalInput) environmentalInput.value = environmentalMod
            this.dicePoolModifier.environmental = environmentalMod
          } else {
            const sightPerceptionEl = html.querySelector('#sightPerception')
            if (sightPerceptionEl) sightPerceptionEl.style.display = 'none'
            SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', "environmentalSceneMod")
            this.dicePoolModifier.environmental = 0
          }
          dialogData.various.perceptionType = ev.target.value
          dialogData.limit.modifiers.perception = {
            value: limitMod,
            label: `${game.i18n.localize(SR5.limitModTypes["limitModPerception"])} (${game.i18n.localize(SR5.perceptionTypes[ev.target.value])})`,
          }
          this.limitModifier.perceptionType = limitMod
          // The limit block is not rendered when the base limit is 0 (roll-dialog.hbs): its fields may be missing
          const perceptionLimitInput = html.querySelector('[name="limitModPerception"]')
          if (perceptionLimitInput) perceptionLimitInput.value = limitMod
          this.updateLimitValue(html)
          break
        }
        case "signatureSize":
          value = SR5_ConverterHelpers.signatureToMod(ev.target.value)
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.targetSignature[ev.target.value])})`
          break
        case "searchType":
          value = SR5_ConverterHelpers.searchTypeToThreshold(ev.target.value)
          dialogData.threshold.value = value
          dialogData.threshold.type = ev.target.value
          html.querySelector(name).value = value
          return
        case "damageType":
          dialogData.damage.type = ev.target.value
          return
        case "healingCondition":
          value = SR5_ConverterHelpers.healingConditionToMod(ev.target.value)
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.healingConditions[ev.target.value])})`
          dialogData.healingCondition = ev.target.value
          break
        case "bbMode": {
          //Bullets & Bandages p. 14-16: treatment, stabilization (an extended test) or diagnosis of the targeted patient
          dialogData.test.bbMode = ev.target.value
          dialogData.test.bbDiagnosisPatient = null
          value = 0
          const patient = dialogData.target.hasTarget ? SR5_EntityHelpers.getRealActorFromID(dialogData.target.actorId) : null
          //BB p. 15: the diagnosis bonus goes to the next stabilization or treatment of that patient
          value = bbModeDiagnosisDice(ev.target.value, bbPatientEntry(patient).diagnosis)
          if (value){
            dialogData.test.bbDiagnosisPatient = patient.uuid
          }
          label = game.i18n.localize("SR5.BB_DiagnosisBonus")
          const extendedToggle = html.querySelector('[name="toggleExtendedTest"]')
          if (ev.target.value === "stabilization" && extendedToggle && !extendedToggle.checked){
            const intervalSelect = html.querySelector('[name="extendedTime"]')
            if (intervalSelect) intervalSelect.value = "combatTurn"
            extendedToggle.checked = true
            this._onToggleExtendedTest(true, dialogData, html)
          }
          break
        }
        case "healingSupplies": {
          dialogData.limit.modifiers.healingSupplies = {
            value:0
          }
          // Inside the limit block, which is not rendered when the base limit is 0
          const suppliesLimitInput = html.querySelector('[name="limitModHealingSupplies"]')
          if (suppliesLimitInput) suppliesLimitInput.value = 0
          switch(ev.target.value){
            case "noSupplies":
              value = -3
              break
            case "improvised":
              //SR5 p. 208: -1; Bullets & Bandages p. 18 (advanced medkits): -3 less the improvising hits, capped at 3
              value = improvisedSuppliesDice(html.querySelector('[name="bbImprovisedHits"]')?.value, !!dialogData.various?.bbImprovised)
              break
            case "medkit": {
              //Bullets & Bandages p. 18-19: the rating is bonus dice, and a medkit without supplies still adds it, with -3
              const advancedKit = advancedMedkitRules() ? actor.items.find(i => i.system.isMedkit) : null
              if (advancedKit){
                value = advancedMedkitDice(advancedKit.system.itemRating, advancedKit.system.charge)
                dialogData.owner.itemUuid = advancedKit.uuid
                dialogData.test.bbMedkitUuid = advancedKit.uuid
                dialogData.test.bbMedkitRating = Number(advancedKit.system.itemRating) || 0
                dialogData.limit.modifiers.healingSupplies.value = dialogData.test.bbMedkitRating
                dialogData.limit.modifiers.healingSupplies.label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])
                if (suppliesLimitInput) suppliesLimitInput.value = dialogData.test.bbMedkitRating
                if (!(Number(advancedKit.system.charge) > 0)) ui.notifications.warn(game.i18n.localize("SR5.BB_MedkitEmpty"))
                break
              }
              let medkit = SR5_MiscellaneousHelpers.findMedkitRating(actor)
              if (medkit){
                value = medkit.rating
                dialogData.owner.itemUuid = medkit.uuid
                dialogData.test.bbMedkitRating = medkit.rating
                dialogData.limit.modifiers.healingSupplies.value = value
                dialogData.limit.modifiers.healingSupplies.label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])
                if (suppliesLimitInput) suppliesLimitInput.value = value
              } else {
                ui.notifications.warn(game.i18n.format('SR5.WARN_NoMedkit'))
                value = 0
              }
              break
            }
            default:
              value = 0
          }
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.healingSupplies[ev.target.value])})`
          this.updateLimitValue(html)
          break
        }
        case "targetEffect":
          dialogData.target.itemUuid = ev.target.value
          if (dialogData.test.typeSub === "counterspelling" && ev.target.value){
            let spellCategory = await this.getTargetType(dialogData.target.itemUuid)
            value = parseInt(actor.system.skills.counterspelling.spellCategory[spellCategory].dicePool - actor.system.skills.counterspelling.test.dicePool)
            label = `${game.i18n.localize(SR5.dicePoolModTypes["spellCategory"])} (${game.i18n.localize(SR5.spellCategories[spellCategory])})`
          } else value = 0
          break
        case "objectType":
          html.querySelector('[name="baseDicePool"]').value = parseInt(ev.target.value)
          this.updateDicePoolValue(html)
          return
        case "calledShot":
          if (dialogData.target.hasTarget){
            let targetActor = SR5_EntityHelpers.getRealActorFromID(dialogData.target.actorId)
            let padded = targetActor.system.itemsProperties.armor.padded ? true : false
            value = SR5_CalledShotHelpers.convertCalledShotToMod(ev.target.value, dialogData.combat.ammo.type, padded, dialogData.combat.ammo.effects)
          } else {
            value = SR5_CalledShotHelpers.convertCalledShotToMod(ev.target.value, dialogData.combat.ammo.type, false, dialogData.combat.ammo.effects)
          }
          // Aim for Perfection (Assassin's Primer p. 15): Called Shot penalties halved
          if (SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId)?.system.specialProperties?.calledShotHalved) value = halveCalledShot(value)
          // Apply martial arts modifier bonus if available for this called shot
          if (dialogData.combat.calledShot.martialArtsModifiers?.[ev.target.value]) {
            value += dialogData.combat.calledShot.martialArtsModifiers[ev.target.value]
          }
          if (ev.target.value === "specificTarget") {
            const calledShotEl = html.querySelector('#calledShotSpecificTarget')
            if (calledShotEl) calledShotEl.style.display = ''
          }
          else {
            const calledShotEl = html.querySelector('#calledShotSpecificTarget')
            if (calledShotEl) calledShotEl.style.display = 'none'
          }
          if (dialogData.combat.armorPenetrationBeforeCalledShot === undefined) dialogData.combat.armorPenetrationBeforeCalledShot = dialogData.combat.armorPenetration
          dialogData.combat.armorPenetration = dialogData.combat.armorPenetrationBeforeCalledShot
          dialogData.combat.calledShot.name = ev.target.value
          dialogData.combat.calledShot.effects = SR5_CalledShotHelpers.convertCalledShotToEffect(ev.target.value, dialogData.combat.ammo.type, dialogData.combat.ammo.effects)
          dialogData.combat.calledShot.limitDV = SR5_CalledShotHelpers.convertCalledShotToLimitDV(ev.target.value, dialogData.combat.ammo.type, dialogData.combat.ammo.effects)
          switch (ev.target.value){
            case "shakeUp":
              dialogData.combat.calledShot.initiative = SR5_CalledShotHelpers.convertCalledShotToInitiativeMod(dialogData.combat.ammo.type, dialogData.combat.ammo.effects)
              break
            case "bullsEye": {
              // Run & Gun p. 130 : la PA de l'attaque est augmentée de la PA de base de l'arme (sans munition)
              // multipliée par le nombre de balles de la rafale, au maximum ×3
              const bullsEyeWeapon = await fromUuid(dialogData.owner.itemUuid)
              dialogData.combat.armorPenetration = SR5_CalledShotHelpers.bullsEyeArmorPenetration(dialogData.combat.armorPenetrationBeforeCalledShot, bullsEyeWeapon?.system.armorPenetration.base ?? 0, dialogData.combat.firingMode.selected)
              break
            }
            case "hitEmWhereItCounts":
              if (dialogData.damage.toxin.power > 0) {
                dialogData.damage.toxin.power += 2
                if (dialogData.damage.value > 0) {
                  dialogData.damage.value += 2
                  dialogData.damage.base += 2
                }
              }
              if (dialogData.damage.toxin.speed > 0) dialogData.damage.toxin.speed -= 1
              break
            case "throughAndInto":
              if (!dialogData.target.actorId) {
                ui.notifications.warn(game.i18n.localize('SR5.WARN_TargetTroughAndInto'))
                return html.querySelector(`[data-modifier="calledShot"]`).value = ""
              } else {
                let targetActor = SR5_EntityHelpers.getRealActorFromID(dialogData.target.actorId)
                value = -(targetActor.system.itemsProperties.armor.value + Math.floor(targetActor.system.attributes.body.augmented.value / 2))
              }
              break
            case "upTheAnte": {
              const upTheAnteEl = html.querySelector('#calledShotSpecificTarget')
              if (upTheAnteEl) upTheAnteEl.style.display = ''
              break
            }
            case "harderKnock":
              dialogData.damage.type = "physical"
              break
            case "vitals":
              dialogData.damage.base += 2
              dialogData.damage.value += 2
              break
          }
          //Manage actions
          //Subduing and strengthening a hold are normal attacks (SR5 p. 195-196): they cost no free action
          if (ev.target.value !== "" && ev.target.value !== "subdue" && ev.target.value !== "strengthenHold") dialogData.combat.actions = SR5_MiscellaneousHelpers.addActions(dialogData.combat.actions, {
            type: "free", value: 1, source: "calledShot"
          })
          else dialogData.combat.actions = SR5_MiscellaneousHelpers.removeActions(dialogData.combat.actions, "calledShot")
          break
        case "calledShotSpecificTarget":
          modifierName = "calledShot"
          value = SR5_CalledShotHelpers.convertCalledShotToMod(ev.target.value)
          limitDV = SR5_CalledShotHelpers.convertCalledShotToLimitDV(ev.target.value)
          if (html.querySelector('[data-modifier="calledShot"]').value === "upTheAnte") {
            value = value - 4
            limitDV = limitDV * 2
          }
          // Aim for Perfection (Assassin's Primer p. 15): "all Called Shots", a specific location included
          if (SR5_EntityHelpers.getRealActorFromID(dialogData.owner.actorId)?.system.specialProperties?.calledShotHalved) value = halveCalledShot(value)
          //Run & Gun p. 148-151: the location technique (Dim Mak, Choquer, Randori) lowers the location penalty
          value += martialArtsLocationBonus(dialogData.combat.calledShot.martialArtsModifiers, html.querySelector('[data-modifier="calledShot"]').value, ev.target.value)
          dialogData.combat.calledShot = {
            //keep the techniques read when the dialog opened, a second location pick needs them too
            martialArts: dialogData.combat.calledShot.martialArts,
            martialArtsModifiers: dialogData.combat.calledShot.martialArtsModifiers,
            limitDV: limitDV,
            location: ev.target.value,
            name: html.querySelector('[data-modifier="calledShot"]').value,
            effects: SR5_CalledShotHelpers.convertCalledShotToEffect(ev.target.value),
          }
          break
        default: value = ev.target.value
      }
    }

    this.dialog.setPosition(position)
    html.querySelector(name).value = value

    //Remove previous mod
    SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', modifierName)

    if (modifierName !== "chokeSettings") {
      dialogData.dicePool.modifiers.push({
        type: modifierName,
        label: label,
        value: value,
      })
    }
    this.updateDicePoolValue(html)
    if (modifierName === "matrixRange") this._filledInputModifier(html.querySelectorAll('.SR-ModInputFilled'), html, dialogData)
  }

  async _filledSelectModifier(ev, html, dialogData){
    if (ev.length === 0) return
    let modifierName, targetInput, targetInputName, name, inputValue, selectValue
    let actor = SR5_EntityHelpers.getRealActorFromID(this.dialogData.owner.actorId),
      label, action

    for (let e of ev){
      modifierName = e.dataset.modifier
      // Each modifier writes its own label: none carries over from the previous one
      label = undefined
      targetInput = e.dataset.target
      targetInputName = `[name=${targetInput}]`
      name = `[data-modifier=${modifierName}]`

      switch (modifierName){
        case "mark":
          selectValue = html.querySelector(name).value
          inputValue = SR5_ConverterHelpers.markToMod(selectValue)
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${inputValue})`
          dialogData.matrix.mark = parseInt(selectValue)
          break
        case "incomingFiringMode":
          selectValue = dialogData.combat.firingMode.selected
          inputValue = SR5_ConverterHelpers.firingModeToDefenseMod(selectValue)
          break
        case "targetRange": {
          selectValue = dialogData.target.range
          let baseRange = SR5_ConverterHelpers.rangeToEnvironmentalLine(dialogData.target.range)
          baseRange += actor.system.itemsProperties.environmentalMod.range.value
          inputValue = SR5_CombatHelpers.rangeModifierWithEnvironment(baseRange, dialogData.combat.environmentalColumns)
          label = game.i18n.localize(dialogData.combat.environmentalColumns ? "SR5.RangeWithEnvironment" : SR5.dicePoolModTypes[modifierName])
          break
        }
        case "chokeSettings": {
          selectValue = dialogData.combat.choke.selected
          html.querySelector(name).value = selectValue
          label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])
          dialogData.combat.choke.defense = SR5_PrepareRollHelper.chokeSettingsOnDefense(dialogData.combat.choke.selected, dialogData.target.range)
          dialogData.combat.choke.damageModify = SR5_PrepareRollHelper.chokeSettingsOnDamage(selectValue, dialogData.target.range)
          //if (dialogData.damage.value) dialogData.damage.value -= ;
          let chokeLimitModify = SR5_PrepareRollHelper.chokeSettingsOnLimit(selectValue, dialogData.target.range)
          dialogData.combat.choke.defense = SR5_PrepareRollHelper.chokeSettingsOnDefense(selectValue, dialogData.target.range)
          inputValue = chokeLimitModify
          let chokeLimitModified = Object.keys(dialogData.limit.modifiers).find(e => e === "chokeSettings")
          if (chokeLimitModify && !chokeLimitModified) {
            dialogData.limit.modifiers[modifierName] = {
              value: chokeLimitModify,
              label: `${game.i18n.localize(SR5.chokeSettings[selectValue])}`,
            }
            this.limitModifier[modifierName] = chokeLimitModify
            this.updateLimitValue(html)
            dialogData.combat.choke.limit = chokeLimitModify
          }
          break
        }
        case "firingMode":
          selectValue = dialogData.combat.firingMode.selected
          inputValue = this.calculRecoil(html)
          action = SR5_ConverterHelpers.firingModeToAction(selectValue)
          dialogData.combat.actions = SR5_MiscellaneousHelpers.addActions(dialogData.combat.actions, action)
          modifierName = "recoil"
          label = game.i18n.localize(SR5.dicePoolModTypes[modifierName])
          break
        case "spiritType":
          selectValue = html.querySelector(name).value
          html.querySelector(targetInputName).value = actor.system.skills.summoning.spiritType[selectValue].dicePool - actor.system.skills.summoning.test.dicePool
          dialogData.dicePool.composition = SR5_PrepareRollHelper.getDicepoolComposition(actor.system.skills.summoning.spiritType[selectValue].modifiers)
          dialogData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(dialogData)
          //The base dice pool field feeds updateDicePoolValue back: keep it in step with the recomputed base
          html.querySelector('[name="baseDicePool"]').value = dialogData.dicePool.base
          this._syncSpiritTypeOffers(html, dialogData, selectValue,
            SR5_PrepareRollHelper.getDicepoolModifiers({
              dicePool: {
              }
            }, actor.system.skills.summoning.spiritType[selectValue].modifiers))
          dialogData.magic.spiritType = selectValue
          this.updateDicePoolValue(html)
          continue
        case "spriteType":
          dialogData.matrix.spriteType = html.querySelector(name).value
          continue
        case "preparationTrigger":
          inputValue = SR5_ConverterHelpers.triggerToMod(html.querySelector('[data-modifier="preparationTrigger"]').value)
          dialogData.magic.drain.modifiers.trigger = inputValue
          dialogData.magic.preparationTrigger = html.querySelector('[data-modifier="preparationTrigger"]').value
          dialogData.magic.drain.modifiers.trigger = {
            value: inputValue,
            label: `${game.i18n.localize("SR5.PreparationTrigger")} (${game.i18n.localize(SR5.preparationTriggerTypes[dialogData.magic.preparationTrigger])})`,
          }
          this.drainModifier.preparationTrigger = inputValue
          this.updateDrainValue(html)
          continue
        case "searchType":
          selectValue = html.querySelector(name).value
          inputValue = SR5_ConverterHelpers.searchTypeToThreshold(selectValue)
          dialogData.threshold.value = inputValue
          dialogData.threshold.type = selectValue
          html.querySelector(targetInputName).value = inputValue
          continue
        case "damageType":
          dialogData.damage.type = html.querySelector(name).value
          continue
        // The list shown must match the 0 applied: "of no value" and "neutral" are the 0 lines of SR5 p. 142
        case "socialResult":
          selectValue = "ofNoValue"
          inputValue = 0
          break
        case "socialAttitude":
          selectValue = "neutral"
          // Faction Reputation of the character with the target's faction (Cutting Aces p. 160)
          if (dialogData.social?.attitude){
            selectValue = dialogData.social.attitude
            inputValue = SR5_ConverterHelpers.socialAttitudeToMod(selectValue)
            // Neither the faction nor the score: the chat card is read by every player (Q9)
            label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize("SR5.FACTION_RollLabel")})`
          } else inputValue = 0
          break
        case "targetEffect":
          selectValue = html.querySelector(name).value
          dialogData.target.itemUuid = selectValue
          if (dialogData.test.typeSub === "counterspelling" && selectValue){
            let spellCategory = await this.getTargetType(dialogData.target.itemUuid)
            inputValue = parseInt(actor.system.skills.counterspelling.spellCategory[spellCategory].dicePool - actor.system.skills.counterspelling.test.dicePool)
            label = `${game.i18n.localize(SR5.dicePoolModTypes["spellCategory"])} (${game.i18n.localize(SR5.spellCategories[spellCategory])})`
          } else inputValue = 0
          break
        case "cover": {
          let coverEffect = actor.effects.find(e => e.origin === "cover")
          let coverFullEffect = actor.effects.find(e => e.origin === "coverFull")
          if (coverFullEffect) selectValue = "full"
          else if (coverEffect) selectValue = "partial"
          else selectValue = "none"
          inputValue = SR5_ConverterHelpers.coverToMod(selectValue)
          label = `${game.i18n.localize(SR5.dicePoolModTypes[modifierName])} (${game.i18n.localize(SR5.coverTypes[selectValue])})`
          break
        }
        case "defenseChokeSettings":
          inputValue = dialogData.combat.choke.defense
          break
      }

      html.querySelector(targetInputName).value = inputValue
      html.querySelector(name).value = selectValue
      dialogData.dicePool.modifiers.push({
        type: modifierName,
        label: label,
        value: inputValue,
      })
      this.updateDicePoolValue(html)
    }
  }

  //Manage auto filled threhsold
  _filledThreshold(ev, html, dialogData){
    if (ev.length === 0) return
    let targetInput, name, value, label

    for (let e of ev){
      targetInput = e.dataset.target
      if (targetInput === "survivalThreshold") {
        value = 1
        label = "mild"
      } else if (targetInput === "restraintThreshold"){
        value = 2
        label = "rope"
      } else if (targetInput === "perceptionThreshold"){
        value = 0
        label = "opposed"
      }
    }

    name = `[name=${targetInput}]`
    html.querySelector(name).value = value
    dialogData.threshold.value = value
    dialogData.threshold.type = label
  }

  //Manage threhsold
  _manageThreshold(ev, html, dialogData){
    let value, label
    let targetInput = ev.currentTarget.dataset.target

    label = ev.target.value
    value = ev.target.value
    if (targetInput === "survivalThreshold") value = SR5_ConverterHelpers.survivalTypeToThreshold(ev.target.value)
    else if (targetInput === "restraintThreshold") value = SR5_ConverterHelpers.restraintTypeToThreshold(ev.target.value)
    else if (targetInput === "perceptionThreshold") value = SR5_ConverterHelpers.perceptionTypeToThreshold(ev.target.value)

    let name = `[name=${targetInput}]`
    html.querySelector(name).value = value
    dialogData.threshold.value = value
    dialogData.threshold.type = label
  }

  _showReagents(html, shown){
    const display = shown ? '' : 'none'
    html.querySelectorAll('#useReagents, #reagentsModControl, .SR-ReagentOptions').forEach(el => el.style.display = display)
  }

  //The tier picked and its stock (modules/system/reagents.js)
  _onReagentOption(html, dialogData, actor){
    dialogData.magic.reagentTier = normalizeTier(html.querySelector('[name="reagentTier"]')?.value)
    dialogData.magic.reagentForeign = !!html.querySelector('[name="reagentForeign"]')?.checked
    const spent = parseInt(html.querySelector('[name="reagentsSpent"]')?.value) || 0
    if (spent > 0) this._updateReagents(spent, actor, html, dialogData)
  }

  _updateReagents(value, actor, html, dialogData){
    const stock = tierStock(actor.system.magic, normalizeTier(dialogData.magic.reagentTier))
    if (value > stock){
      value = stock
      ui.notifications.warn(game.i18n.format('SR5.WARN_MaxReagents', {
        reagents: value
      }))
      if (dialogData.test.type === "ritual") html.querySelector('[name="force"]').value = value
    }
    html.querySelector('[data-modifier="reagents"]').checked = true
    html.querySelector('[name="reagentsSpent"]').value = value
    dialogData.magic.hasUsedReagents = true
    this._showReagents(html, true)
    if (dialogData.test.type !== "ritual" && dialogData.test.typeSub !== "binding"){
      this.limitModifier.reagents = value
      this.updateLimitValue(html)
    }
  }



  //Toggle reset defense
  _onResetDefense(ev, html, dialogData, actor){
    ev.preventDefault()
    let resetedActor = SR5_EntityHelpers.getRealActorFromID(actor.id)
    resetedActor.resetCumulativeDefense()
    SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, 'type', "cumulativeDefense")
    actor.flags.sr5.cumulativeDefense = 0
    ev.currentTarget.closest('li').querySelector('input').value = 0
    this.updateDicePoolValue(html)
  }

  //Handle Extended Test
  _onToggleExtendedTest(isChecked, dialogData, html){
    let position = this.dialog.position
    position.height = "auto"

    if (isChecked) {
      dialogData.test.isExtended = true
      dialogData.test.extended.interval = html.querySelector('[name="extendedTime"]').value
      dialogData.test.extended.multiplier = 1
      html.querySelector('[name="extendedMultiplier"]').value = 1
      const extendedBlockEl = html.querySelector('#extendedBlock')
      if (extendedBlockEl) extendedBlockEl.style.display = ''
      this.dialog.setPosition(position)
    }
    else {
      dialogData.test.isExtended = false
      const extendedBlockEl = html.querySelector('#extendedBlock')
      if (extendedBlockEl) extendedBlockEl.style.display = 'none'
      this.dialog.setPosition(position)
    }
  }

  //Handle Extended Test Value
  _onChangeExtendedTest(isChecked, dialogData, html){
    dialogData.test.extended.interval = html.querySelector('[name="extendedTime"]').value
    dialogData.test.extended.multiplier = html.querySelector('[name="extendedMultiplier"]').value
  }

}
