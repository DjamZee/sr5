import {
  describe, it, expect, beforeAll, afterEach
} from 'vitest'
import {
  spiritImageTier, isDefaultSpiritImage, spiritImageType, defaultSpiritImages, spiritImageChanges,
  spiritImageOnCreate, spiritImageOnUpdate, SPIRIT_IMAGE_DIR
} from '../modules/entities/actors/spirit-default-image.js'

const ICON = 'systems/sr5/assets/img/actors/actorSpirit.svg'
const dir = (t) => `${SPIRIT_IMAGE_DIR}/${t}`
// a custom type "salamandre" based on fire, one "vide" with no base
const baseOf = (t) => ({
  salamandre: 'fire', vide: '' 
})[t] ?? t

beforeAll(() => {
  const flat = (o, p = '', out = {
  }) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, `${p}${k}.`, out)
      else out[`${p}${k}`] = v
    }
    return out
  }
  foundry.utils.flattenObject ??= (o) => flat(o)
  foundry.utils.expandObject ??= (o) => {
    const out = {
    }
    for (const [k, v] of Object.entries(o)) foundry.utils.setProperty(out, k, v)
    return out
  }
})

afterEach(() => {
  game.settings.get = () => null
})

describe('spiritImageTier (postulat de DjamZ : 1-3, 4-6, 7-9, 10+)', () => {
  it.each([[0, 1], [1, 1], [3, 1], [4, 2], [6, 2], [7, 3], [9, 3], [10, 4], [14, 4], ['8', 3], [undefined, 1]])(
    'Puissance %s → palier %i', (force, tier) => expect(spiritImageTier(force)).toBe(tier))
})

describe('isDefaultSpiritImage', () => {
  it('reconnaît les icônes par défaut et les images posées par ce code', () => {
    for (const img of [undefined, null, '', 'icons/svg/mystery-man.svg', ICON, 'systems/sr5/assets/img/items/itemSpirit.svg',
      `${dir('fire')}/portrait-1.webp`]) expect(isDefaultSpiritImage(img)).toBe(true)
  })
  it("ne prend jamais l'image d'un MJ pour une image par défaut", () => {
    expect(isDefaultSpiritImage('worlds/w/salamandre.webp')).toBe(false)
    expect(isDefaultSpiritImage('modules/x/esprit.png')).toBe(false)
  })
})

describe('spiritImageType', () => {
  it('type officiel avec images, type personnalisé hérité, type sans image', () => {
    expect(spiritImageType('fire', baseOf)).toBe('fire')
    expect(spiritImageType('salamandre', baseOf)).toBe('fire')
    expect(spiritImageType('vide', baseOf)).toBeNull()
    expect(spiritImageType('insectWorker', baseOf)).toBeNull()
    expect(spiritImageType('', baseOf)).toBeNull()
  })
  it('donne les chemins du palier', () => {
    expect(defaultSpiritImages('fire', 8, baseOf)).toEqual({
      portrait: `${dir('fire')}/portrait-3.webp`, token: `${dir('fire')}/token-3.webp`,
    })
    expect(defaultSpiritImages('shedim', 8, baseOf)).toBeNull()
  })
  it("l'anarch n'a que deux paliers : le second sert au-delà", () => {
    expect(defaultSpiritImages('anarch', 2, baseOf).portrait).toBe(`${dir('anarch')}/portrait-1.webp`)
    for (const force of [4, 7, 12]) expect(defaultSpiritImages('anarch', force, baseOf)).toEqual({
      portrait: `${dir('anarch')}/portrait-2.webp`, token: `${dir('anarch')}/token-2.webp`,
    })
  })
})

