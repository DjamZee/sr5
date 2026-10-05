import {
  clampBackgroundCount, manaShiftPossible, activeManaShifts
} from "./background-count.js"

// Shadow Spells p. 25: the GM applies a sealed Mana Flux / Mana Ebb to the scene the ritual card was
// rolled on. It shifts the count by 1 for [Force] hours of game time; the whole scene is taken as inside
// its Force x 100 m radius.
export async function applyManaShift(cardData, messageId){
  if (!game.user?.isGM) {
    ui.notifications.warn(game.i18n.localize("SR5.ManaShiftGMOnly"))
    return false
  }
  const shift = cardData.magic?.manaShift
  if (!shift) return false
  const sceneId = game.messages.get(messageId)?.speaker?.scene
  const scene = game.scenes.get(sceneId) ?? canvas.scene
  if (!scene) {
    ui.notifications.warn(game.i18n.localize("SR5.ManaShiftNoScene"))
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
