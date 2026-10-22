import {
  describe, it, expect
} from "vitest"

import {
  isSystemCard, sr5HookChatMessage
} from "../modules/hooks/render-chat-message.js"

// Arbitrage de DjamZ (relecture djamz.13): no card of the system or of a module shows the line of its recipients; a
// whisper typed in the chat (/w) keeps it. The GM's notices without flags (convergence, manual 5.2.4) are cards too.

describe("a card of the system, whose recipients are not shown", () => {
  it("a message with flags of its own", () => {
    expect(isSystemCard({
      flags: {
        sr5: {
          tableName: "x"
        }
      }, content: "texte"
    })).toBe(true)
  })

  it("the GM's notice of a convergence: bare paragraphs, no flags", () => {
    expect(isSystemCard({
      flags: {
      }, content: "<p>Convergence sur Decker : dommages matriciels VD 12.</p><p>Le demi-DIEU indique sa position.</p>"
    })).toBe(true)
  })

  it("a card built of blocks", () => {
    expect(isSystemCard({
      content: "<div class=\"sr5-ritual-circle\"><button>Participer</button></div>"
    })).toBe(true)
  })
})

describe("a whisper typed in the chat, which keeps them", () => {
  it("plain text, with only Foundry's own flags", () => {
    expect(isSystemCard({
      flags: {
        core: {
          canPopout: true
        }
      }, content: "Rendez-vous au parking dans dix minutes."
    })).toBe(false)
  })

  it("inline markup is not a card", () => {
    expect(isSystemCard({
      content: "Regarde <strong>ça</strong>, et <em>vite</em>"
    })).toBe(false)
  })
})

describe("a line typed in the chat box, marked when it is sent (relecture du 22/10)", () => {
  it("the chat box marks what is typed, and keeps the flags already there", () => {
    const chatData = {
      speaker: {
      }, flags: {
        other: {
          x: 1
        }
      }
    }
    sr5HookChatMessage(null, "/w Bob salut", chatData)
    expect(chatData.flags.sr5.typed).toBe(true)
    expect(chatData.flags.other.x).toBe(1)
  })

  it("a typed whisper turned into paragraphs by a module of the chat box keeps its recipients", () => {
    expect(isSystemCard({
      flags: {
        sr5: {
          typed: true
        }
      }, content: "<p>Rendez-vous au parking.</p>"
    })).toBe(false)
  })

  it("the GM's notices in bare paragraphs are not typed: still cards", () => {
    expect(isSystemCard({
      content: "<p>Tacnet : Bob refuse.</p>"
    })).toBe(true)
  })
})
