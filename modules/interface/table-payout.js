// What a table hands over: the money, and the gear itself.
//
// A loot table says what was found and how much was on the bodies. Both are
// rolled with the draw and written into the card, so they are part of what
// happened rather than notes the game master acts on later — and both are
// handed over with one click, days afterwards if the session stopped there.
//
// Neither payment invents a way of owning things. Money is an `itemNuyen` of
// type `gain`, the same document a sale creates; gear is copied onto the
// character the way the sheet itself holds it.

/**
 * The item types that hold a count rather than coming one per line.
 *
 * The shop of PR #592 knows the same list, as `SR5Shop.STACKABLE_TYPES`. It
 * lives on a branch this one is not built on, so the knowledge is repeated
 * here rather than imported from a file that does not exist yet: once that
 * PR lands, the two should become one.
 */
const STACKABLE_TYPES = ["itemAmmunition", "itemDrug", "itemGear", "itemWeapon"]

/**
 * The documents to create so that a character ends up holding `quantity` of
 * `source`.
 *
 * Ten rounds of ammunition are one line holding ten; two swords are two
 * swords, because a sword carries its own condition and its own
 * modifications.
 *
 * @param {Item} source
 * @param {number} quantity
 * @returns {object[]}
 */
function itemPayload(source, quantity) {
  const itemData = source.toObject()
  delete itemData._id

  if (STACKABLE_TYPES.includes(itemData.type) && itemData.system.quantity !== undefined) {
    itemData.system.quantity = quantity
    return [itemData]
  }

  const payload = []
  for (let i = 0; i < quantity; i++) payload.push(foundry.utils.deepClone(itemData))
  return payload
}

/**
 * `Nom (x3)` when there is more than one.
 * @param {string} name
 * @param {number} quantity
 * @returns {string}
 */
function lineLabel(name, quantity) {
  return quantity > 1 ? `${name} (x${quantity})` : name
}

/**
 * One row of the card's footer: what is on offer, and the button that hands
 * it over.
 * @param {string} kind   "loot" or "nuyen", the row's own name
 * @param {string} label  what is on offer, already localized
 * @param {string} action the button's action name
 * @param {string} button the button's text, already localized
 * @param {string} icon   the button's Font Awesome class
 * @returns {string} HTML
 */
function row(kind, label, action, button, icon) {
  return `<div class="SR-TablePayoutRow" data-payout="${kind}">` +
    `<span class="SR-TablePayoutLabel">${label}</span>` +
    `<button type="button" data-action="${action}">` +
    `<i class="fas ${icon}"></i> ${button}</button></div>`
}

/**
 * The footer a card wears when the table handed something over.
 * @param {object} payout
 * @param {number|null} payout.nuyen       the money, or null when there is none
 * @param {Array} payout.loot              the gear, possibly empty
 * @returns {string} HTML, empty when the table handed over nothing
 */
export function sr5PayoutFooter({
  nuyen, loot
}) {
  const rows = []

  if (loot.length) {
    rows.push(row("loot", game.i18n.format("SR5.TableLootFound", {
      count: loot.reduce((sum, line) => sum + line.quantity, 0)
    }), "sr5GiveTableLoot", game.i18n.localize("SR5.TableLootGive"), "fa-hand-holding-box"))
  }

  if (nuyen !== null) {
    rows.push(row("nuyen", game.i18n.format("SR5.TableNuyenFound", {
      amount: nuyen.toLocaleString()
    }), "sr5PayTableNuyen", game.i18n.localize("SR5.TableNuyenPay"), "fa-hand-holding-dollar"))
  }

  if (!rows.length) return ""
  return `<footer class="SR-TablePayout">${rows.join("")}</footer>`
}

/**
 * The gear a draw can actually hand over.
 *
 * A text result is a line of prose, and a result that drew an actor or another
 * table is not a thing to be carried: only a result pointing at an Item can be
 * given. The manifest is stored on the card rather than recomputed, so a draw
 * stays payable once the dice are long forgotten.
 *
 * @param {TableResult[]} results
 * @returns {Array<{uuid: string, quantity: number}>}
 */
export function sr5LootManifest(results) {
  return results
    .filter(result => result.type === "document" &&
      foundry.utils.parseUuid(result.documentUuid ?? "")?.type === "Item")
    .map(result => ({
      uuid: result.documentUuid,
      quantity: result.sr5Quantity ?? 1
    }))
}

/**
 * Share an amount between several characters, to the nuyen.
 *
 * A split that does not come out even leaves the remainder with the first
 * share rather than losing it: three characters splitting 1000¥ get 334, 333
 * and 333.
 *
 * @param {number} amount
 * @param {number} count
 * @returns {number[]}
 */
export function sr5SplitNuyen(amount, count) {
  if (count <= 0) return []
  const share = Math.floor(amount / count)
  const shares = new Array(count).fill(share)
  shares[0] += amount - share * count
  return shares
}

