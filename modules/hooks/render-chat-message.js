import {
  SR5_RollMessage
} from "../rolls/roll-message.js"
import {
  SR5ShopAvailability
} from "../interface/shop-availability.js"
import {
  SR5ShopFence
} from "../interface/shop-fence.js"
import {
  sr5DressTableDraw
} from "../interface/table-draw.js"
import {
  SR5_RitualCircle
} from "../rolls/roll-helpers/ritualCircle.js"
import {
  activateExpiryCardListeners
} from "../system/effect-expiry.js"
import {
  activateDeadlineCardListeners
} from "../system/deadlines.js"
import {
  addExtendedClockButton
} from "../system/extended-clock.js"

export function sr5HookRenderChatMessageHTML(message, html, _data) {
  // A table draw is rendered by core and wears no SR5 header of its own
  sr5DressTableDraw(html)

  // Apply SR5 custom styling for messages with SR5 roll data
  if (message.flags?.sr5data) {
    html.classList.add("SRCustomMessage")
    const borderColor = message.flags?.sr5data?.owner?.borderColor
    if (borderColor && typeof borderColor === "string") html.style.borderColor = borderColor

    // Inject actor thumbnail into Foundry's default message header
    const msgHeader = html.querySelector(":scope > header")
    if (msgHeader) {
      const imgSrc = message.flags?.sr5data?.owner?.speakerImg || "systems/sr5/assets/img/ui/SR6_Logo.svg"
      const img = document.createElement("img")
      img.classList.add("SRAuthorIcon")
      img.src = imgSrc
      img.title = message.speaker?.alias || ""
      msgHeader.prepend(img)
    }
  }

  // Attach SR5 chat card listeners for messages with roll card content
  const hasSr5Card = html.querySelector(".SR-CardHeader")
  if (hasSr5Card) SR5_RollMessage.chatListeners(html, message)

  // Availability cards carry their own data and their own button
  if (message.flags?.sr5shop) SR5ShopAvailability.chatListeners(html, message)
  if (message.flags?.sr5fence) SR5ShopFence.chatListeners(html, message)
  // A vendor's buy-back offer (shop lot C, part 2): loaded on demand, the vendor brings the socket
  if (message.flags?.sr5vendorOffer) import("../interface/shop-vendor.js").then(({
    SR5ShopVendor
  }) => SR5ShopVendor.chatListeners(html, message))
  // Ritual circle card: join and seal (SR5 p. 298-299)
  if (message.flags?.sr5?.ritualCircle) SR5_RitualCircle.activateListeners(html, message)
  // Effects run out on the world clock: the GM removes them
  if (message.flags?.sr5?.effectExpiry) activateExpiryCardListeners(html, message)
  // Withdrawal tests and rent fall due: the GM acts
  if (message.flags?.sr5?.deadlines) activateDeadlineCardListeners(html, message)
  // Extended tests and healing (SR5 p. 50, 207-208): the GM moves the clock on by the time spent
  if (message.flags?.sr5data?.test?.extended?.intervalValue) addExtendedClockButton(message, html)
}

// v13: keep chat scrolled to bottom when SR5 roll messages change height.
// Track whether the user is at the bottom; when chat content resizes
// (message updates, card expand/collapse), snap back to bottom instantly.
// This doesn't interfere with smooth "Jump to Bottom" animations because
// wasAtBottom is false while the user is scrolled up.
export function sr5HookRenderChatLog(app) {
  const scroll = app.element.querySelector(".chat-scroll")
  if (!scroll) return
  const log = scroll.querySelector(".chat-log")
  if (!log) return
  let wasAtBottom = true
  scroll.addEventListener("scroll", () => {
    wasAtBottom = (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight) < 5
  })
  new ResizeObserver(() => {
    if (wasAtBottom) {
      scroll.scrollTo({
        top: scroll.scrollHeight, behavior: "instant"
      })
    }
  }).observe(log)
}
