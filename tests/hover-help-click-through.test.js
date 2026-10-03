import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// The hover help (#sr5help) is a fixed overlay at the bottom left, shared by every actor and item
// sheet. Raised over the hovered label, it took the click meant for it ; and since its z-index
// lingers for 3.5 s after it fades out, it went on taking clicks while invisible.
// It only displays : clicks must go through it.
const less = readFileSync(new URL("../styles/components/sr5help.less", import.meta.url), "utf-8")

describe("hover help overlay", () => {
  it("never catches the pointer", () => {
    const rootBlock = less.slice(0, less.indexOf("&.active"))
    expect(rootBlock).toMatch(/pointer-events:\s*none;/)
  })
})
