import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')

// Last security pass before the djamz.11 (Olympe): the eight sockets of entityActor-helpers.js believed
// any sender. From a player's console, dismissSidekick with a chosen _id deleted a GM's actor (measured
// by Sixtine), createSidekick built an actor from the whole object sent, and deleteSustainedEffect
// deleted any item by uuid. Now the active GM believes a GM, the owner of the target, or a bounded use
// he works out again from the sheets, never from the request.

const users = {
  gm: {
    id: 'gm', isGM: true
  },
  owner: {
    id: 'owner', isGM: false
  },
  stranger: {
    id: 'stranger', isGM: false
  },
}
const owned = (...ids) => (user) => !!user && (user.isGM || ids.includes(user.id))

let docs
beforeEach(() => {
  vi.restoreAllMocks()
  docs = {
  }
  game.user = users.gm
  game.users = {
    get: id => users[id], activeGM: users.gm
  }
  game.actors = {
    get: id => docs[id]
  }
  globalThis.fromUuid = async uuid => docs[uuid] ?? null
  globalThis.fromUuidSync = uuid => docs[uuid] ?? null
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => docs[id])
})

describe("createSidekick", () => {
  let item, pc
  beforeEach(() => {
    item = {
      _id: 'it1', type: 'itemVehicle', toObject: () => ({
        _id: 'it1', type: 'itemVehicle', name: 'Drone de la fiche', system: {
        }
      })
    }
    pc = {
      id: 'pc', testUserPermission: owned('owner'), items: {
        get: id => (id === 'it1' ? item : undefined)
      }
    }
    docs.pc = pc
    vi.spyOn(SR5_ActorHelper, 'createSidekick').mockResolvedValue()
  })

  it("is refused from a player who does not own the creator", async () => {
    await SR5_ActorHelper._socketCreateSidekick({
      data: {
        item: {
          _id: 'it1', type: 'itemVehicle'
        }, userId: 'stranger', actorId: 'pc'
      }
    }, 'stranger')
    expect(SR5_ActorHelper.createSidekick).not.toHaveBeenCalled()
  })

  it("builds the actor from the item of the sheet, owned by the sender, never from the request", async () => {
    await SR5_ActorHelper._socketCreateSidekick({
      data: {
        item: {
          _id: 'it1', type: 'itemVehicle', name: 'Forgé', system: {
            attributes: {
              body: 99
            }
          }
        }, userId: 'gm', actorId: 'pc'
      }
    }, 'owner')
    expect(SR5_ActorHelper.createSidekick).toHaveBeenCalledWith(item.toObject(), 'owner', 'pc')
  })

  it("is refused for an item the creator does not carry, or one that makes no sidekick", async () => {
    await SR5_ActorHelper._socketCreateSidekick({
      data: {
        item: {
          _id: 'nope', type: 'itemVehicle'
        }, actorId: 'pc'
      }
    }, 'owner')
    item.type = 'itemWeapon'
    await SR5_ActorHelper._socketCreateSidekick({
      data: {
        item: {
          _id: 'it1'
        }, actorId: 'pc'
      }
    }, 'owner')
    expect(SR5_ActorHelper.createSidekick).not.toHaveBeenCalled()
  })

  it("is only handled by the active GM", async () => {
    game.user = {
      id: 'gm2', isGM: true
    }
    await SR5_ActorHelper._socketCreateSidekick({
      data: {
        item: {
          _id: 'it1'
        }, actorId: 'pc'
      }
    }, 'owner')
    game.user = users.owner
    await SR5_ActorHelper._socketCreateSidekick({
      data: {
        item: {
          _id: 'it1'
        }, actorId: 'pc'
      }
    }, 'owner')
    expect(SR5_ActorHelper.createSidekick).not.toHaveBeenCalled()
  })
})

