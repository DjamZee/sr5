import {
  SR5
} from "../../config.js"
import {
  SR5_PrepareRollTest
} from "../../rolls/roll-prepare.js"

// The crash of a drug, "the negative effects that follow the effect of the drug" (Chrome Flesh p. 194).
// One path for all: the switch of the sheet, an interaction (Chrome Flesh p. 197) and the calendar

// Start the crash on the system data of a drug (changed in place, written by the caller): the effect ends,
// the crash duration is shown and its Stun damage applies
export async function startDrugCrash(data, actor) {
  let shot = data.handleShot ?? {
  }
  data.isActive = false
  data.wirelessTurnedOn = true
  data.phase = "crash"
  data.onUse.duration = ""
  if (shot.durationContrecoup) {
    data.onUse.contrecoup = `${shot.durationContrecoup} ${game.i18n.localize(SR5.extendedIntervals[shot.durationContrecoupType])}`
    //eX and galak: the -2 social Limit of the crash has its own duration, (Body) hours (Chrome Flesh p. 186)
    if (shot.socialLimitContrecoup) data.onUse.contrecoup += ` ; ${game.i18n.format("SR5.DrugSocialLimitCrash", {
      duration: `${shot.socialLimitContrecoup} ${game.i18n.localize(SR5.extendedIntervals.hour)}`
    })}`
    await ui.notifications.info(`${actor.name}${game.i18n.format("SR5.Colons")} ${game.i18n.format("SR5.DrugContrecoup")} (${game.i18n.localize(SR5.drugs[shot.name])})${game.i18n.format("SR5.Colons")} ${data.onUse.contrecoup}`)
  }
  if (shot.unresistedStunDamage) {
    let damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
    damageInfo.damage.value = shot.unresistedStunDamage
    damageInfo.damage.type = "stun"
    actor.takeDamage(damageInfo)
  }
  if (shot.resistedStunDamage) {
    let damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
    damageInfo.damage.value = shot.resistedStunDamage
    damageInfo.damage.type = "stun"
    damageInfo.damage.resistanceType = "physicalDamage"
    actor.rollTest("resistanceCard", null, damageInfo)
  }
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
  await startDrugCrash(data, item.parent)
  await item.update({
    system: data
  })
  return true
}
