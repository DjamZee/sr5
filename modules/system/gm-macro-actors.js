// The actors a GM macro run covers (always-active-macro.js, mentor-conversion.js): the ones given, or those the GM picks
// in a dialog. `prefix`: the macro's language keys, `${prefix}` + GMOnly, Title, Scope, Selected, All, NoActor
export async function gmMacroActors(prefix, {
  actor, all
} = {
}){
  if (!game.user.isGM){
    ui.notifications.warn(game.i18n.localize(`${prefix}GMOnly`))
    return null
  }
  if (actor) return [actor]
  if (all) return game.actors.contents
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize(`${prefix}Title`)
    },
    content: `<p>${game.i18n.localize(`${prefix}Scope`)}</p>`,
    buttons: [
      {
        action: "selected", label: game.i18n.localize(`${prefix}Selected`), default: true
      },
      {
        action: "all", label: game.i18n.localize(`${prefix}All`)
      },
    ],
    rejectClose: false,
  })
  if (choice === "all") return game.actors.contents
  if (choice !== "selected") return null
  const selected = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character
  if (!selected){
    ui.notifications.warn(game.i18n.localize(`${prefix}NoActor`))
    return null
  }
  return [selected]
}
