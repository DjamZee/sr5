import {
  SHARED_VISION_FLAG, SHARED_VISION_ACTOR_TYPES, getSharedViewers, isSharedWith, withViewer, withoutViewer, isViewerStillValid,
  isViewerRequestAllowed, hasMarkFrom
} from "../system/shared-vision.js"
import {
  SR5_SystemHelpers
} from "../system/utilitySystem.js"
import {
  SR5Token
} from "./token.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  SR5Combat
} from "../system/srcombat.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"

export class SR5SharedVision {

  /** Put a user in the shared vision of a token, or take him out
   * The gamemaster or the owner writes the token; anybody else asks the gamemaster
   * @param {Object} tokenDocument - the token seen through
   * @param {Object} entry - { userId, source, markOwnerId }
   * @param {Boolean} remove - true to take the user out
   */
  static async setViewer(tokenDocument, entry, remove = false) {
    if (!tokenDocument) return
    //Read again on the gamemaster's side: two users who ask at once must not erase each other
    if (!tokenDocument.isOwner) return SR5_SocketHandler.emitForGM("sharedVisionSetViewer", {
      tokenUuid: tokenDocument.uuid, entry, remove
    })
    const current = getSharedViewers(tokenDocument)
    await SR5SharedVision.setList(tokenDocument, remove ? withoutViewer(current, entry.userId) : withViewer(current, entry))
  }

  //The gamemaster writes only what the sender is allowed to ask: the server tells who sent it
  static async _socketSetViewer(message, senderId) {
    const tokenDocument = await fromUuid(message.data.tokenUuid)
    const sender = game.users.get(senderId)
    const allowed = isViewerRequestAllowed({
      actor: tokenDocument?.actor,
      entry: message.data.entry,
      remove: !!message.data.remove,
      senderId,
      senderOwns: actor => !!sender && !!actor?.testUserPermission(sender, "OWNER"),
      getActor: id => SR5_EntityHelpers.getRealActorFromID(id),
    })
    if (!allowed) return SR5_SystemHelpers.srLog(1, `Shared vision request refused for user '${senderId}'`, message.data)
    await SR5SharedVision.setViewer(tokenDocument, message.data.entry, message.data.remove)
  }