describe("dismissSidekick", () => {
  beforeEach(() => {
    docs.pc = {
      id: 'pc', testUserPermission: owned('owner'), items: {
        get: id => (id === 'it1' ? {
          id: 'it1'
        } : undefined)
      }
    }
    docs.npc = {
      _id: 'npc', id: 'npc', type: 'actorGrunt', system: {
      }, testUserPermission: owned(), toObject: () => ({
        _id: 'npc'
      })
    }
    docs.spirit = {
      _id: 'spirit', id: 'spirit', type: 'actorSpirit', system: {
        creatorId: 'pc', creatorItemId: 'it1'
      }, testUserPermission: owned(), toObject: () => ({
        _id: 'spirit', type: 'actorSpirit', fromWorld: true
      })
    }
    vi.spyOn(SR5_ActorHelper, 'dimissSidekick').mockResolvedValue()
  })

  it("never deletes an actor that is no sidekick (measured by Sixtine)", async () => {
    await SR5_ActorHelper._socketDismissSidekick({
      data: {
        actor: {
          _id: 'npc', type: 'actorSpirit', system: {
            creatorId: 'pc', creatorItemId: 'it1'
          }
        }
      }
    }, 'owner')
    expect(SR5_ActorHelper.dimissSidekick).not.toHaveBeenCalled()
  })

  it("is refused from a player who owns neither the sidekick nor its creator", async () => {
    await SR5_ActorHelper._socketDismissSidekick({
      data: {
        actor: {
          _id: 'spirit'
        }
      }
    }, 'stranger')
    expect(SR5_ActorHelper.dimissSidekick).not.toHaveBeenCalled()
  })

  it("dismisses the world's sidekick for the owner of its creator, from the GM's copy", async () => {
    await SR5_ActorHelper._socketDismissSidekick({
      data: {
        actor: {
          _id: 'spirit', system: {
            services: {
              value: 99
            }
          }
        }
      }
    }, 'owner')
    expect(SR5_ActorHelper.dimissSidekick).toHaveBeenCalledWith({
      _id: 'spirit', type: 'actorSpirit', fromWorld: true
    })
  })
})

describe("the PAN sockets", () => {
  let deck, gear
  beforeEach(() => {
    deck = {
      type: 'itemDevice', system: {
        isActive: true, pan: {
          content: [{
            uuid: 'Actor.pc.Item.g1'
          }]
        }
      }
    }
    docs.pc = {
      id: 'pc', type: 'actorPc', hasPlayerOwner: true, testUserPermission: owned('owner'), items: [deck], system: {
        matrix: {
          pan: {
            current: 1, max: 3
          }, potentialPanObject: {
            gears: {
              'Actor.pc.Item.g2': 'Lunettes'
            }
          }
        }
      }
    }
    gear = {
      uuid: 'Actor.pc.Item.g2', documentName: 'Item', parent: docs.pc, actor: docs.pc
    }
    docs['Actor.pc.Item.g2'] = gear
    docs['Actor.npc.Item.x'] = {
      uuid: 'Actor.npc.Item.x', documentName: 'Item', parent: {
        type: 'actorGrunt', testUserPermission: owned(), system: {
          matrix: {
            potentialPanObject: {
            }
          }
        }
      }
    }
    vi.spyOn(SR5_ActorHelper, 'addItemtoPan').mockResolvedValue()
    vi.spyOn(SR5_ActorHelper, 'deleteItemFromPan').mockResolvedValue()
  })

  it("addItemToPan is refused from a player who does not own the PAN", async () => {
    await SR5_ActorHelper._socketAddItemToPan({
      data: {
        targetItem: 'Actor.pc.Item.g2', actorId: 'pc'
      }
    }, 'stranger')
    expect(SR5_ActorHelper.addItemtoPan).not.toHaveBeenCalled()
  })

  it("addItemToPan only slaves a device its owner could list (SR5 p. 233)", async () => {
    await SR5_ActorHelper._socketAddItemToPan({
      data: {
        targetItem: 'Actor.npc.Item.x', actorId: 'pc'
      }
    }, 'owner')
    expect(SR5_ActorHelper.addItemtoPan).not.toHaveBeenCalled()
    await SR5_ActorHelper._socketAddItemToPan({
      data: {
        targetItem: 'Actor.pc.Item.g2', actorId: 'pc'
      }
    }, 'owner')
    expect(SR5_ActorHelper.addItemtoPan).toHaveBeenCalledWith('Actor.pc.Item.g2', 'pc')
  })

  it("deleteItemFromPan is refused from a player who owns neither the PAN nor the device", async () => {
    await SR5_ActorHelper._socketDeleteItemFromPan({
      data: {
        targetItem: 'Actor.pc.Item.g1', actorId: 'pc', index: 0
      }
    }, 'stranger')
    expect(SR5_ActorHelper.deleteItemFromPan).not.toHaveBeenCalled()
  })

  it("deleteItemFromPan never splices an index that is not the device named", async () => {
    await SR5_ActorHelper._socketDeleteItemFromPan({
      data: {
        targetItem: 'Actor.npc.Item.x', actorId: 'pc', index: "0"
      }
    }, 'owner')
    expect(SR5_ActorHelper.deleteItemFromPan).toHaveBeenCalledWith('Actor.npc.Item.x', 'pc', null)
  })
})

