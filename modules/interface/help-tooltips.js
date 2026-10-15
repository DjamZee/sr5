/**
 * Tooltips into the help bubble (relecture djamz.13, DjamZ: "les infobulles dans la bulle d'aide si elle n'est pas
 * déjà prise", rule proposed by Capucine#5826 and validated by Élise on 15/10).
 *
 * When the help bubble is on (client setting sr5Help.active, read at load: changing it reloads), an element of a
 * sheet that carries a tooltip (data-tooltip, or a plain title) but no help of its own shows that text in the bubble,
 * and its floating tooltip is held back: one explanation, in one place. An element that already fills the bubble
 * (data-helpTitle), or sits inside one that does, keeps its tooltip, as before. With the bubble off, nothing changes.
 *
 * The text is shown as text, never as HTML: a tooltip may carry a name the user typed.
 */

const MAX_TITLE = 40

/**
 * Move the tooltip of one element into the help bubble's data. Pure on purpose: it only reads and writes the
 * element's attributes, so it is tested without Foundry.
 * @param {Element} el
 * @param {(text: string) => string} localize  turns a localization key into its text (data-tooltip may hold a key)
 * @returns {boolean} true when the element now feeds the bubble
 */
export function helpFromTooltip(el, localize = text => text) {
  if (!el?.getAttribute || el.hasAttribute("data-helpTitle")) return false
  //Inside an element that fills the bubble, the bubble is taken: the mouse over the child reaches the parent's help
  //last, which would hide the child's text. The tooltip stays.
  if (el.parentElement?.closest?.("[data-helpTitle]")) return false
  const raw = el.getAttribute("data-tooltip") ?? el.getAttribute("title")
  const message = typeof raw === "string" ? localize(raw).trim() : ""
  if (!message) return false
  const label = (el.textContent ?? "").replace(/\s+/g, " ").trim()
  el.setAttribute("data-helpTitle", label && label.length <= MAX_TITLE && label !== message ? label : "")
  el.setAttribute("data-helpMessage", message)
  el.setAttribute("data-helpPlain", "true")
  el.removeAttribute("data-tooltip")
  el.removeAttribute("title")
  return true
}

/**
 * Apply helpFromTooltip to every tooltip of a rendered sheet, when the help bubble is on.
 * @param {Element} root
 * @param {boolean} helpActive
 * @param {(text: string) => string} [localize]
 * @returns {number} how many tooltips moved
 */
export function tooltipsToHelp(root, helpActive, localize) {
  if (!helpActive || !root?.querySelectorAll) return 0
  let moved = 0
  for (const el of root.querySelectorAll("[data-tooltip], [title]")) {
    if (helpFromTooltip(el, localize)) moved++
  }
  return moved
}

/**
 * Fill the bubble's title and message from an element. A tooltip moved here is written as text; the help the
 * templates write themselves keeps its markup, as before.
 * @param {Element} el
 * @param {Element|null} titleNode
 * @param {Element|null} messageNode
 */
export function fillHelpBubble(el, titleNode, messageNode) {
  const plain = el.dataset.helpplain === "true"
  if (titleNode) {
    if (plain) titleNode.textContent = el.dataset.helptitle || ""
    else titleNode.innerHTML = el.dataset.helptitle || ""
  }
  if (!messageNode || !el.dataset.helpmessage) return
  if (!plain) {
    messageNode.innerHTML = "<div class='helpMessage'><em>" + el.dataset.helpmessage + "</em></div>"
    return
  }
  const box = document.createElement("div")
  box.className = "helpMessage"
  const em = document.createElement("em")
  em.textContent = el.dataset.helpmessage
  box.appendChild(em)
  messageNode.replaceChildren(box)
}
