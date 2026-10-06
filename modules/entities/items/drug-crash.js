import {
  SR5
} from "../../config.js"
import {
  SR5_PrepareRollTest
} from "../../rolls/roll-prepare.js"
import {
  unitKey
} from "./drug-phase.js"
import {
  drugHasCrash, drugCrashIsInstant
} from "./drug-stat.js"
import {
  crashDamageOf, drugKeyOf
} from "./drug-damage.js"

// The crash of a drug, "the negative effects that follow the effect of the drug" (Chrome Flesh p. 194).
// One path for all: the switch of the sheet, an interaction (Chrome Flesh p. 197) and the calendar

// Start the crash on the system data of a drug (changed in place, written by the caller): the effect ends,
// the crash duration is shown and its damage applies. `itemId`: the drug, for a resisted damage (drug-damage.js)
export async function startDrugCrash(data, actor, itemId = "", options = {
}) {
  let shot = data.handleShot ?? {
  }
  data.isActive = false
  data.onUse.duration = ""
  //A drug without crash (a psychochip, a medicine) is over when its effect ends: left in a crash with no
  //duration, the calendar never counted its end and its switch stayed on the crash
  if (!drugHasCrash(data)) {
    data.wirelessTurnedOn = false
    data.phase = ""
    data.interact = false
    data.onUse.contrecoup = ""
    return
  }
  data.wirelessTurnedOn = true
  data.phase = "crash"
  if (shot.durationContrecoup) {
    data.onUse.contrecoup = `${shot.durationContrecoup} ${game.i18n.localize(unitKey(SR5.extendedIntervals[shot.durationContrecoupType], shot.durationContrecoup))}`
    //eX and galak: the -2 social Limit of the crash has its own duration, (Body) hours (Chrome Flesh p. 186),
    //changed by the quality of the drug (entities/items/drug-stat.js)
    if (shot.socialLimitContrecoup) data.onUse.contrecoup += ` ; ${game.i18n.format("SR5.DrugSocialLimitCrash", {
      duration: `${shot.socialLimitContrecoup} ${game.i18n.localize(unitKey(SR5.extendedIntervals[shot.socialLimitContrecoupType ?? "hour"], shot.socialLimitContrecoup))}`
    })}`
    await ui.notifications.info(`${actor.name}${game.i18n.format("SR5.Colons")} ${game.i18n.format("SR5.DrugContrecoup")} (${game.i18n.localize(SR5.drugs[shot.name])})${game.i18n.format("SR5.Colons")} ${data.onUse.contrecoup}`)
  }
  //The damage of the crash, read off the drug key (drug-damage.js). The sheet applies it after its own update, which
  //would otherwise write the condition monitor back as it was (options.deferDamage)
  const damage = crashDamageOf(drugKeyOf(data), shot, actor.items)
  if (damage) {
    damage.phase = "crash"
    damage.itemId = itemId
    if (options.deferDamage) options.deferDamage.push(damage)
    else await applyDrugDamage(actor, damage)
  }
  //A crash that is only damage is over once it is taken (drug-stat.js)
  if (drugCrashIsInstant(data)) {
    data.wirelessTurnedOn = false
    data.phase = ""
    data.interact = false
    data.onUse.contrecoup = ""
  }
}

//Chrome Flesh p. 197, interaction 11 to 13: "the crashes deal Physical damage rather than Stun", noted on the drug
//(handleShot.crashPhysical) until its crash
export function crashDamageType(shot) {
  return shot?.crashPhysical ? "physical" : "stun"
}

// How many extra doses are taken at once (Aisa, Chrome Flesh p. 185), between 0 and the doses left; 0 when closed
export async function askDrugDoses(name, max) {
  const extra = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: "SR5.DrugExtraDosesTitle"
    },
    content: `<p>${game.i18n.format("SR5.DrugExtraDoses", {
      drug: foundry.utils.escapeHTML(name)
    })}</p><input type="number" name="extra" value="0" min="0" max="${Number(max) || 0}" step="1" autofocus>`,
    ok: {
      callback: (event, button) => button.form.elements.extra.valueAsNumber
    },
    rejectClose: false,
  })
  return Math.min(Math.max(Math.floor(Number(extra) || 0), 0), Number(max) || 0)
}

// Apply a drug damage worked out by drug-damage.js: taken at once without a test, or a resistance card whose value
// and pool the system works out again from the drug (drugResistance)
export async function applyDrugDamage(actor, damage) {
  let value = damage.value
  if (damage.dice) value = (await new Roll(damage.dice).evaluate()).total
  if (!(value > 0)) return
  let damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
  damageInfo.damage.value = value
  damageInfo.damage.type = damage.type ?? "stun"
  if (["body", "toxin", "bodyWill"].includes(damage.resist)) {
    damageInfo.damage.resistanceType = "drugDamage"
    damageInfo.damage.drug = {
      itemId: damage.itemId ?? "", phase: damage.phase ?? "", interaction: !!damage.interaction
    }
    return actor.rollTest("resistanceCard", null, damageInfo)
  }
  return actor.takeDamage(damageInfo)
}

// The gamemaster puts a drug back to "not taken", without crash, damage nor effect: it corrects a mistake
// (the book wants a crash when the effect wears off, which the usual click does)
export async function resetDrugPhase(item) {
  if (!game.user?.isGM || item?.type !== "itemDrug" || !item.system.phase) return false
  await item.update({
    system: {
      phase: "", isActive: false, wirelessTurnedOn: false, interact: false, onUse: {
        duration: "", contrecoup: ""
      }
    }
  })
  return true
}

// End the rise of a drug owned by an actor, without any sheet open (the calendar calls it when the duration
// is over). Does nothing, and says so, for a drug that is not in its rise
export async function endDrugRise(item) {
  if (item?.type !== "itemDrug" || item.system.phase !== "rise" || !item.parent) return false
  let data = item.toObject().system
  await startDrugCrash(data, item.parent, item.id)
  await item.update({
    system: data
  })
  return true
}
