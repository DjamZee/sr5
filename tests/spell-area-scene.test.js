import {
  describe, it, expect, afterEach
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// An area spell's defense measures from its template wherever it was placed, not on the scene the defender
// happens to look at; with no template, the distance is unknown (null) and the GM rules.
// Grid of 100 px per 1.5 m: a straight square is 1.5 m.
function scene(id, {
  templates = [], tokens = []
} = {
}) {
  const s = {
    id, tokens,
    grid: {
      size: 100, units: "m",
      measurePath: ([a, b]) => ({
        distance: Math.hypot(b.x - a.x, b.y - a.y) / 100 * 1.5
      })
    },
  }
  s.templates = templates.map(t => ({
    ...t, parent: s
  }))
  return s
}

const gabarit = (x, y, messageId) => ({
  x, y, flags: {
    sr5: {
      item: "fireball", itemUuid: "Actor.mage.Item.fireball", messageId
    }
  }
})
const card = {
  owner: {
    actorId: "mage", itemId: "fireball", itemUuid: "Actor.mage.Item.fireball", messageId: "msg"
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
    scenes
  }
  globalThis.canvas = canvasScene === undefined ? undefined : {
    scene: canvasScene
  }
}

describe("spellAreaDistance", () => {
  // Template centered on (1050, 1050); a 1x1 defender at (1600, 1000) has its square centered 600 px away: 9 m
  const lancer = () => scene("A", {
    templates: [gabarit(1050, 1050)],
    tokens: [{
      actorId: "mage", x: 0, y: 0
    }, {
      actorId: "def", x: 1600, y: 1000
    }]
  })

  it("finds the template on another scene, even when the caster also stands on the one shown", () => {
    const A = lancer()
    const B = scene("B", {
      tokens: [{
        actorId: "mage", x: 0, y: 0
      }, {
        actorId: "def", x: 1000, y: 1000
      }]
    })
    monde([B, A], B)
    expect(SR5_CombatHelpers.spellAreaTemplate(card).parent).toBe(A)
    expect(SR5_CombatHelpers.spellAreaDistance(card, defender)).toBeCloseTo(9)
  })

  it("measures with no scene on the canvas", () => {
    monde([lancer()], undefined)
    expect(SR5_CombatHelpers.spellAreaDistance(card, defender)).toBeCloseTo(9)
  })

  it("is null when no template of the spell is placed", () => {
    monde([scene("A", {
      tokens: [{
        actorId: "def", x: 0, y: 0
      }]
    })], null)
    expect(SR5_CombatHelpers.spellAreaDistance(card, defender)).toBeNull()
  })

  it("takes the template placed from this chat card over a later one of the same spell", () => {
    const A = scene("A", {
      templates: [gabarit(1050, 1050, "msg"), gabarit(150, 150, "other")]
    })
    monde([A], A)
    expect(SR5_CombatHelpers.spellAreaTemplate(card).x).toBe(1050)
  })

  it("takes the most recent template when none belongs to this card", () => {
    const A = scene("A", {
      templates: [gabarit(1050, 1050), gabarit(150, 150)]
    })
    monde([A], A)
    expect(SR5_CombatHelpers.spellAreaTemplate(card).x).toBe(150)
  })

  it("measures a 2x2 token from its square nearest the center, on either side", () => {
    // Center at (1050, 1050). Left target covers x 700-900: its nearest square is centered at 850, 200 px = 3 m.
    // Right target covers x 1200-1400: nearest square centered at 1250, 200 px = 3 m as well.
    for (const x of [700, 1200]){
      const A = scene("A", {
        templates: [gabarit(1050, 1050)],
        tokens: [{
          actorId: "def", x, y: 1000, width: 2, height: 2
        }]
      })
      monde([A], A)
      expect(SR5_CombatHelpers.spellAreaDistance(card, defender)).toBeCloseTo(3)
    }
  })
})
