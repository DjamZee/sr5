import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

const {
  sr5OpenManual, sr5HookRenderJournalDirectory
} = await import('../modules/hooks/journal.js')

// Point L11 of the manual (decision of DjamZ, 08/10): a "Manual" button opens the first page of the manual pack,
// read from the compendium without importing anything into the world
const render = vi.fn()
const entries = {
  b: {
    pages: [{
      id: 'p2', sort: 200000 
    }, {
      id: 'menu', sort: 100000 
    }],
    sheet: {
      render 
    },
  },
}
const pack = {
  getIndex: vi.fn(async () => [{
    _id: 'c', sort: 300000 
  }, {
    _id: 'b', sort: 100000 
  }]),
  getDocument: vi.fn(async id => entries[id]),
}

describe("Manual button (L11)", () => {
  beforeEach(() => {
    render.mockClear()
    globalThis.game = {
      packs: new Map([['sr5.manuel', pack]]),
      i18n: {
        localize: key => key 
      },
    }
    globalThis.ui = {
      notifications: {
        warn: vi.fn() 
      } 
    }
  })
  afterEach(() => {
    delete globalThis.game
    delete globalThis.ui
  })

  it("opens the first page of the first journal", async () => {
    await sr5OpenManual()
    expect(pack.getDocument).toHaveBeenCalledWith('b')
    expect(render).toHaveBeenCalledWith(true, {
      pageId: 'menu' 
    })
  })

  it("warns when the pack is missing", async () => {
    game.packs = new Map()
    await sr5OpenManual()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.ManualMissing')
  })

  it("adds the button once to the journal sidebar header, and none without the pack", () => {
    // Minimal DOM stand-in: the tests run without a browser environment
    globalThis.document = {
      createElement: () => ({
        classList: {
          add(c) {
            this.list.push(c)
          }, list: []
        }, addEventListener: vi.fn(),
      }),
    }
    const sidebar = () => {
      const children = []
      const header = {
        children,
        appendChild: c => children.push(c),
        querySelector: sel => children.find(c => c.classList.list.includes(sel.slice(1))) ?? null,
      }
      return {
        header, querySelector: () => header
      }
    }
    const html = sidebar()
    sr5HookRenderJournalDirectory(null, html)
    sr5HookRenderJournalDirectory(null, html)
    expect(html.header.children.length).toBe(1)
    game.packs = new Map()
    const bare = sidebar()
    sr5HookRenderJournalDirectory(null, bare)
    expect(bare.header.children.length).toBe(0)
    delete globalThis.document
  })
})
