// GM macro: switch on the always active powers (SR5 p. 396) of the sheets made before they came switched on
// (arbitrage de DjamZ, H39). No automatic migration: the GM runs it, on the selected actor or on every actor of the
// world, and gets a whispered summary. Running it again changes nothing. The rule lives in always-active.js.
import {
  planActivation
} from "./always-active.js"

// The actors a run covers: the ones given, or those the GM picks in a dialog
async function actorsFor({
  actor, all
} = {
}){
  if (!game.user.isGM){
    ui.notifications.warn(game.i18n.localize("SR5.AutoPowersGMOnly"))
    return null
  }
  if (actor) return [actor]
  if (all) return game.actors.contents
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("SR5.AutoPowersTitle")
    },
    content: `<p>${game.i18n.localize("SR5.AutoPowersScope")}</p>`,
    buttons: [
      {
        action: "selected", label: game.i18n.localize("SR5.AutoPowersSelected"), default: true
      },
      {
        action: "all", label: game.i18n.localize("SR5.AutoPowersAll")
      },
    ],
    rejectClose: false,
  })
  if (choice === "all") return game.actors.contents
  if (choice !== "selected") return null
  const selected = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character
  if (!selected){
    ui.notifications.warn(game.i18n.localize("SR5.AutoPowersNoActor"))
    return null
  }
  return [selected]
}

export async function activateAutomaticPowers(options = {
}){
  const actors = await actorsFor(options)
  if (!actors) return
  const lines = []
  for (const actor of actors){
    const plan = planActivation(actor.items)
    if (!plan.length) continue
    await actor.updateEmbeddedDocuments("Item", plan.map(p => ({
      _id: p.id, "system.isActive": true
    })))
    lines.push(game.i18n.format("SR5.AutoPowersLine", {
      actor: actor.name, powers: plan.map(p => p.name).join(", ")
    }))
  }
  const body = lines.length ? `<ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul>` : `<p>${game.i18n.localize("SR5.AutoPowersNothing")}</p>`
  await ChatMessage.create({
    content: `<h3>${game.i18n.localize("SR5.AutoPowersTitle")}</h3>${body}`,
    whisper: ChatMessage.getWhisperRecipients("GM"),
  })
}
