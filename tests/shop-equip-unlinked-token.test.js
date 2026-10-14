import {
  describe, it, expect, afterEach, vi
} from "vitest"
import {
  SR5Shop
} from "../modules/interface/shop.js"
import {
  SR5ShopStock
} from "../modules/interface/shop-stock.js"

// Equip mode: the gamemaster pointed at an unlinked token, and the object went to the base actor (on no token
// already placed). The unlinked tokens of the scene are now buyers of their own, named by the token's uuid.
describe("SR5Shop, Equip mode on an unlinked token", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const base = {
    id: "a1", name: "Ganger", isToken: false
  }
  const tokenActor = {
    id: "a1", name: "Ganger", isToken: true, token: {
      uuid: "Scene.s1.Token.t1", name: "Ganger 2"
    }
  }

  it("lists the scene's unlinked tokens for the gamemaster in Equip mode only", () => {
    vi.spyOn(SR5ShopStock, "buyers").mockImplementation(() => [base])
    vi.stubGlobal("game", {
      user: {
        isGM: true
      }, actors: [base], settings: {
        get: () => null
      }
    })
    vi.stubGlobal("canvas", {
      scene: {
        tokens: [{
          actorLink: false, actor: tokenActor
        }, {
          actorLink: true, actor: base
        }]
      }
    })
    expect(SR5Shop.getBuyers({
      equip: true, tokens: true
    })).toEqual([base, tokenActor])
    expect(SR5Shop.getBuyers({
      equip: false, tokens: true
    })).toEqual([base])
  })

  it("tells the token apart from its base actor", () => {
    expect(SR5Shop.buyerKey(base)).toBe("a1")
    expect(SR5Shop.buyerKey(tokenActor)).toBe("Scene.s1.Token.t1")
    vi.stubGlobal("fromUuidSync", uuid => uuid === "Scene.s1.Token.t1" ? {
      actor: tokenActor
    } : null)
    vi.stubGlobal("game", {
      actors: new Map([["a1", base]])
    })
    expect(SR5Shop.buyerFromKey("Scene.s1.Token.t1")).toBe(tokenActor)
    expect(SR5Shop.buyerFromKey("a1")).toBe(base)
  })

  it("keeps the base actor as default buyer when the token is not listed", () => {
    vi.stubGlobal("game", {
      user: {
        character: null
      }
    })
    vi.stubGlobal("canvas", {
      tokens: {
        controlled: [{
          actor: tokenActor
        }]
      }
    })
    expect(SR5Shop.defaultBuyerId([base, {
      id: "a2"
    }])).toBe("a1")
    expect(SR5Shop.defaultBuyerId([base, tokenActor])).toBe("Scene.s1.Token.t1")
  })
})