  /** The owner shares what his drone or device sees: Invite Mark, a simple action (SR5 p. 241)
   * @param {Object} tokenDocument - the token seen through
   */
  static async openShareDialog(tokenDocument) {
    const actor = tokenDocument?.actor
    if (!actor) return
    const users = game.users.filter(u => !u.isGM)
    if (!users.length) return ui.notifications.info(game.i18n.localize("SR5.SharedVisionNoPlayer"))
    const escape = foundry.utils.escapeHTML
    const rows = users.map(u => `<label class="flexrow"><input type="checkbox" name="${u.id}" ${isSharedWith(tokenDocument, u.id) ? "checked" : ""}/> ${escape(u.name)}</label>`).join("")
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format("SR5.SharedVisionShareTitle", {
          name: tokenDocument.name
        })
      },
      content: `<p>${escape(game.i18n.localize("SR5.SharedVisionShareHint"))}</p><div class="sr5-shared-vision-users">${rows}</div>`,
      buttons: [
        {
          action: "ok",
          label: game.i18n.localize("SR5.SharedVisionShare"),
          default: true,
          callback: (event, button, dialog) => ({
            action: "ok", element: dialog.element
          }),
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          callback: () => ({
            action: "cancel"
          }),
        },
      ],
      rejectClose: false,
    })
    if (result?.action !== "ok") return

    const chosen = users.filter(u => result.element.querySelector(`input[name="${u.id}"]`)?.checked).map(u => u.id)
    const before = getSharedViewers(tokenDocument)
    const added = chosen.filter(id => !before.some(e => e.userId === id))
    //Inviting costs the owner a simple action (SR5 p. 241), counted in combat only (arbitrage de DjamZ, 2026-10-04)
    if (added.length && !game.user.isGM) {
      const owner = SR5SharedVision.getActingActor(actor)
      const action = [{
        type: "simple", value: 1, source: "inviteMark"
      }]
      if (!SR5Combat.hasActionsLeft(owner, action)) return
      if (owner && game.combat) SR5Combat.changeActionInCombat(owner.isToken ? owner.token.id : owner.id, action)
    }
    //A viewer from a Snoop stays: his mark is not the owner's to take back here (SR5 p. 240, Erase Mark)
    let list = before.filter(e => e.source === "snoop" || chosen.includes(e.userId))
    for (const id of added) list = withViewer(list, {
      userId: id, source: "share"
    })
    await SR5SharedVision.setList(tokenDocument, list)
  }

  /** Write the whole list of a token, by its owner or the gamemaster
   * @param {Object} tokenDocument - the token seen through
   * @param {Array} list - entries { userId, source, markOwnerId }
   */
  static async setList(tokenDocument, list) {
    const update = {
      [`flags.sr5.${SHARED_VISION_FLAG}`]: list
    }
    //A device carries no sight until someone looks through it
    if (list.length) update["sight.enabled"] = true
    await tokenDocument.update(update)
  }

  /** Snoop succeeded (SR5 p. 241): the players of the hacker see through the drone or device
   * as long as the hacker keeps a mark on it. Clicked by the hacker, or by the GM for him.
   * @param {Object} target - the snooped drone or device
   * @param {String} hackerId - id of the hacker's actor
   * @return {Boolean} true if someone now sees through it
   */
  static async startSnoop(target, hackerId) {
    if (!SHARED_VISION_ACTOR_TYPES.includes(target?.type)) return false
    const tokenDocument = target.isToken ? target.token : target.getActiveTokens?.(false, true)?.[0]
    if (!tokenDocument) {
      ui.notifications.warn(game.i18n.format("SR5.SharedVisionNoToken", {
        name: target.name
      }))
      return false
    }
    //No mark, no traffic to intercept (SR5 p. 241): the mark may have gone since the roll
    if (!hasMarkFrom(target, hackerId)) {
      ui.notifications.warn(game.i18n.format("SR5.SharedVisionNoMark", {
        name: target.name
      }))
      return false
    }
    const hacker = SR5_EntityHelpers.getRealActorFromID(hackerId)
    const userIds = game.user.isGM ?
      game.users.filter(u => !u.isGM && hacker?.testUserPermission(u, "OWNER")).map(u => u.id) :
      [game.user.id]
    if (!userIds.length) {
      ui.notifications.warn(game.i18n.format("SR5.SharedVisionNoPlayerFor", {
        name: hacker?.name ?? ""
      }))
      return false
    }
    for (const userId of userIds) await SR5SharedVision.setViewer(tokenDocument, {
      userId, source: "snoop", markOwnerId: hackerId
    })
    return true
  }

  //The one whose action it is: the rigger who controls the drone, or the user's own character
  static getActingActor(actor) {
    const ownerId = actor?.system?.vehicleOwner?.id
    if (ownerId) return SR5_EntityHelpers.getRealActorFromID(ownerId)
    return game.user.character ?? actor
  }

  //Who may share: the gamemaster, or the owner of the drone or device
  static canShare(tokenDocument) {
    return SHARED_VISION_ACTOR_TYPES.includes(tokenDocument?.actor?.type) && (game.user.isGM || tokenDocument.actor.isOwner)
  }

  //The tokens of the viewed scene the user sees through
  static tokensSeenBy(userId, scene = canvas?.scene) {
    return Array.from(scene?.tokens ?? []).filter(t => isSharedWith(t, userId))
  }

  /** The gamemaster takes out every viewer whose source of vision is gone: the mark of a Snoop erased,
   * the wireless switched off, the device bricked or destroyed. Only one gamemaster does it.
   */
  //actor: only its tokens are checked, when the change came from it. Only the active and the viewed
  //scenes are read: a token elsewhere is checked again when its scene is shown
  static async checkViewers(actor = null) {
    if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return
    const scenes = new Set([game.scenes?.active, canvas?.scene].filter(Boolean))
    for (const scene of scenes) {
      for (const tokenDocument of scene.tokens) {
        if (actor && tokenDocument.actor !== actor && tokenDocument.actorId !== actor.id) continue
        const viewers = getSharedViewers(tokenDocument)
        if (!viewers.length) continue
        const kept = viewers.filter(e => isViewerStillValid(e, tokenDocument.actor))
        if (kept.length !== viewers.length) await tokenDocument.update({
          [`flags.sr5.${SHARED_VISION_FLAG}`]: kept
        })
      }
    }
  }

  //Draw again what the user sees, and the list of what he sees through
  static refresh() {
    if (canvas?.ready) {
      //A flag is no sight change for the core: each token whose answer changed builds or drops its source,
      //as the core does itself when a token is controlled (Token#_onControl)
      for (const token of canvas.tokens.placeables) {
        if (!token.vision === token._isVisionSource()) token.initializeVisionSource()
      }
      canvas.perception.update({
        initializeVision: true, refreshLighting: true
      })
    }
    SR5SharedVision.renderIndicator()
  }

  //"You see through: ..." in the players panel, with a button to stop
  static renderIndicator() {
    const playersActive = document.getElementById("players-active")
    if (!playersActive) return
    let indicator = playersActive.querySelector("#sr5-shared-vision")
    const tokens = game.user.isGM ? [] : SR5SharedVision.tokensSeenBy(game.user.id)
    if (!tokens.length) return indicator?.remove()
    if (!indicator) {
      indicator = document.createElement("div")
      indicator.id = "sr5-shared-vision"
      const sceneIndicators = playersActive.querySelector("#sr5-scene-indicators") ?? playersActive.querySelector("#performance-stats")
      if (sceneIndicators) sceneIndicators.before(indicator)
      else playersActive.append(indicator)
    }
    const escape = foundry.utils.escapeHTML
    indicator.innerHTML = `<label>${escape(game.i18n.localize("SR5.SharedVisionSeeingThrough"))}</label>` + tokens.map(t => `
      <div class="sr5-shared-vision-row flexrow">
        <span class="value">${escape(t.name)}</span>
        <button type="button" data-token-uuid="${t.uuid}" data-tooltip="${escape(game.i18n.localize("SR5.SharedVisionStop"))}" aria-label="${escape(game.i18n.localize("SR5.SharedVisionStop"))}"><i class="fas fa-eye-slash"></i></button>
      </div>`).join("")
    for (const button of indicator.querySelectorAll("button[data-token-uuid]")) {
      button.addEventListener("click", async event => {
        event.preventDefault()
        const tokenDocument = await fromUuid(button.dataset.tokenUuid)
        await SR5SharedVision.setViewer(tokenDocument, {
          userId: game.user.id
        }, true)
      })
    }
  }

  //The eye on the token HUD of a drone or a device
  static addHudButton(hud) {
    const tokenDocument = hud.document
    if (!SR5SharedVision.canShare(tokenDocument)) return
    const column = hud.element?.querySelector(".col.left")
    if (!column || column.querySelector(".sr-hud-shared-vision")) return
    const button = document.createElement("button")
    button.type = "button"
    button.className = "control-icon sr-hud-shared-vision"
    if (getSharedViewers(tokenDocument).length) button.classList.add("active")
    button.dataset.tooltip = game.i18n.localize("SR5.SharedVisionShare")
    button.setAttribute("aria-label", button.dataset.tooltip)
    button.innerHTML = "<i class=\"fas fa-eye\"></i>"
    button.addEventListener("click", event => {
      event.preventDefault()
      event.stopPropagation()
      SR5SharedVision.openShareDialog(tokenDocument)
    })
    column.appendChild(button)
  }
}

