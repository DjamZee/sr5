// The living persona of a technomancer, kept by the system (decision of DjamZ, 07/10, way B).
//
// SR5 p. 236: a technomancer's living persona is bound to no device; it exists in the Matrix as long as she is awake,
// unless she unplugs on purpose. SR5 p. 253: its Device Rating is her Resonance, its attributes come from her mental
// attributes, it runs no program, and it is no device: neither master nor slave of a network, part of no PAN or WAN.
// Kill Code p. 107, quality "Fusion avec la matrice": 2 Karma, the persona may be a slave of a deck or a commlink;
// 8 Karma, it may be the master of a PAN of Resonance x 3 slaves; 10 Karma, both.
//
// The persona stays an itemDevice of type livingPersona, so that the marks put on it, the cards that aim at it
// (target.itemUuid), its defense and its resistance keep working as they did. What the system adds:
// - every technomancer (activeSpecialAttribute "resonance") has one, created by the active gamemaster alone when it
//   is missing (Rosalie's technomancer with no persona, 07/10), and marked system.managed;
// - a managed persona cannot be deleted while its actor is a technomancer, nor turned into another kind of device;
// - which device is in use stays the player's choice: a technomancer who connects through a commlink to hide what
//   she is (SR5 p. 253, Data Trails p. 63) keeps that choice, and the persona is created switched off beside it.
// The rules below have no Foundry in them, so that tests can read them.

export function isTechnomancer(actor){
  return !!actor && (actor.type === "actorPc" || actor.type === "actorGrunt") &&
    actor.system?.activeSpecialAttribute === "resonance"
}

export function isLivingPersona(item){
  return item?.type === "itemDevice" && item.system?.type === "livingPersona"
}

function itemsOf(actor){
  const list = actor?.items
  if (!list) return []
  return Array.isArray(list) ? list : Array.from(list)
}

// The persona the system keeps: the managed one, else the first living persona of the actor
export function personaOf(actor){
  const personas = itemsOf(actor).filter(isLivingPersona)
  return personas.find(i => i.system?.managed) ?? personas[0] ?? null
}

/**
 * What the active gamemaster has to write so that a technomancer has her persona.
 * @param {Object} actor
 * @param {String} name   the name of a new persona (localized)
 * @return {{create: Object|null, update: Object|null}}  the data of the item to create, or the update that marks an
 *                                                       existing persona as managed; both null when nothing is due
 */
export function personaRepairPlan(actor, name = "Persona incarné"){
  const plan = {
    create: null, update: null
  }
  if (!isTechnomancer(actor)) return plan
  const persona = personaOf(actor)
  if (persona) {
    if (!persona.system?.managed) plan.update = {
      _id: persona.id ?? persona._id, "system.managed": true
    }
    return plan
  }
  // Switched on only when no other device is in use: a commlink in use is the player's choice (her cover)
  const inUse = itemsOf(actor).some(i => i.type === "itemDevice" && i.system?.isActive)
  plan.create = {
    name,
    type: "itemDevice",
    system: {
      type: "livingPersona", managed: true, isActive: !inUse, wirelessTurnedOn: true
    },
  }
  return plan
}

// Can this item be deleted? A managed persona cannot, while its actor is a technomancer
export function canDeletePersona(item){
  return !(isLivingPersona(item) && item.system?.managed && isTechnomancer(item.parent))
}

/**
 * Does an update turn a managed persona into another kind of device? Such a change is refused.
 * @param {Object} item   the persona
 * @param {Object} data   the update (nested or flat)
 */
export function changesPersonaType(item, data){
  if (!isLivingPersona(item) || !item.system?.managed) return false
  const flat = data?.["system.type"]
  const nested = data?.system?.type
  const asked = flat !== undefined ? flat : nested
  return asked !== undefined && asked !== "livingPersona"
}

/**
 * How many slaves the living persona takes: none (SR5 p. 253).
 */
export function personaPanMax(){
  return 0
}

