import {
  describe, it, expect, beforeAll, afterEach
} from 'vitest'
import {
  isDefaultActorImage, defaultIceImages, defaultSpriteImages, contactImageCandidates, defaultContactImage, seededRandom,
  imageChanges, defaultImageOnCreate, defaultImageOnUpdate, ICE_IMAGE_DIR, SPRITE_IMAGE_DIR, CONTACT_IMAGE_DIR
} from '../modules/entities/actors/default-actor-images.js'
import {
  CONTACT_IMAGES
} from '../modules/entities/actors/contact-images-list.js'
import {
  SPIRIT_IMAGE_TYPES, defaultSpiritImages
} from '../modules/entities/actors/spirit-default-image.js'
import {
  existsSync
} from 'node:fs'

const DEVICE = 'systems/sr5/assets/img/actors/actorDevice.svg'
const GRUNT = 'systems/sr5/assets/img/actors/actorGrunt.svg'
const LIST = [
  {
    file: 'barman-ork-femme.webp', job: 'barman', metatype: 'ork', gender: 'female'
  },
  {
    file: 'barman-elfe-homme.webp', job: 'barman', metatype: 'elf', gender: 'male'
  },
  {
    file: 'street-doc-humain-femme.webp', job: 'street doc', metatype: 'human', gender: 'female'
  },
  {
    file: 'ganger-ork-homme.webp', job: 'ganger', metatype: 'ork', gender: 'male'
  },
  {
    file: 'damian-welsch-fixer.webp', job: 'fixer', metatype: '', gender: '', named: true
  },
]

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

describe('images livrées', () => {
  const file = (p) => p.replace('systems/sr5/', '')
  it('chaque CI, chaque sprite et chaque contact de la liste a ses fichiers', () => {
    for (const t of ['iceAcid', 'iceBinder', 'iceBlack', 'iceBlaster', 'iceBloodhound', 'iceBlueGoo', 'iceCatapult', 'iceCrash',
      'iceFlicker', 'iceJammer', 'iceKiller', 'iceMarker', 'icePatrol', 'iceProbe', 'iceScramble', 'iceShocker', 'iceSparky',
      'iceSleuther', 'iceTarBaby', 'iceTrack']) {
      const i = defaultIceImages(t)
      expect(existsSync(file(i.portrait)) && existsSync(file(i.token))).toBe(true)
    }
    for (const t of ['companion', 'courier', 'crack', 'data', 'fault', 'generalist', 'machine']) {
      const i = defaultSpriteImages(t)
      expect(existsSync(file(i.portrait)) && existsSync(file(i.token))).toBe(true)
    }
    for (const e of CONTACT_IMAGES) expect(existsSync(file(`${CONTACT_IMAGE_DIR}/${e.file}`))).toBe(true)
  })
  it('chaque type d’esprit annoncé a ses quatre paliers', () => {
    for (const t of SPIRIT_IMAGE_TYPES) for (const force of [1, 4, 7, 10]) {
      const i = defaultSpiritImages(t, force, (x) => x)
      expect(existsSync(file(i.portrait)) && existsSync(file(i.token)), `${t} ${force}`).toBe(true)
    }
  })
})

describe('isDefaultActorImage', () => {
  it('icônes du système et images posées ici : oui ; image du MJ : non', () => {
    for (const img of [undefined, '', 'icons/svg/mystery-man.svg', DEVICE, GRUNT, `${ICE_IMAGE_DIR}/iceAcid/token.webp`,
      `${CONTACT_IMAGE_DIR}/x.webp`]) expect(isDefaultActorImage(img)).toBe(true)
    expect(isDefaultActorImage('worlds/w/ci.webp')).toBe(false)
  })
})

describe('CI et sprites', () => {
  it('chemins par type, null pour un type sans image', () => {
    expect(defaultIceImages('iceAcid')).toEqual({
      portrait: `${ICE_IMAGE_DIR}/iceAcid/portrait.webp`, token: `${ICE_IMAGE_DIR}/iceAcid/token.webp`
    })
    expect(defaultIceImages('iceDesigned')).toBeNull()
    expect(defaultSpriteImages('fault').token).toBe(`${SPRITE_IMAGE_DIR}/fault/token.webp`)
    expect(defaultSpriteImages('')).toBeNull()
  })
  it("n'écrase jamais l'image du MJ", () => {
    expect(imageChanges('worlds/w/a.webp', DEVICE, defaultIceImages('iceAcid'))).toBeNull()
    expect(imageChanges(DEVICE, DEVICE, defaultIceImages('iceAcid')).img).toBe(`${ICE_IMAGE_DIR}/iceAcid/portrait.webp`)
  })
})

