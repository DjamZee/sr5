// The two buttons under a table draw: "Relancer" draws the same table again,
// "Partager" shows a private or blind draw to everyone.
//
// They are added each time the card is rendered and never written into it:
// what they offer depends on who is reading (a player sees them on her own
// draws only), and a button stored in the content would be offered to all.
// Neither hands anything over, so there is nothing for the game master to
// review: a draw made again is a new card, reviewed like any other.

/**
 * The roll mode a card was drawn in, read back from whom it is shown to.
 *
 * A game master alone at the table whispers a "GM roll" to himself, which
 * reads back as a self roll: both are seen by him alone, so the new draw is
 * seen by the same people.
 *
 * @param {ChatMessage} message
 * @returns {string} a key of CONST.DICE_ROLL_MODES
 */
export function sr5RollModeOf(message) {
  if (message.blind) return "blindroll"
  const whisper = message.whisper ?? []
  if (!whisper.length) return "publicroll"
  if (whisper.length === 1 && whisper[0] === message.author?.id) return "selfroll"
  return "gmroll"
}

/**
 * Whether the user may make a private or blind card public: the very test of
 * core's "Reveal to everyone" in the chat's context menu, so the button never
 * offers more than the menu already does. A player cannot reveal a blind draw
 * she has not seen herself.
 *
 * @param {ChatMessage} message
 * @param {User} user
 * @returns {boolean}
 */
export function sr5CanShareDraw(message, user = game.user) {
  const limited = (message.whisper?.length ?? 0) > 0 || message.blind
  return Boolean(limited && (user.isGM || message.author?.id === user.id) && message.isContentVisible)
}

/**
 * Where the card's table can be found again: its uuid, written by
 * SR5RollTable#toMessage, or, on a card drawn before that, core's own flag,
 * which holds the id of a world table.
 *
 * @param {ChatMessage} message
 * @returns {string|null}
 */
export function sr5DrawTableUuid(message) {
  const uuid = message.getFlag("sr5", "tableUuid")
  if (uuid) return uuid
  const id = message.getFlag("core", "RollTable")
  return id && game.tables?.get(id) ? `RollTable.${id}` : null
}

/**
 * Whether the user is offered "Relancer". A game master may draw any table
 * again; a player only her own draws, never one the game master made (his
 * tables are his, and a card of his says nothing of whether she may roll it).
 *
 * @param {ChatMessage} message
 * @param {User} user
 * @returns {boolean}
 */
export function sr5CanRerollDraw(message, user = game.user) {
  if (!rerollSource(message)) return false
  return user.isGM || (message.author?.id === user.id && !message.author?.isGM)
}

/**
 * What "Relancer" draws from, or null when the card cannot be drawn again.
 * @param {ChatMessage} message
 * @returns {{uuid: string}|null}
 */
function rerollSource(message) {
  const uuid = sr5DrawTableUuid(message)
  return uuid ? {
    uuid
  } : null
}

/**
 * Whether a player may draw this table at all: a world table she can see, or
 * a table in a compendium shown to players.
 * @param {RollTable} table
 * @returns {boolean}
 */
function mayDraw(table) {
  if (game.user.isGM) return true
  if (table.pack) return Boolean(game.packs.get(table.pack)?.visible)
  return table.testUserPermission(game.user, "OBSERVER")
}

/**
 * Draw the card's table again, in the mode it was first drawn in: the table's
 * own formula and number of draws, read anew, so it is the same draw and not
 * a copy of its result.
 * @param {ChatMessage} message
 */
async function reroll(message) {
  const source = rerollSource(message)
  const table = source ? await fromUuid(source.uuid).catch(() => null) : null
  if (!table) {
    ui.notifications.warn(game.i18n.localize("SR5.TableRerollGone"))
    return
  }
  if (!mayDraw(table)) {
    ui.notifications.warn(game.i18n.localize("SR5.TableRerollDenied"))
    return
  }
  await table.draw({
    rollMode: sr5RollModeOf(message)
  })
}

/**
 * Show a private or blind card to everyone, as core's context menu does.
 * @param {ChatMessage} message
 */
async function share(message) {
  if (!sr5CanShareDraw(message)) return
  await message.update({
    whisper: [], blind: false
  })
}

/**
 * One button of the row.
 * @param {string} action
 * @param {string} icon   Font Awesome class
 * @param {string} label  i18n key
 * @param {Function} onClick
 * @returns {HTMLButtonElement}
 */
function button(action, icon, label, onClick) {
  const element = document.createElement("button")
  element.type = "button"
  element.dataset.action = action
  element.innerHTML = `<i class="fas ${icon}"></i> ${game.i18n.localize(label)}`
  element.addEventListener("click", async () => {
    if (element.disabled) return
    element.disabled = true
    try {
      await onClick()
    } finally {
      element.disabled = false
    }
  })
  return element
}

/**
 * Add "Relancer" and "Partager" under a table draw, for whoever may use them.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function sr5HookRenderTableActions(message, html) {
  const draw = html.querySelector(".table-draw")
  if (!draw || draw.querySelector(".SR-TableActions")) return

  const buttons = []
  if (sr5CanRerollDraw(message)) {
    buttons.push(button("sr5TableReroll", "fa-dice", "SR5.TableReroll", () => reroll(message)))
  }
  if (sr5CanShareDraw(message)) {
    buttons.push(button("sr5TableShare", "fa-eye", "SR5.TableShare", () => share(message)))
  }
  if (!buttons.length) return

  const row = document.createElement("div")
  row.className = "SR-TableActions"
  row.append(...buttons)
  draw.append(row)
}
