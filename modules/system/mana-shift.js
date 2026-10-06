import {
  clampBackgroundCount, manaShiftPossible, activeManaShifts, manaShiftKind
} from "./background-count.js"
import {
  SR5_MiscellaneousHelpers
} from "../rolls/roll-helpers/miscellaneous.js"
import {
  consumedKey
} from "../rolls/roll-helpers/socket-guard.js"

// The ritual a resistance card stands for, read again from the chat log, never from the button's data: a ritual
// resistance card a GM wrote (its button is a GM's action: a real one is always the GM's; Gaston's review), of a Mana
// Flux / Mana Ebb named by the ritual item itself, and a whole Force above 0. null when refused
export async function manaShiftOf(messageId){
  const card = SR5_MiscellaneousHelpers.cardOf(messageId)
  if (!card?.byGM || card.data.test?.type !== "ritualResistance") return null
  const ritual = card.data.owner?.itemUuid ? await fromUuid(card.data.owner.itemUuid) : null
  const kind = manaShiftKind(ritual?.name)
  const force = Number(card.data.magic?.force)
  if (!kind || !Number.isInteger(force) || force < 1) return null
  return {
    kind, force, name: ritual.name, sceneId: game.messages.get(card.id)?.speaker?.scene, key: consumedKey(card.id, "manaShift")
  }
}

// Shadow Spells p. 25: the GM applies a sealed Mana Flux / Mana Ebb to the scene the ritual card was
// rolled on. It shifts the count by 1 for [Force] hours of game time; the whole scene is taken as inside
// its Force x 100 m radius. The ritual's Force is the leader's choice (SR5 p. 298), no rule bounds it: the GM
// confirms the Force and the hours before anything is written
export async function applyManaShift(cardData, messageId){
  if (!game.user?.isGM) {
    ui.notifications.warn(game.i18n.localize("SR5.ManaShiftGMOnly"))
    return false
  }
  const shift = await manaShiftOf(messageId)
  if (!shift) {
    ui.notifications.warn(game.i18n.localize("SR5.ManaShiftCardRefused"))
    return false
  }
  //A card applies once: the active GM's ledger of spent cards keeps it (a second click, a copy of the button)
  if (!game.users?.activeGM?.isSelf) {
    ui.notifications.warn(game.i18n.localize("SR5.ManaShiftActiveGMOnly"))
    return false
  }
  if (SR5_MiscellaneousHelpers.isConsumed(shift.key)) {
    ui.notifications.warn(game.i18n.localize("SR5.ManaShiftAlreadyApplied"))
    return false
  }
  const scene = game.scenes.get(shift.sceneId) ?? canvas.scene
  if (!scene) {
    ui.notifications.warn(game.i18n.localize("SR5.ManaShiftNoScene"))
    return false
  }
  const escape = text => foundry.utils.escapeHTML?.(text) ?? text
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: shift.name
    },
    content: `<p>${game.i18n.format("SR5.ManaShiftConfirm", {
      name: escape(shift.name), force: shift.force, scene: escape(scene.name), hours: shift.force
    })}</p>`,
    rejectClose: false,
  }).catch(() => false)
  if (!confirmed) return false
  if (!(await SR5_MiscellaneousHelpers.consume(shift.key))) {
    ui.notifications.warn(game.i18n.localize("SR5.ManaShiftAlreadyApplied"))
    return false
  }
  const base = clampBackgroundCount(scene.flags.sr5?.backgroundCountValue)
  if (!manaShiftPossible(shift.kind, base)) {
    //The ritual fails: the participants still resist the Drain, as on the card
    ui.notifications.warn(game.i18n.format(`SR5.ManaShiftFails_${shift.kind}`, {
      count: base
    }))
    return true
  }
  const now = game.time.worldTime
  const sources = activeManaShifts(scene.flags.sr5, now)
  sources.push({
    id: foundry.utils.randomID(),
    kind: shift.kind,
    name: shift.name,
    force: shift.force,
    expires: now + (Number(shift.force) || 0) * 3600,
  })
  await scene.update({
    "flags.sr5.backgroundCountSources": sources
  })
  ui.notifications.info(game.i18n.format(`SR5.ManaShiftApplied_${shift.kind}`, {
    scene: scene.name, hours: shift.force
  }))
  return true
}

// Remove one running ritual from a scene (scene sheet)
export async function removeManaShift(scene, id){
  const sources = (scene.flags.sr5?.backgroundCountSources ?? []).filter(s => s.id !== id)
  await scene.update({
    "flags.sr5.backgroundCountSources": sources
  })
}

// When game time passes, the GM drops the rituals that have run out, which prepares the actors again
// through the scene update hook
export async function sr5HookExpireManaShifts(worldTime){
  const designated = game.users?.activeGM
  if (designated ? !designated.isSelf : !game.user.isGM) return
  for (const scene of game.scenes ?? []){
    const sources = scene.flags.sr5?.backgroundCountSources
    if (!sources?.length) continue
    const running = activeManaShifts(scene.flags.sr5, worldTime)
    if (running.length !== sources.length) await scene.update({
      "flags.sr5.backgroundCountSources": running
    })
  }
}
