// Grid Hop (lot 19, SR5 p. 235 and 244): a complex action with no test, to a grid one has access to. It had no button:
// its line of the sheet now asks for the grid, spends the action in combat, writes system.matrix.userGrid and tells
// the table. Not from inside a host (leave it first). With no access, the hop is illegal: Brute Force or Hack on the
// Fly against the grid, which the gamemaster opposes; nothing changes here.

import {
  refuseByRule
} from "./rule-locks.js"

// The grids one hops to (SR5 p. 235); "host" is where one stands inside a host, never a destination
export const HOP_GRIDS = ["public", "local", "global"]

/**
 * What a hop asks, before anything is spent.
 * @param {String} from      the actor's userGrid
 * @param {String} to        the grid asked
 * @param {Boolean} access   the character has access to it (subscription, lifestyle, SR5 p. 235)
 * @return {"ok"|"same"|"inHost"|"illegal"|"unknown"}
 */
export function gridHopCheck(from, to, access){
  if (!HOP_GRIDS.includes(to)) return "unknown"
  if (from === "host") return "inHost"
  if (from === to) return "same"
  return access ? "ok" : "illegal"
}

/**
 * Hop to another grid, from the sheet.
 * @param {Object} actor
 * @return {Promise<Boolean>} true if the actor hopped
 */
export async function takeGridHop(actor){
  if (!actor) return false
  const from = actor.system?.matrix?.userGrid ?? "public"
  if (from === "host" && refuseByRule("matrix", "SR5.WARN_GridHopInHost", null, {
    actor
  })) return false
  const options = HOP_GRIDS.filter(grid => grid !== from)
    .map(grid => `<option value="${grid}">${game.i18n.localize(CONFIG.SR5?.gridTypes?.[grid] ?? grid)}</option>`).join("")
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {
      title: "SR5.MatrixActionGridHop"
    },
    content: `<p>${game.i18n.localize("SR5.GridHopHint")}</p><div class="form-group"><select name="grid">${options}</select></div>
      <div class="form-group"><label><input type="checkbox" name="access" checked> ${game.i18n.localize("SR5.GridHopAccess")}</label></div>`,
    buttons: [{
      action: "ok", label: "SR5.MatrixActionGridHop", default: true,
      callback: (_event, button) => ({
        grid: button.form.elements.grid.value, access: button.form.elements.access.checked
      })
    }],
    rejectClose: false,
  })
  if (!choice?.grid) return false
  const check = gridHopCheck(from === "host" ? "public" : from, choice.grid, choice.access)
  if (check === "illegal") {
    ui.notifications.info(game.i18n.localize("SR5.GridHopIllegal"))
    return false
  }
  if (check !== "ok") return false
  const {
    SR5Combat
  } = await import("./srcombat.js")
  const actions = [{
    type: "complex", value: 1, source: "gridHop"
  }]
  if (!SR5Combat.hasActionsLeft(actor, actions)) return false
  const speakerId = actor.isToken ? actor.token?.id : actor.id
  if (game.combat) await SR5Combat.changeActionInCombat(speakerId, actions)
  await actor.update({
    "system.matrix.userGrid": choice.grid
  })
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor
    }),
    content: `<p>${game.i18n.format("SR5.GridHopDone", {
      grid: game.i18n.localize(CONFIG.SR5?.gridTypes?.[choice.grid] ?? choice.grid)
    })}</p>`,
  })
  return true
}
