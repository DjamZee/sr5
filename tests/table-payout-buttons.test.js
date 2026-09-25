import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// The "Donner" and "Verser" buttons of a table card were left to Foundry's
// button variables, which the SR5 theme sets for its dark windows: turquoise
// at 75 % on a half-transparent red, over the white card — about 1.1:1.
// They must say their own colours, those of the other chat card buttons.

const less = readFileSync(new URL("../styles/roll-message.less", import.meta.url), "utf-8")

/**
 * The body of the `button` block nested in `.SR-TablePayout`.
 * @returns {string}
 */
function payoutButtonBlock() {
  const footer = less.slice(less.indexOf(".SR-TablePayout {"))
  const start = footer.indexOf(".chat-message & button {")
  if (start < 0) return ""
  let depth = 0
  for (let i = start; i < footer.length; i++) {
    if (footer[i] === "{") depth++
    if (footer[i] === "}" && --depth === 0) return footer.slice(start, i)
  }
  return ""
}

describe("table card payout buttons", () => {
  it("are light text on the dark ground of the other card buttons", () => {
    const block = payoutButtonBlock()
    expect(block).toMatch(/background-color\s*:\s*var\(--sr-text-color-dark\)/)
    expect(block).toMatch(/\bcolor\s*:\s*var\(--sr-text-color-light\)/)
  })
})
