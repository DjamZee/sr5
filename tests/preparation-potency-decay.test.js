import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  potencyAt, decayedPotency, checkPreparationPotency, GM_ONLY_PREPARATION_PATHS
} from "../modules/system/preparation-potency.js"
import {
  stripGMOnlyChanges
} from "../modules/entities/items/spirit-bonds.js"

// G9 (décision de DjamZ, 06/10) : la perte de Potentiel d'une préparation (SR5 p. 309) est automatique. Plein pendant
// (Potentiel × 2) h, puis −1, et −1 encore à chaque heure ; × 3 ou × 4 pour les maîtrises (Arcanes interdites p. 39,
// 71, 127), un point par jour avec Fixation (SR5 p. 329), réglés par le MJ. Les accélérations restent au MJ.

const H = 3600
const prep = (extra = {
}) => ({
  potency: 4, initialPotency: 4, createdAt: 0, fullPotencyMultiplier: 2, decayRate: "hour", ...extra
})

describe("G9 : Potentiel d'une préparation sur l'horloge du monde (SR5 p. 309)", () => {
  it("plein pendant Potentiel × 2 heures, puis −1 et −1 par heure supplémentaire", () => {
    expect(potencyAt(prep(), 7 * H)).toBe(4)
    expect(potencyAt(prep(), 8 * H)).toBe(3)
    expect(potencyAt(prep(), 9 * H)).toBe(2)
    expect(potencyAt(prep(), 11 * H)).toBe(0)
    expect(potencyAt(prep(), 100 * H)).toBe(0)
  })

  it("× 3 (Préparations durables, Godi) et × 4 (praticien islamique, magie du sang)", () => {
    expect(potencyAt(prep({
      fullPotencyMultiplier: 3
    }), 11 * H)).toBe(4)
    expect(potencyAt(prep({
      fullPotencyMultiplier: 3
    }), 12 * H)).toBe(3)
    expect(potencyAt(prep({
      fullPotencyMultiplier: 4
    }), 16 * H)).toBe(3)
  })

  it("Fixation : un point par jour une fois le temps plein passé", () => {
    const fixed = prep({
      decayRate: "day"
    })
    expect(potencyAt(fixed, 8 * H)).toBe(3)
    expect(potencyAt(fixed, 31 * H)).toBe(3)
    expect(potencyAt(fixed, 32 * H)).toBe(2)
  })

  it("une préparation faite avant la règle (sans départ) ne bouge pas", () => {
    expect(potencyAt({
      potency: 4
    }, 100 * H)).toBe(null)
  })

  it("jamais au-dessus du Potentiel posé : le MJ qui l'a baissé à la main garde sa valeur", () => {
    expect(decayedPotency(prep({
      potency: 1
    }), 9 * H)).toBe(null)
    expect(decayedPotency(prep(), 9 * H)).toBe(2)
    expect(decayedPotency(prep(), 2 * H)).toBe(null)
  })

  it("le départ et le rythme sont au MJ : retirés d'une écriture de joueur", () => {
    const changes = {
      system: {
        fullPotencyMultiplier: 4, decayRate: "day", createdAt: 999999, initialPotency: 12, potency: 3
      }
    }
    const refused = stripGMOnlyChanges(changes, {
      system: prep()
    }, GM_ONLY_PREPARATION_PATHS)
    expect(refused).toHaveLength(4)
    expect(changes.system).toEqual({
      potency: 3
    })
  })
  it("une suppression (-=) ou un remplacement (==) du départ est refusé aussi", () => {
    const current = {
      system: prep()
    }
    expect(stripGMOnlyChanges({
      "system.-=createdAt": null
    }, current, GM_ONLY_PREPARATION_PATHS)).toEqual(["system.createdAt"])
    expect(stripGMOnlyChanges({
      system: {
        "-=decayRate": null
      }
    }, current, GM_ONLY_PREPARATION_PATHS)).toEqual(["system.decayRate"])
    expect(stripGMOnlyChanges({
      "==system": {
        ...prep(), createdAt: 999999
      }
    }, current, GM_ONLY_PREPARATION_PATHS)).toEqual(["system.createdAt"])
  })
})

describe("G9 : seul le MJ actif écrit", () => {
  let actor
  beforeEach(() => {
    actor = {
      name: "Abbi", items: [{
        id: "p1", type: "itemPreparation", name: "Ténèbres", system: prep()
      }, {
        id: "s1", type: "itemSpell", name: "Éclair", system: {
        }
      }], updateEmbeddedDocuments: vi.fn()
    }
    globalThis.game.actors = [actor]
    globalThis.game.scenes = []
    globalThis.game.time = {
      worldTime: 9 * H
    }
    globalThis.game.i18n = {
      localize: k => k, format: k => k
    }
    globalThis.ui = {
      notifications: {
        info: vi.fn()
      }
    }
  })

  it("le MJ actif baisse le Potentiel", async () => {
    globalThis.game.user = {
      id: "gm", isGM: true
    }
    globalThis.game.users = {
      activeGM: {
        id: "gm"
      }
    }
    await checkPreparationPotency()
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{
      _id: "p1", "system.potency": 2
    }])
  })

  it("un joueur n'écrit rien", async () => {
    globalThis.game.user = {
      id: "p", isGM: false
    }
    globalThis.game.users = {
      activeGM: {
        id: "gm"
      }
    }
    await checkPreparationPotency()
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it("à 0, le MJ est prévenu", async () => {
    globalThis.game.user = {
      id: "gm", isGM: true
    }
    globalThis.game.users = {
      activeGM: {
        id: "gm"
      }
    }
    globalThis.game.time.worldTime = 20 * H
    await checkPreparationPotency()
    expect(ui.notifications.info).toHaveBeenCalledWith("SR5.INFO_PreparationSpent")
  })
})
