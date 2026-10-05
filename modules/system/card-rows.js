// The GM cards of the calendar (expired effects, deadlines) keep what was done in their own content: a row
// whose action ran loses its button for good, and the button does not come back when the chat is rendered again

// The content with the action buttons of one row taken out and a "done" mark put in their place. The row is
// found by its data attributes, which are unique on a card
// orphanSelector: a card-wide button ("Remove all") taken out too once no row button is left
export function contentWithRowDone(content, rowAttributes, buttonSelector, doneLabel, orphanSelector){
  const doc = new DOMParser().parseFromString(`<div>${content}</div>`, "text/html")
  const root = doc.body.firstElementChild
  const selector = Object.entries(rowAttributes).map(([k, v]) => `[data-${k}="${CSS.escape(String(v))}"]`).join("")
  const row = root.querySelector(selector)
  if (!row) return null
  row.querySelectorAll(buttonSelector).forEach(b => b.remove())
  if (orphanSelector && !root.querySelector(buttonSelector)) root.querySelectorAll(orphanSelector).forEach(b => b.remove())
  if (!row.querySelector(".sr5-row-done")){
    const done = doc.createElement("span")
    done.className = "sr5-row-done"
    done.textContent = doneLabel
    row.append(done)
  }
  return root.innerHTML
}

export async function markRowDoneInMessage(rowElement, buttonSelector, doneLabel, orphanSelector){
  const messageId = rowElement?.closest("[data-message-id]")?.dataset.messageId
  const message = game.messages.get(messageId)
  if (!message) return
  const attributes = {
  }
  for (const [k, v] of Object.entries(rowElement.dataset)) attributes[k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)] = v
  const content = contentWithRowDone(message.content, attributes, buttonSelector, doneLabel, orphanSelector)
  if (content) await message.update({
    content
  })
}

// A card is believed only from a GM: a player could post one with the same flag and the same buttons
export function cardFromGM(message){
  return !!message?.author?.isGM
}