describe('contacts', () => {
  it('métatype d’abord, puis métier, puis genre', () => {
    expect(contactImageCandidates({
      job: 'Barman', metatype: 'ork', gender: 'female'
    }, LIST).map((e) => e.file)).toEqual(['barman-ork-femme.webp'])
    // une orke street doc : l'orke passe avant le métier
    expect(contactImageCandidates({
      job: 'Street doc', metatype: 'ork', gender: 'female'
    }, LIST).map((e) => e.file)).toEqual(['barman-ork-femme.webp'])
  })
  it("un personnage nommé ne vient que sur son métier", () => {
    expect(contactImageCandidates({
    }, LIST).some((e) => e.named)).toBe(false)
    expect(contactImageCandidates({
      job: 'Fixer'
    }, LIST).map((e) => e.file)).toEqual(['damian-welsch-fixer.webp'])
  })
  it('même contact, même visage ; tirage dans [0, 1)', () => {
    const a = defaultContactImage({
      }, 'abc123', LIST), b = defaultContactImage({
      }, 'abc123', LIST)
    expect(a).toBe(b)
    for (const s of ['', 'x', 'abcdefghijklmnop']) expect(seededRandom(s)).toBeGreaterThanOrEqual(0)
    for (const s of ['', 'x', 'abcdefghijklmnop']) expect(seededRandom(s)).toBeLessThan(1)
  })
})

function actor(type, src) {
  return {
    type, _source: src,
    updateSource(changes) { this.applied = changes },
  }
}

describe('crochets', () => {
  it('création : CI, sprite, contact ; réglage décoché : rien', () => {
    const ci = actor('actorDevice', {
      img: DEVICE, prototypeToken: {
        texture: {
          src: DEVICE
        }
      }, system: {
        matrix: {
          deviceType: 'ice', deviceSubType: 'iceKiller'
        }
      }
    })
    defaultImageOnCreate(ci)
    expect(ci.applied['prototypeToken.texture.src']).toBe(`${ICE_IMAGE_DIR}/iceKiller/token.webp`)

    const sprite = actor('actorSprite', {
      img: '', prototypeToken: {
        texture: {
          src: ''
        }
      }, system: {
        type: 'machine'
      }
    })
    defaultImageOnCreate(sprite)
    expect(sprite.applied.img).toBe(`${SPRITE_IMAGE_DIR}/machine/portrait.webp`)

    const contact = actor('actorGrunt', {
      img: GRUNT, prototypeToken: {
        texture: {
          src: GRUNT
        }
      }, system: {
        creatorId: 'pc', creatorItemId: 'it1', biography: {
          metatype: 'troll', gender: 'female'
        }
      }
    })
    defaultImageOnCreate(contact, {
    }, {
    }, 'u', () => ({
      type: 'itemContact', system: {
        type: ''
      }
    }))
    expect(contact.applied.img).toMatch(new RegExp(`^${CONTACT_IMAGE_DIR}/.*troll.*\\.webp$`))
    expect(contact.applied['prototypeToken.texture.src']).toBe(contact.applied.img)

    // un sbire fait à la main n'est pas un contact
    const grunt = actor('actorGrunt', {
      img: GRUNT, prototypeToken: {
        texture: {
          src: GRUNT
        }
      }, system: {
      }
    })
    defaultImageOnCreate(grunt)
    expect(grunt.applied).toBeUndefined()

    game.settings.get = () => false
    const off = actor('actorSprite', {
      img: '', prototypeToken: {
        texture: {
          src: ''
        }
      }, system: {
        type: 'machine'
      }
    })
    defaultImageOnCreate(off)
    expect(off.applied).toBeUndefined()
  })

  it('mise à jour : un appareil devenu CI prend ses images ; image du MJ : rien', () => {
    const doc = actor('actorDevice', {
      img: DEVICE, prototypeToken: {
        texture: {
          src: DEVICE
        }
      }, system: {
        matrix: {
          deviceType: '', deviceSubType: ''
        }
      }
    })
    const changes = {
      'system.matrix.deviceType': 'ice', 'system.matrix.deviceSubType': 'iceProbe'
    }
    defaultImageOnUpdate(doc, changes)
    expect(changes.img).toBe(`${ICE_IMAGE_DIR}/iceProbe/portrait.webp`)

    const mj = actor('actorSprite', {
      img: 'worlds/w/s.webp', prototypeToken: {
        texture: {
          src: DEVICE
        }
      }, system: {
        type: 'data'
      }
    })
    const c2 = {
      system: {
        type: 'fault'
      }
    }
    defaultImageOnUpdate(mj, c2)
    expect(c2.img).toBeUndefined()
  })
})