//A rigger who jumps into a drone, or out of it, sees through other eyes (SR5 p. 266): draw the vision again
export function sr5HookUpdateActorSharedVision(actor, change) {
  if (actor?.type === "actorDrone" && (foundry.utils.hasProperty(change, "system.controlMode") || foundry.utils.hasProperty(change, "system.vehicleOwner"))) {
    SR5Token.clearJumpedInRiggers()
    SR5SharedVision.refresh()
  }
  if (SHARED_VISION_ACTOR_TYPES.includes(actor?.type)) SR5SharedVision.checkViewers(actor)
}

//An item of a drone or device changed (its marks, its wireless): check who sees through it
export function sr5HookUpdateItemSharedVision(item) {
  if (SHARED_VISION_ACTOR_TYPES.includes(item?.parent?.type)) SR5SharedVision.checkViewers(item.parent)
}

//An actor or a token appeared or went, a scene was drawn: who is jumped in is to be read again
export function sr5HookResetJumpedInRiggers() {
  SR5Token.clearJumpedInRiggers()
}

//A change of the list, on any client, draws the vision again; the gamemaster checks what was written
export function sr5HookUpdateTokenSharedVision(tokenDocument, change) {
  if (foundry.utils.hasProperty(change, `flags.sr5.${SHARED_VISION_FLAG}`) || foundry.utils.hasProperty(change, `flags.sr5.-=${SHARED_VISION_FLAG}`)) {
    SR5SharedVision.refresh()
    SR5SharedVision.checkViewers(tokenDocument.actor)
  }
}
