import {
  describe, it, expect
} from "vitest"

const {
  queuedCheck, escape
} = await import("../modules/system/card-helpers.js")

describe("the shared queued check of the world clock", () => {
  it("runs once more, not twice more, when called during a run", async () => {
    let runs = 0
    let release
    const check = queuedCheck(async () => {
      runs++
      if (runs === 1) await new Promise(r => (release = r))
    }, "Test not checked")
    const first = check()
    const second = check()
    check()
    expect(second).toBe(first)
    release()
    await first
    expect(runs).toBe(2)
  })

  it("goes on after a check that throws", async () => {
    let runs = 0
    const check = queuedCheck(async () => {
      runs++
      throw new Error("boom")
    }, "Test not checked")
    await check()
    await check()
    expect(runs).toBe(2)
  })

  it("escapes with the core, and shows an empty text for nothing", () => {
    const saved = foundry.utils.escapeHTML
    foundry.utils.escapeHTML = s => s.replace(/</g, "&lt;")
    try {
      expect(escape("<b>")).toBe("&lt;b>")
      expect(escape(null)).toBe("")
    } finally {
      foundry.utils.escapeHTML = saved
    }
  })
})
