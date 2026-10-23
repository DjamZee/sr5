import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

const {
  sr5OpenManual, sr5HookRenderJournalDirectory, otherLanguageManualPack
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

  // English edition (Aurore, 22/10): Foundry's language picks the pack, the French one stays the fallback
  describe("edition by Foundry's language", () => {
    const english = {
      getIndex: vi.fn(async () => [{
        _id: 'e', sort: 100000
      }]),
      getDocument: vi.fn(async () => ({
        pages: [{
          id: 'en-menu', sort: 100000
        }], sheet: {
          render
        }
      })),
    }
    const empty = {
      getIndex: vi.fn(async () => []), getDocument: vi.fn()
    }

    it("opens the English manual in English, and in any language other than French", async () => {
      game.packs = new Map([['sr5.manuel', pack], ['sr5.manual', english]])
      for (const lang of ['en', 'de']) {
        render.mockClear()
        game.i18n.lang = lang
        await sr5OpenManual()
        expect(render).toHaveBeenCalledWith(true, {
          pageId: 'en-menu'
        })
      }
    })

    it("opens the French manual in French", async () => {
      game.packs = new Map([['sr5.manuel', pack], ['sr5.manual', english]])
      game.i18n.lang = 'fr'
      await sr5OpenManual()
      expect(render).toHaveBeenCalledWith(true, {
        pageId: 'menu'
      })
    })

    it("falls back to the French manual when the English pack is missing or empty", async () => {
      game.i18n.lang = 'en'
      for (const packs of [[['sr5.manuel', pack]], [['sr5.manuel', pack], ['sr5.manual', empty]]]) {
        render.mockClear()
        game.packs = new Map(packs)
        await sr5OpenManual()
        expect(render).toHaveBeenCalledWith(true, {
          pageId: 'menu'
        })
      }
    })

    it("warns once, permanently, when every pack is empty", async () => {
      game.i18n.lang = 'en'
      game.packs = new Map([['sr5.manuel', empty], ['sr5.manual', empty]])
      await sr5OpenManual()
      expect(ui.notifications.warn).toHaveBeenCalledTimes(1)
      expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.ManualEmpty', {
        permanent: true
      })
    })
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

// The two manuals stood side by side in the compendiums (Lorène#8261, 23/10): the other language's is hidden, only
// once the table's own has pages
describe('otherLanguageManualPack', () => {
  const packs = sizes => new Map(Object.entries(sizes).map(([id, size]) => [id, {
    index: {
      size
    }
  }]))
  it("hides the English manual from a French table, and the French one from any other", () => {
    expect(otherLanguageManualPack('fr', packs({
      'sr5.manuel': 3, 'sr5.manual': 3
    }))).toBe('sr5.manual')
    expect(otherLanguageManualPack('en', packs({
      'sr5.manuel': 3, 'sr5.manual': 3
    }))).toBe('sr5.manuel')
    expect(otherLanguageManualPack('de', packs({
      'sr5.manuel': 3, 'sr5.manual': 3
    }))).toBe('sr5.manuel')
  })
  it("hides nothing while the table's own manual is empty or missing", () => {
    expect(otherLanguageManualPack('en', packs({
      'sr5.manuel': 3, 'sr5.manual': 0
    }))).toBe(null)
    expect(otherLanguageManualPack('fr', packs({
      'sr5.manual': 3
    }))).toBe(null)
  })
})