describe('spiritImageChanges : ne jamais écraser', () => {
  it('pose portrait et jeton sur un esprit encore à l’icône', () => {
    expect(spiritImageChanges({
      img: ICON, token: ICON, type: 'fire', force: 2 
    }, baseOf)).toEqual({
      img: `${dir('fire')}/portrait-1.webp`, 'prototypeToken.texture.src': `${dir('fire')}/token-1.webp`,
    })
  })
  it('suit la Puissance quand les images sont les siennes', () => {
    const c = spiritImageChanges({
      img: `${dir('fire')}/portrait-1.webp`, token: `${dir('fire')}/token-1.webp`, type: 'fire', force: 8 
    }, baseOf)
    expect(c['prototypeToken.texture.src']).toBe(`${dir('fire')}/token-3.webp`)
  })
  it("laisse tout quand le portrait ou le jeton est celui du MJ", () => {
    expect(spiritImageChanges({
      img: 'worlds/w/a.webp', token: `${dir('fire')}/token-1.webp`, type: 'fire', force: 8 
    }, baseOf)).toBeNull()
    expect(spiritImageChanges({
      img: `${dir('fire')}/portrait-1.webp`, token: 'worlds/w/t.webp', type: 'fire', force: 8 
    }, baseOf)).toBeNull()
  })
  it('rien quand tout est déjà en place ou que le type n’a pas d’image', () => {
    expect(spiritImageChanges({
      img: `${dir('fire')}/portrait-3.webp`, token: `${dir('fire')}/token-3.webp`, type: 'fire', force: 8 
    }, baseOf)).toBeNull()
    expect(spiritImageChanges({
      img: ICON, token: ICON, type: 'insectQueen', force: 8 
    }, baseOf)).toBeNull()
  })
})

function spirit(src) {
  return {
    type: 'actorSpirit', _source: src,
    updateSource(changes) { this.applied = changes },
  }
}

describe('crochets', () => {
  it('création : pose les images, sauf réglage décoché', () => {
    const doc = spirit({
      img: ICON, prototypeToken: {
        texture: {
          src: ICON 
        } 
      }, system: {
        type: 'fire', force: {
          base: 2 
        } 
      } 
    })
    spiritImageOnCreate(doc)
    expect(doc.applied.img).toBe(`${dir('fire')}/portrait-1.webp`)
    game.settings.get = () => false
    const off = spirit({
      img: ICON, prototypeToken: {
        texture: {
          src: ICON 
        } 
      }, system: {
        type: 'fire', force: {
          base: 2 
        } 
      } 
    })
    spiritImageOnCreate(off)
    expect(off.applied).toBeUndefined()
  })
  it('mise à jour de la Puissance : le jeton change ; image du MJ : rien', () => {
    const p1 = `${dir('fire')}/portrait-1.webp`, t1 = `${dir('fire')}/token-1.webp`
    const doc = spirit({
      img: p1, prototypeToken: {
        texture: {
          src: t1 
        } 
      }, system: {
        type: 'fire', force: {
          base: 2 
        } 
      } 
    })
    const changes = {
      system: {
        force: {
          base: 8 
        } 
      } 
    }
    spiritImageOnUpdate(doc, changes)
    expect(changes.img).toBe(`${dir('fire')}/portrait-3.webp`)
    expect(changes.prototypeToken.texture.src).toBe(`${dir('fire')}/token-3.webp`)

    const mj = spirit({
      img: 'worlds/w/a.webp', prototypeToken: {
        texture: {
          src: t1 
        } 
      }, system: {
        type: 'fire', force: {
          base: 2 
        } 
      } 
    })
    const c2 = {
      'system.force.base': 8 
    }
    spiritImageOnUpdate(mj, c2)
    expect(c2.img).toBeUndefined()
  })
  it("la fiche renvoie l'image inchangée avec la Puissance : le jeton suit quand même", () => {
    const p1 = `${dir('fire')}/portrait-1.webp`
    const doc = spirit({
      img: p1, prototypeToken: {
        texture: {
          src: `${dir('fire')}/token-1.webp` 
        } 
      }, system: {
        type: 'fire', force: {
          base: 2 
        } 
      } 
    })
    const changes = {
      img: p1, 'system.force.base': 8 
    }
    spiritImageOnUpdate(doc, changes)
    expect(changes.img).toBe(`${dir('fire')}/portrait-3.webp`)
    expect(changes.prototypeToken.texture.src).toBe(`${dir('fire')}/token-3.webp`)
  })
  it("une mise à jour qui porte sa propre image n'est pas touchée", () => {
    const doc = spirit({
      img: ICON, prototypeToken: {
        texture: {
          src: ICON 
        } 
      }, system: {
        type: 'fire', force: {
          base: 2 
        } 
      } 
    })
    const changes = {
      img: 'worlds/w/b.webp', 'system.force.base': 8 
    }
    spiritImageOnUpdate(doc, changes)
    expect(changes.img).toBe('worlds/w/b.webp')
    expect(changes.prototypeToken).toBeUndefined()
  })
})
