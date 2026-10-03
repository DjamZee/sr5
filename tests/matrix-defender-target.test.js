import {
  describe, it, expect, beforeAll, vi
} from 'vitest'
import fs from 'node:fs'

// config.js writes CONFIG.statusEffects while it is being imported
globalThis.CONFIG ??= {
}
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')

const TEMPLATE = 'templates/interface/itemMatrixTarget.hbs'

// Every path handed to {{selectOptions}} or tested by {{#if}} in the template
function templatePaths(){
  const src = fs.readFileSync(TEMPLATE, 'utf8')
  return [...src.matchAll(/\{\{(?:selectOptions|#if)\s+([\w.]+)/g)].map(m => m[1])
}

function defender(){
  return {
    system: {
      matrix: {
        deviceName: 'Commlink',
        connectedObject: {
          augmentations: {
            'Actor.a.Item.aug': 'Cybereyes'
          },
          weapons: {
            'Actor.a.Item.gun': 'Ares Predator'
          },
          armors: {
            'Actor.a.Item.arm': 'Armor Jacket'
          },
          gears: {
            'Actor.a.Item.gear': 'Medkit'
          },
          vehicles: {
          },
        },
      },
    },
    rollTest: vi.fn(),
  }
}

describe('matrix defender target dialog', () => {
  let dialogData

  beforeAll(async () => {
    foundry.applications.handlebars = {
      renderTemplate: vi.fn(async (path, data) => {
        dialogData = data
        return ''
      }),
    }
    foundry.applications.api.DialogV2 = {
      wait: vi.fn(async () => null),
    }
    globalThis.game.i18n ??= {
      localize: k => k
    }
    await SR5_MatrixHelpers.chooseMatrixDefender({
      test: {
      }
    }, defender())
  })

  it('reads its option lists under names the caller provides', () => {
    const paths = templatePaths().filter(p => p.includes('.'))
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      const value = foundry.utils.getProperty(dialogData, path)
      expect(value, path).toBeTypeOf('object')
      expect(Object.keys(value).length, path).toBeGreaterThan(0)
    }
  })
})
