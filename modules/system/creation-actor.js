// A character "in creation" (créateur de personnage, lot C0; DjamZ's ruling Q2, 2026-10-08): a flag on one actor,
// `flags.sr5.creation = {active, by}`, set by the gamemaster alone. For that actor the shop applies the creation caps
// (SR5 p. 66, p. 420) but charges every purchase, so the creation nuyen count themselves; no Essence hole opens; the
// Prototype de transhumain gives its bioware (Chrome Flesh p. 57). The world setting `sr5ShopCreationMode` keeps its
// meaning: every actor, free of charge.
import {
  stripGMOnlyChanges
} from "../entities/items/spirit-bonds.js"

export const CREATION_FLAG = "creation"
// What a player's update may not change, whatever its form (flat, nested, "==" replacement, "-=" deletion)
export const CREATION_FLAG_PATHS = [`flags.sr5.${CREATION_FLAG}.active`, `flags.sr5.${CREATION_FLAG}.by`]

// An item bought past the creation limits where the table allows it (sr5ShopCreationOverLimit, Adrore's feedback C3):
// {reason: "availability"|"rating", value, limit}, read by the creation summary of the Concepteur
export const CREATION_OVER_LIMIT_FLAG = "creationOverLimit"

/** The items of an actor bought past the creation limits: [{id, name, reason, value, limit}]. */
export function creationOverLimitItems(actor) {
  return Array.from(actor?.items ?? []).flatMap(item => {
    const mark = item.flags?.sr5?.[CREATION_OVER_LIMIT_FLAG]
    return mark?.reason ? [{
      id: item.id, name: item.name, reason: mark.reason, value: mark.value, limit: mark.limit
    }] : []
  })
}

/** The world's creation mode: every actor, gear handed over without being charged. */
export function worldCreationMode() {
  return game.settings.get("sr5", "sr5ShopCreationMode") === true
}

/** Is this actor flagged "in creation" by the gamemaster? An unlinked token reads its own actor, delta included. */
export function actorInCreation(actor) {
  return actor?.flags?.sr5?.[CREATION_FLAG]?.active === true
}

/** Creation rules for this actor: the world's mode, or its own flag. Whether it pays is `worldCreationMode`. */
export function creationModeFor(actor) {
  return worldCreationMode() || actorInCreation(actor)
}

/**
 * preUpdateActor / preUpdateActorDelta, on a player's browser: the creation flag is the gamemaster's. Returns the
 * paths a player's update would change; the caller refuses the update whole.
 */
export function refusedCreationChanges(document, changes, options = {
}) {
  return stripGMOnlyChanges(changes, document, CREATION_FLAG_PATHS, options)
}

/** preCreateActor, on a player's browser: an actor a player creates or imports never arrives in creation. */
export function stripCreationOnCreate(document, data, _options, userId) {
  if (game.users.get(userId)?.isGM) return
  if (data?.flags?.sr5?.[CREATION_FLAG] === undefined) return
  document.updateSource({
    [`flags.sr5.-=${CREATION_FLAG}`]: null
  })
}

/** The gamemaster's gesture: in creation, or creation over. */
export async function setActorCreation(actor, active) {
  if (!game.user.isGM || !actor) return
  if (active) await actor.setFlag("sr5", CREATION_FLAG, {
    active: true, by: game.user.id
  })
  else await actor.unsetFlag("sr5", CREATION_FLAG)
}

/** `getHeaderControlsDocumentSheetV2`: the gamemaster's switch, in the header menu of a character's sheet. */
export function onCreationHeaderControls(app, controls) {
  if (!game.user.isGM) return
  const actor = app.document
  if (actor?.documentName !== "Actor" || actor.type !== "actorPc") return
  const look = (active) => ({
    icon: active ? "fas fa-user-check" : "fas fa-user-pen",
    label: active ? "SR5.CreationActorEnd" : "SR5.CreationActorStart",
  })
  controls.push({
    ...look(actorInCreation(actor)),
    action: "sr5-creation",
    onClick: async (event) => {
      // Read at click time: the header menu is built once, with the window
      const active = actorInCreation(actor)
      const button = event?.currentTarget ?? app.element?.querySelector('[data-action="sr5-creation"] button')
      if (actor.pack && game.packs.get(actor.pack)?.locked) {
        ui.notifications.warn(game.i18n.localize("SR5.WARN_ShopFlagLocked"))
        return
      }
      await setActorCreation(actor, !active)
      // A render does not rebuild the header menu, so the entry is relabelled in place
      const now = look(!active)
      button?.querySelector(".control-icon")?.setAttribute("class", `control-icon fa-fw ${now.icon}`)
      const label = button?.querySelector(".control-label")
      if (label) label.innerText = game.i18n.localize(now.label)
      ui.notifications.info(game.i18n.format(active ? "SR5.CreationActorEnded" : "SR5.CreationActorStarted", {
        name: actor.name
      }))
      // An open shop redraws with the buyer's caps
      game.sr5?.shop?.onFlagChanged?.(actor)
    },
  })
}
