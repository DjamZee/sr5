import {
  SR5_MiscellaneousHelpers
} from "./miscellaneous.js"
import {
  SOCIAL_MANEUVERS, maneuverDice, maneuversFor
} from "../../system/social-maneuvers.js"
import {
  pendingFor, pendingOf
} from "../../system/social-pending.js"
import {
  SR5ConRegistry
} from "../../interface/con-registry.js"
import {
  socialRulesOn
} from "../../system/social-settings.js"

// Cutting Aces in the roll dialog (lot 21): the social maneuver chosen for the test (p. 153-154), the con step it
// rolls (p. 163-164), and what an earlier maneuver left for this test. Prepared with the roll (roll-prepare.js),
// shown by socialCuttingAces.hbs, handled here.

/**
 * What the dialog offers, or null. Kept in rollData.social.ca.
 * @param {Actor} actor
 * @param {object} rollData
 * @param {string} test - the skill key, "knowledge" or "judgeIntentions"
 * @param {object} [chatData] - the card resisted, for an opposed test
 */
export function socialDialogData(actor, rollData, test, chatData){
  const isResist = !!chatData?.test?.isOpposed
  const otherId = isResist ? (chatData.owner?.actorId ?? null) : (rollData.target?.actorId ?? null)
  const pending = pendingFor(pendingOf(actor), {
    test, isResist, otherId
  }).map(p => ({
    id: p.entry.id, label: p.entry.label, kind: p.entry.kind, value: p.entry.value, checked: p.checked,
    persistent: !!p.entry.persistent,
  }))
  const rulesOn = socialRulesOn()
  const maneuvers = rulesOn && !isResist ? maneuversFor(test).map(k => ({
    key: k, label: `SR5.CA_Maneuver_${k}`, dice: maneuverDice(k)
  })) : []
  const cons = rulesOn && !isResist && test === "con" ? SR5ConRegistry.openFor(actor.id).flatMap(c => c.steps.map(step => ({
    value: `${c.id}|${step}`, label: c.name, step: `SR5.CON_Step_${step}`, props: step === "bait" ? c.props : 0
  }))) : []
  if (!pending.length && !maneuvers.length && !cons.length) return null
  return {
    pending, maneuvers, cons
  }
}

function localize(key){
  return game.i18n.localize(key)
}

function setDice(dialogData, type, label, value){
  SR5_MiscellaneousHelpers.removeElementFromArray(dialogData.dicePool.modifiers, "type", type)
  if (value) dialogData.dicePool.modifiers.push({
    type, label, value
  })
}

/**
 * The listeners of the Cutting Aces lines of the roll dialog.
 * @param {SR5_RollDialog} rollDialog
 * @param {HTMLElement} html
 * @param {object} dialogData
 */
export function activateSocialDialog(rollDialog, html, dialogData){
  const ca = dialogData.social?.ca
  if (!ca) return
  dialogData.social.usedPending = []
  dialogData.social.droppedPending = []

  // The social maneuver (p. 153): its dice, and one free action on top of the test's
  html.querySelector('[data-ca="maneuver"]')?.addEventListener("change", ev => {
    const key = ev.target.value
    const value = key ? maneuverDice(key) : 0
    setDice(dialogData, "socialManeuver", `${localize("SR5.CA_Maneuver")} (${key ? localize(`SR5.CA_Maneuver_${key}`) : ""})`, value)
    html.querySelector('[name="dicePoolModSocialManeuver"]').value = value
    dialogData.combat.actions = (dialogData.combat.actions ?? []).filter(a => a.source !== "socialManeuver")
    if (key) {
      dialogData.test.maneuver = key
      dialogData.combat.actions = SR5_MiscellaneousHelpers.addActions(dialogData.combat.actions, {
        type: "free", value: 1, source: "socialManeuver"
      })
      // Push Home (p. 154) is made with leverage: its usual +2 is ticked (the maneuver adds the second)
      if (SOCIAL_MANEUVERS[key]?.doublesLeverage) rollDialog._checkModifier(html, dialogData, "socialBlackmailed", 2)
    } else delete dialogData.test.maneuver
    rollDialog.updateDicePoolValue(html)
  })

  // The con step (p. 163): the bait adds the cumulated Prop Rating to the con artist's dice
  html.querySelector('[data-ca="conStep"]')?.addEventListener("change", ev => {
    const [id, step] = (ev.target.value || "").split("|")
    const choice = ca.cons.find(c => c.value === ev.target.value)
    const value = choice?.props ?? 0
    setDice(dialogData, "conProps", localize("SR5.CON_Props"), value)
    html.querySelector('[name="dicePoolModConProps"]').value = value
    if (id && step) dialogData.test.con = {
      id, step
    }
    else delete dialogData.test.con
    rollDialog.updateDicePoolValue(html)
  })

  // What an earlier maneuver left for this test: ticked when it applies, spent once rolled
  const applyPending = (box) => {
    const entry = ca.pending.find(p => p.id === box.dataset.id)
    if (!entry) return
    const type = `socialPending_${entry.id}`
    const label = `${localize("SR5.CA_Pending")} (${entry.label})`
    const used = new Set(dialogData.social.usedPending)
    if (entry.kind === "limit") {
      delete dialogData.limit.modifiers[type]
      if (box.checked) dialogData.limit.modifiers[type] = {
        value: entry.value, label
      }
      rollDialog.updateLimitValue(html)
    } else {
      setDice(dialogData, type, label, box.checked ? entry.value : 0)
      rollDialog.updateDicePoolValue(html)
    }
    if (box.checked) used.add(entry.id)
    else used.delete(entry.id)
    dialogData.social.usedPending = [...used]
  }
  for (const box of html.querySelectorAll('[data-ca="pending"]')){
    box.addEventListener("change", () => applyPending(box))
    if (box.checked) applyPending(box)
  }
  // Dropped: the effect is gone once the test is rolled (the encounter is over, the gamemaster says no)
  for (const link of html.querySelectorAll('[data-ca="dropPending"]')) link.addEventListener("click", ev => {
    ev.preventDefault()
    const row = link.closest("li")
    const box = row?.querySelector('[data-ca="pending"]')
    if (box?.checked) {
      box.checked = false
      applyPending(box)
    }
    dialogData.social.droppedPending.push(link.dataset.id)
    row?.classList.add("SR-Dropped")
    if (box) box.disabled = true
  })
}
