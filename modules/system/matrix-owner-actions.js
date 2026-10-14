// The owner's actions with no test (lot 19): Change Icon, Invite Mark and Switch Interface Mode ask for four marks, that
// is for the owner of the icon (SR5 p. 238-245). They had no button: their line of the sheet now takes them, aimed at
// the user's single target or, with none, at the actor's own icon. The ownership is checked as for a roll
// (matrix-ownership.js), the simple action is spent in combat, and the chat tells the table.

import {
  matrixOwnership, OWNER, UNKNOWN_OWNER
} from "./matrix-ownership.js"
import {
  refuseByRule, noticeGM
} from "./rule-locks.js"
import {
  iceHostOf
} from "./ice-host.js"

export const OWNER_ACTIONS_WITHOUT_TEST = ["changeIcon", "inviteMark", "switchInterfaceMode"]

/**
 * The icon the action is aimed at: the single target, or the actor itself
 * @return {Object|null} the target's actor, or null when several are targeted
 */
export function ownerActionTarget(actor, targets = []){
  const list = [...targets]
  if (list.length > 1) return null
  return list[0]?.actor ?? actor
}

/**
 * Take an owner's action with no test.
 * @param {Object} actor   the acting actor
 * @param {String} key     one of OWNER_ACTIONS_WITHOUT_TEST
 * @return {Promise<Boolean>} true if the action was taken
 */
export async function takeOwnerAction(actor, key){
  if (!actor || !OWNER_ACTIONS_WITHOUT_TEST.includes(key)) return false
  const target = ownerActionTarget(actor, game.user?.targets ?? [])
  if (!target) {
    ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetTooMany"))
    return false
  }
  const speakerId = actor.isToken ? actor.token?.id : actor.id
  const ownership = matrixOwnership(actor, target, {
    speakerId,
    resolve: uuid => globalThis.fromUuidSync?.(uuid) ?? null,
    hostOf: iceHostOf,
    actorById: id => game.actors?.get(id) ?? null,
  })
  const data = {
    name: target.name ?? ""
  }
  if (ownership === UNKNOWN_OWNER) noticeGM("matrix", "SR5.WARN_OwnerUnknown", data, actor)
  else if (ownership !== OWNER && refuseByRule("matrix", "SR5.WARN_OwnerOnlyAction", data, {
    actor
  })) return false
  // Loaded here: the combat imports half the system
  const {
    SR5Combat
  } = await import("./srcombat.js")
  const actions = [{
    type: "simple", value: 1, source: key
  }]
  if (!SR5Combat.hasActionsLeft(actor, actions)) return false
  if (game.combat) await SR5Combat.changeActionInCombat(speakerId, actions)
  const escape = text => foundry.utils?.escapeHTML?.(String(text)) ?? String(text).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor
    }),
    content: `<p>${escape(game.i18n.format("SR5.MatrixOwnerActionTaken", {
      action: game.i18n.localize(`SR5.MatrixAction${key.charAt(0).toUpperCase()}${key.slice(1)}`),
      target: target === actor ? game.i18n.localize("SR5.MatrixOwnerActionSelf") : target.name ?? "",
    }))}</p>`,
  })
  return true
}