describe("the sustained effect sockets", () => {
  let spell, effect, gmItem
  beforeEach(() => {
    const pc = {
      testUserPermission: owned('owner')
    }
    const target = {
      testUserPermission: owned('target')
    }
    spell = {
      uuid: 'Actor.pc.Item.spell', type: 'itemSpell', documentName: 'Item', parent: pc, system: {
        isActive: false, targetOfEffect: [], duration: 'sustained'
      }
    }
    effect = {
      uuid: 'Actor.t.Item.eff', type: 'itemEffect', documentName: 'Item', parent: target, system: {
        ownerItem: 'Actor.pc.Item.spell', durationType: 'sustained'
      }
    }
    gmItem = {
      uuid: 'Actor.gm.Item.cyber', type: 'itemAugmentation', documentName: 'Item', parent: {
        testUserPermission: owned()
      }, system: {
      }
    }
    Object.assign(docs, {
      [spell.uuid]: spell, [effect.uuid]: effect, [gmItem.uuid]: gmItem
    })
    users.target = {
      id: 'target', isGM: false
    }
    vi.spyOn(SR5_ActorHelper, 'deleteSustainedEffect').mockResolvedValue()
    vi.spyOn(SR5_ActorHelper, 'linkEffectToSource').mockResolvedValue()
    const spent = new Set()
    vi.spyOn(SR5_MiscellaneousHelpers, 'consume').mockImplementation(async key => !spent.has(key) && !!spent.add(key))
  })

  it("deleteSustainedEffect never lifts the effect of a spell that is not sustained (Harriet's second review)", async () => {
    spell.system.duration = 'instant'
    await SR5_ActorHelper._socketDeleteSustainedEffect({
      data: {
        targetItem: effect.uuid
      }
    }, 'owner')
    expect(SR5_ActorHelper.deleteSustainedEffect).not.toHaveBeenCalled()
  })

  it("deleteSustainedEffect never deletes an item that is no effect of the sender's spell", async () => {
    await SR5_ActorHelper._socketDeleteSustainedEffect({
      data: {
        targetItem: gmItem.uuid
      }
    }, 'owner')
    expect(SR5_ActorHelper.deleteSustainedEffect).not.toHaveBeenCalled()
  })

  it("deleteSustainedEffect lifts the effect of a spell its caster stopped sustaining", async () => {
    spell.system.isActive = true
    await SR5_ActorHelper._socketDeleteSustainedEffect({
      data: {
        targetItem: effect.uuid
      }
    }, 'owner')
    expect(SR5_ActorHelper.deleteSustainedEffect).not.toHaveBeenCalled()
    spell.system.isActive = false
    await SR5_ActorHelper._socketDeleteSustainedEffect({
      data: {
        targetItem: effect.uuid
      }
    }, 'owner')
    expect(SR5_ActorHelper.deleteSustainedEffect).toHaveBeenCalledWith(effect.uuid)
  })

  it("deleteSustainedEffect never lifts an effect that does not last while sustained (Harriet's review)", async () => {
    effect.system.durationType = 'round'
    await SR5_ActorHelper._socketDeleteSustainedEffect({
      data: {
        targetItem: effect.uuid
      }
    }, 'owner')
    expect(SR5_ActorHelper.deleteSustainedEffect).not.toHaveBeenCalled()
  })

  it("linkEffectToSource never switches on a source on the word of the effect's ownerItem (Harriet's review)", async () => {
    // The player writes ownerItem on an effect of her own actor, pointing at a GM's spell: no card of that spell
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(null)
    await SR5_ActorHelper._socketLinkEffectToSource({
      data: {
        actorId: 'pc', targetItem: spell.uuid, effectUuid: effect.uuid, messageId: 'forged'
      }
    }, 'target')
    // A card of her own that names the GM's spell does not stand for it
    SR5_MiscellaneousHelpers.cardOf.mockReturnValue({
      data: {
        owner: {
          itemUuid: spell.uuid
        }
      }, roller: {
        uuid: 'Actor.herPc'
      }
    })
    await SR5_ActorHelper._socketLinkEffectToSource({
      data: {
        actorId: 'pc', targetItem: spell.uuid, effectUuid: effect.uuid, messageId: 'hers'
      }
    }, 'target')
    expect(SR5_ActorHelper.linkEffectToSource).not.toHaveBeenCalled()
  })

  it("linkEffectToSource only links an effect of that source, on an actor the sender owns", async () => {
    spell.parent.uuid = 'Actor.pc'
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockImplementation(id => (id === 'm1' ? {
      data: {
        owner: {
          itemUuid: spell.uuid
        }
      }, roller: spell.parent
    } : null))
    await SR5_ActorHelper._socketLinkEffectToSource({
      data: {
        targetItem: spell.uuid, effectUuid: gmItem.uuid
      }
    }, 'owner')
    await SR5_ActorHelper._socketLinkEffectToSource({
      data: {
        targetItem: spell.uuid, effectUuid: effect.uuid
      }
    }, 'stranger')
    expect(SR5_ActorHelper.linkEffectToSource).not.toHaveBeenCalled()
    await SR5_ActorHelper._socketLinkEffectToSource({
      data: {
        actorId: 'pc', targetItem: spell.uuid, effectUuid: effect.uuid, messageId: 'm1'
      }
    }, 'target')
    expect(SR5_ActorHelper.linkEffectToSource).toHaveBeenCalledWith('pc', spell.uuid, effect.uuid)
    // The same card shown again switches nothing back on (Harriet's second review)
    await SR5_ActorHelper._socketLinkEffectToSource({
      data: {
        actorId: 'pc', targetItem: spell.uuid, effectUuid: effect.uuid, messageId: 'm1'
      }
    }, 'target')
    expect(SR5_ActorHelper.linkEffectToSource).toHaveBeenCalledTimes(1)
  })
})