/**
 * Replace one row of the footer in a card's stored content.
 *
 * A row holds no nested block of its own, so the lazy match stops at its own
 * closing tag — a greedy one would swallow the other row and the footer with
 * it. Each row is spent on its own: handing over the gear leaves the money
 * still to pay.
 *
 * @param {string} content
 * @param {string} kind
 * @param {string} label   what the spent row now says
 * @returns {string}
 */
export function sr5SpendPayoutRow(content, kind, label) {
  const pattern = new RegExp(
    `<div class="SR-TablePayoutRow" data-payout="${kind}">[\\s\\S]*?</div>`)
  return content.replace(pattern,
    `<div class="SR-TablePayoutRow" data-payout="${kind}">` +
    `<span class="SR-TablePayoutLabel">${label}</span></div>`)
}

/**
 * Spend a row in the message that keeps it.
 *
 * The update re-renders the card, for every reader: the row turns into the
 * line saying what was handed over, and its button goes with it.
 *
 * @param {ChatMessage} message
 * @param {string} kind
 * @param {string} label
 */
async function spendRow(message, kind, label) {
  await message.update({
    content: sr5SpendPayoutRow(message.content, kind, label)
  })
  ui.notifications.info(label)
}

/** Where on a card the mark of a row already handed over is kept. */
const SPENT_FLAG = "tablePayoutSpent"

/**
 * The rows this browser has started to hand over, as `messageId.kind`.
 *
 * The mark written on the message only arrives with the server's answer, and
 * a second click easily comes first. This set is what that click finds.
 */
const HANDING_OVER = new Set()

/**
 * Whether a row of a card has already been handed over, or is being.
 * @param {ChatMessage} message
 * @param {string} kind  "loot" or "nuyen"
 * @returns {boolean}
 */
export function sr5PayoutSpent(message, kind) {
  return HANDING_OVER.has(`${message.id}.${kind}`) ||
    Boolean(message.getFlag("sr5", `${SPENT_FLAG}.${kind}`))
}

/**
 * Claim a row of a card before anything is handed over.
 *
 * Only the first claim succeeds. The test and the claim are made with
 * nothing awaited between them, so two clicks in the same browser cannot
 * both pass; and the claim is written on the message before a single actor
 * is touched, so a reloaded page, or another game master, finds the row
 * already spent — never paid and still payable.
 *
 * @param {ChatMessage} message
 * @param {string} kind  "loot" or "nuyen"
 * @returns {Promise<boolean>}  true when this call may hand the row over
 */
export async function sr5ClaimPayout(message, kind) {
  if (sr5PayoutSpent(message, kind)) return false
  const key = `${message.id}.${kind}`
  HANDING_OVER.add(key)
  try {
    await message.update({
      [`flags.sr5.${SPENT_FLAG}.${kind}`]: game.user.id
    })
  } catch (error) {
    HANDING_OVER.delete(key)
    throw error
  }
  return true
}

/**
 * Pay a card's nuyen to some characters, in equal shares, and spend the row.
 * @param {ChatMessage} message
 * @param {Actor[]} actors
 */
export async function sr5HandOverNuyen(message, actors) {
  const amount = message.getFlag("sr5", "tableNuyen")
  if (!amount || !actors.length) return
  if (!await sr5ClaimPayout(message, "nuyen")) return

  const shares = sr5SplitNuyen(amount, actors.length)
  const date = new Date().toISOString().slice(0, 10)
  const from = message.getFlag("sr5", "tableName") ?? ""
  const name = game.i18n.format("SR5.TableNuyenEntry", {
    name: from
  })

  for (const [index, actor] of actors.entries()) {
    await actor.createEmbeddedDocuments("Item", [{
      name,
      type: "itemNuyen",
      img: "systems/sr5/assets/img/items/itemNuyen.svg",
      system: {
        amount: shares[index], type: "gain", date, description: name
      }
    }])
  }

  await spendRow(message, "nuyen", game.i18n.format("SR5.TableNuyenPaid", {
    amount: amount.toLocaleString(),
    names: actors.map(actor => actor.name).join(", ")
  }))
}

/**
 * Hand a card's gear to one character and spend the row.
 * @param {ChatMessage} message
 * @param {Actor} actor
 */
export async function sr5HandOverLoot(message, actor) {
  const manifest = message.getFlag("sr5", "tableLoot") ?? []
  if (!manifest.length || !actor) return

  const payload = []
  const names = []
  let missing = 0

  for (const line of manifest) {
    const item = await fromUuid(line.uuid)
    if (!item) {
      missing += 1
      continue
    }
    payload.push(...itemPayload(item, line.quantity))
    names.push(lineLabel(item.name, line.quantity))
  }

  // A compendium disabled since the draw leaves holes. Saying how many is
  // more use than handing over a shorter pile without a word.
  if (missing) {
    ui.notifications.warn(game.i18n.format("SR5.TableLootGone", {
      count: missing
    }))
  }
  if (!payload.length) return
  if (!await sr5ClaimPayout(message, "loot")) return

  await actor.createEmbeddedDocuments("Item", payload)
  await spendRow(message, "loot", game.i18n.format("SR5.TableLootGiven", {
    names: names.join(", "), actor: actor.name
  }))
}

