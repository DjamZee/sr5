import {
  describe, it, expect, afterEach
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// An area spell's defense measures from its template on the scene of the cast, not on the scene the
// defender happens to look at; with no template there, the distance is unknown (null) and the GM rules.
// Grid of 100 px per 1.5 m: a straight square is 1.5 m.
function scene(id, {
  templates = [], tokens = [] 
} = {
}) {
  return {
    id, templates, tokens,
    grid: {
      size: 100, units: "m",
      measurePath: ([a, b]) => ({
        distance: Math.hypot(b.x - a.x, b.y - a.y) / 100 * 1.5
      })
    },
  }
}

const card = {
  owner: {
    actorId: "mage", itemId: "fireball", messageId: "msg"
  }
}
const defender = {
  id: "def", token: null
}

const avant = {
  game: globalThis.game, canvas: globalThis.canvas
}
afterEach(() => {
  globalThis.game = avant.game
  globalThis.canvas = avant.canvas
})

function monde(scenes, canvasScene) {
  globalThis.game = {
    scenes: Object.assign([...scenes], {
      get: id => scenes.find(s => s.id === id)
    }),
    messages: {
      get: () => undefined
    },
  }
  globalThis.canvas = {
    scene: canvasScene
  }
}

describe("spellAreaDistance", () => {
  const cercle = {
    x: 1050, y: 1050, flags: {
      sr5: {
        item: "fireball"
      }
    }
  }
  const lancer = scene("A", {
    templates: [cercle],
    tokens: [{
      id: "t1", actorId: "mage", x: 0, y: 0
    }, {
      id: "t2", actorId: "def", x: 1600, y: 1000
    }]
  })
  const autre = scene("B", {
    tokens: [{
      id: "t3", actorId: "def", x: 1000, y: 1000
    }]
  })

  it("measures on the scene of the cast while the canvas shows another one", () => {
    monde([autre, lancer], autre)
    expect(SR5_CombatHelpers.spellAreaScene(card)).toBe(lancer)
    expect(SR5_CombatHelpers.spellAreaDistance(card, defender)).toBeCloseTo(9)
  })

  it("is null when no template of the spell is placed", () => {
    const vide = scene("A", {
      tokens: lancer.tokens
    })
    monde([vide], vide)
    expect(SR5_CombatHelpers.spellAreaDistance(card, defender)).toBeNull()
  })

  it("takes the scene named by the chat card first", () => {
    monde([autre, lancer], autre)
    globalThis.game.messages.get = () => ({
      speaker: {
        scene: "A"
      }
    })
    expect(SR5_CombatHelpers.spellAreaScene(card)).toBe(lancer)
  })
})