describe("the mark sockets", () => {
  beforeEach(() => {
    docs.decker = {
      id: 'decker', testUserPermission: owned('owner')
    }
    docs.ai = {
      uuid: 'Actor.ai', documentName: 'Actor', testUserPermission: owned('owner')
    }
    docs['Actor.gm.Item.host'] = {
      uuid: 'Actor.gm.Item.host', documentName: 'Item', parent: {
        testUserPermission: owned()
      }
    }
    vi.spyOn(SR5_ActorHelper, 'deleteMarksOnActor').mockResolvedValue()
    vi.spyOn(SR5_ActorHelper, 'deleteMarkInfo').mockResolvedValue()
  })

  it("deleteMarksOnActor is refused from a player who does not own the marker", async () => {
    await SR5_ActorHelper._socketDeleteMarksOnActor({
      data: {
        actorData: {
          matrix: {
            markedItems: []
          }
        }, actorId: 'decker'
      }
    }, 'stranger')
    expect(SR5_ActorHelper.deleteMarksOnActor).not.toHaveBeenCalled()
  })

  it("deleteMarkInfo only forgets marks placed on what the sender owns", async () => {
    await SR5_ActorHelper._socketDeleteMarkInfo({
      data: {
        actorId: 'decker', item: 'Actor.gm.Item.host', exact: true
      }
    }, 'stranger')
    expect(SR5_ActorHelper.deleteMarkInfo).not.toHaveBeenCalled()
    await SR5_ActorHelper._socketDeleteMarkInfo({
      data: {
        actorId: 'decker', item: 'Actor.ai', exact: true
      }
    }, 'owner')
    expect(SR5_ActorHelper.deleteMarkInfo).toHaveBeenCalledWith('decker', 'Actor.ai', true)
  })
})
