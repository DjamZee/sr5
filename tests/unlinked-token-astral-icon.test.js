import {
  describe, it, expect, vi, beforeAll
} from 'vitest'

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')

// M4 D3 (mesuré par Tilda, 06/10) : l'acteur du répertoire passé en perception astrale montrait l'icône « Perception
// astrale » sur ses jetons non liés, qui n'ont pas la vision. Elle ne s'affiche plus que là où la vision est active.

const astral = {
  origin: 'astralVision'
}, other = {
  origin: 'initiativeMode'
}

beforeAll(() => {
  Object.defineProperty(globalThis.Actor.prototype, 'temporaryEffects', {
    configurable: true, get(){
      return this._effects
    }
  })
})

describe("M4 D3 : icône « Perception astrale » des jetons non liés", () => {
  it("jeton non lié sans la vision : pas d'icône astrale, les autres restent", () => {
    const a = Object.create(SR5Actor.prototype)
    Object.defineProperty(a, 'isToken', {
      value: true
    })
    a._effects = [astral, other]
    a.system = {
      visions: {
        astral: {
          isActive: false
        }
      }
    }
    expect(a.temporaryEffects).toEqual([other])
  })

  it("jeton non lié avec la vision, ou acteur du répertoire : l'icône reste", () => {
    for (const [isToken, on] of [[true, true], [false, false], [false, true]]) {
      const a = Object.create(SR5Actor.prototype)
      Object.defineProperty(a, 'isToken', {
        value: isToken
      })
      a._effects = [astral, other]
      a.system = {
        visions: {
          astral: {
            isActive: on
          }
        }
      }
      expect(a.temporaryEffects).toEqual([astral, other])
    }
  })
})