/**
 * Have a row handed over by one browser only.
 *
 * Two game masters clicking the same card at the same moment are two
 * browsers, and a mark on the message cannot keep them apart: each reads it
 * before the other's has arrived. So the work is always done by the one
 * game master core designates, `game.users.activeGM`, where the claim above
 * is a plain test in a single browser. A game master who is not that one
 * asks it through the system's socket.
 *
 * @param {ChatMessage} message
 * @param {string} kind       "loot" or "nuyen"
 * @param {Actor[]} actors    who receives it
 */
async function handOver(message, kind, actors) {
  const designated = game.users.activeGM
  if (!designated || designated.isSelf) {
    return kind === "nuyen" ? sr5HandOverNuyen(message, actors) : sr5HandOverLoot(message, actors[0])
  }
  await game.socket.emit("system.sr5", {
    type: "tablePayout",
    userId: designated.id,
    data: {
      messageId: message.id, kind, actorUuids: actors.map(actor => actor.uuid)
    }
  })
}

/**
 * Hand over a row another game master asked for.
 * @param {object} socketMessage
 * @param {object} socketMessage.data
 */
export async function sr5SocketTablePayout({
  data
}) {
  if (!game.user.isGM) return
  const message = game.messages.get(data.messageId)
  if (!message) return
  const actors = []
  for (const uuid of data.actorUuids ?? []) {
    const actor = await fromUuid(uuid)
    if (actor) actors.push(actor)
  }
  if (data.kind === "nuyen") await sr5HandOverNuyen(message, actors)
  else if (data.kind === "loot") await sr5HandOverLoot(message, actors[0])
}

/**
 * The characters a money payment can go to: the selected tokens that hold a
 * purse and that the clicker may write on.
 *
 * Only `actorPc` carries `system.nuyen`; an `itemNuyen` dropped on anything
 * else is accepted and stays inert, so the others are left out rather than
 * paid into a void.
 *
 * @returns {Actor[]}
 */
function nuyenPayees() {
  return canvas.tokens?.controlled
    .map(token => token.actor)
    .filter(actor => actor?.type === "actorPc" && actor.isOwner) ?? []
}

/**
 * The "Verser" button: pay the selected characters.
 * @param {ChatMessage} message
 * @param {HTMLButtonElement} button
 */
function payNuyen(message, button) {
  const actors = nuyenPayees()
  if (!actors.length) {
    ui.notifications.warn(game.i18n.localize("SR5.TableNuyenNoTarget"))
    return
  }
  button.disabled = true
  return handOver(message, "nuyen", actors)
}

/**
 * The "Donner" button: hand the gear to the one selected character.
 *
 * Gear is not split: a single sword given to three characters would be three
 * swords. So exactly one recipient is asked for, and saying so is better than
 * quietly picking the first token of the selection.
 *
 * @param {ChatMessage} message
 * @param {HTMLButtonElement} button
 */
function giveLoot(message, button) {
  const actors = canvas.tokens?.controlled
    .map(token => token.actor)
    .filter(actor => actor?.isOwner) ?? []

  if (!actors.length) {
    ui.notifications.warn(game.i18n.localize("SR5.TableLootNoTarget"))
    return
  }
  if (actors.length > 1) {
    ui.notifications.warn(game.i18n.localize("SR5.TableLootOneTarget"))
    return
  }
  button.disabled = true
  return handOver(message, "loot", actors)
}

/**
 * Wire the payout buttons of a table draw.
 *
 * Registered as its own listener on `renderChatMessageHTML` rather than added
 * to the system's main one: the card carries its own flags and its own
 * buttons, and the general chat card handling expects a full `sr5data` and a
 * selected token before it will look at anything.
 *
 * A button is disabled as soon as it is clicked, before anything is awaited,
 * and comes back disabled on a card whose row is already claimed.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function sr5HookRenderTablePayout(message, html) {
  const footer = html.querySelector(".SR-TablePayout")
  if (!footer) return

  // Handing out loot is the game master's to do, and spending a row means
  // writing on the message, which only they may do. A player still reads what
  // was found; the buttons simply are not there.
  if (!game.user.isGM) {
    for (const button of footer.querySelectorAll("button")) button.remove()
    return
  }

  const wire = (kind, action, onClick) => {
    const button = footer.querySelector(`[data-action="${action}"]`)
    if (!button) return
    if (sr5PayoutSpent(message, kind)) {
      button.disabled = true
      return
    }
    button.addEventListener("click", () => {
      if (button.disabled) return
      onClick(message, button)
    })
  }
  wire("nuyen", "sr5PayTableNuyen", payNuyen)
  wire("loot", "sr5GiveTableLoot", giveLoot)
}
