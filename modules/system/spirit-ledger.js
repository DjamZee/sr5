// Spirit Index, Wild Index, the reputation adjustment and the hermetic elementalist (Street Grimoire p. 207,
// Forbidden Arcana p. 169-175), and the net hits piled up against a wild spirit (p. 172).
// A player owns her character sheet and the server accepts her writes to it, whatever the client says: these values
// live in a hidden world setting that the active gamemaster alone writes (same method as the hunger ledger).
// Characters are keyed by actor id, a banished spirit by its token's uuid when it is not linked, its actor id otherwise.
import {
  updateLedger
} from "./gm-ledger.js"

export const SPIRIT_LEDGER = "sr5SpiritLedger"
export const CHARACTER_FIELDS = ["spiritIndex", "astralReputationAdjustment", "wildIndex", "hermeticElementalist"]

export function emptyLedger(){
  return {
    characters: {
    }, banish: {
    }, spirits: {
    }
  }
}

// The values of one character, with their defaults
export function characterEntry(ledger, actorId){
  const entry = ledger?.characters?.[actorId] ?? {
  }
  return {
    spiritIndex: Number(entry.spiritIndex) || 0,
    astralReputationAdjustment: Number(entry.astralReputationAdjustment) || 0,
    wildIndex: Number(entry.wildIndex) || 0,
    hermeticElementalist: !!entry.hermeticElementalist,
  }
}

// A new ledger with one field of one character changed; unknown fields are refused
export function withCharacterField(ledger, actorId, field, value){
  if (!CHARACTER_FIELDS.includes(field)) throw new Error(`unknown spirit ledger field ${field}`)
  const next = foundryCopy(ledger)
  next.characters[actorId] = {
    ...characterEntry(next, actorId), [field]: field === "hermeticElementalist" ? !!value : (Number(value) || 0)
  }
  return next
}

// Spirit traits the gamemaster sets (Forbidden Arcana p. 172-175), keyed like a banished spirit; and the magic pact
// of a free spirit (Street Grimoire p. 133), the only way a spirit spends the Edge of its character (SR5 p. 58)
export const SPIRIT_TRAITS = ["isElemental", "isWild", "hasDomain", "magicPact"]
export function spiritEntry(ledger, key){
  const entry = ledger?.spirits?.[key] ?? {
  }
  return Object.fromEntries(SPIRIT_TRAITS.map(t => [t, !!entry[t]]))
}
export function withSpiritTrait(ledger, key, trait, value){
  if (!SPIRIT_TRAITS.includes(trait)) throw new Error(`unknown spirit trait ${trait}`)
  const next = foundryCopy(ledger)
  next.spirits[key] = {
    ...spiritEntry(next, key), [trait]: !!value
  }
  return next
}

// A banishing card counts once: its message id is kept, whatever the button state on the card says
export function banishCardSeen(ledger, messageId){
  return !!ledger?.banishSeen?.[messageId]
}
export function withBanishTotal(ledger, key, total, messageId){
  const next = foundryCopy(ledger)
  if (messageId) next.banishSeen[messageId] = true
  if (total > 0) next.banish[key] = total
  else delete next.banish[key]
  return next
}

// Values left on an actor by the first version of this feature (never published): moved to the ledger once
// The actors that read the ledger and must be prepared again when it changes, on every client: the world actors,
// and the synthetic actors of the unlinked tokens of every scene, which game.actors does not hold
export function ledgerReaders(actors, scenes){
  const found = [...(actors ?? [])]
  for (const scene of scenes ?? []) for (const token of scene.tokens ?? []) {
    if (!token.actorLink && token.actor) found.push(token.actor)
  }
  return found.filter(a => a.system?.magic || a.type === "actorSpirit")
}

export function legacyValues(magic){
  const found = {
  }
  for (const field of CHARACTER_FIELDS) {
    const value = magic?.[field]
    if (field === "hermeticElementalist" ? value === true : Number(value)) found[field] = value
  }
  return Object.keys(found).length ? found : null
}

function foundryCopy(ledger){
  return {
    migrated: !!ledger?.migrated,
    characters: {
      ...(ledger?.characters ?? {
      })
    },
    banish: {
      ...(ledger?.banish ?? {
      })
    },
    spirits: {
      ...(ledger?.spirits ?? {
      })
    },
    banishSeen: {
      ...(ledger?.banishSeen ?? {
      })
    },
  }
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

export function isActiveGM(){
  return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
}

export function readLedger(){
  try {
    return game.settings.get("sr5", SPIRIT_LEDGER) ?? emptyLedger()
  } catch {
    return emptyLedger()
  }
}

export function banishKey(actor){
  return actor?.isToken ? actor.token.uuid : actor?.id
}

// The traits of a spirit: those of its world actor, then those of its own unlinked token when the gamemaster set
// some there, which win
export function spiritTraitsFor(ledger, baseId, tokenKey){
  const traits = spiritEntry(ledger, baseId)
  if (tokenKey && ledger?.spirits?.[tokenKey]) Object.assign(traits, spiritEntry(ledger, tokenKey))
  return traits
}

// `change` makes the next ledger from its latest state, in its turn (gm-ledger.js)
async function writeLedger(change){
  if (!isActiveGM()) {
    ui.notifications.warn(game.i18n.localize("SR5.SpiritLedgerActiveGMOnly"))
    return false
  }
  return updateLedger(SPIRIT_LEDGER, ledger => change({
    ...emptyLedger(), ...ledger
  }))
}

export async function setCharacterField(actorId, field, value){
  return writeLedger(ledger => withCharacterField(ledger, actorId, field, value))
}

export async function setBanishTotal(key, total, messageId){
  return writeLedger(ledger => withBanishTotal(ledger, key, total, messageId))
}

export async function setSpiritTrait(key, trait, value){
  return writeLedger(ledger => withSpiritTrait(ledger, key, trait, value))
}

// Written over the prepared data of every client, whatever the sheet holds: the ledger is the only source.
// A character: its indexes and the elementalist; its summoned spirits (items) are Elemental when it is an
// elementalist and their type is one of the four (p. 175)
export function applyCharacterLedger(actor, elementalTypes){
  const magic = actor.system?.magic
  if (!magic) return
  const entry = characterEntry(readLedger(), actor.id)
  Object.assign(magic, entry)
  for (const item of actor.items ?? []) {
    if (item.type === "itemSpirit") item.system.isElemental = entry.hermeticElementalist && elementalTypes.includes(item.system.type)
  }
}

// A spirit: the traits the gamemaster set, Elemental too when its summoner is an elementalist; the banishing total
export function applySpiritLedger(actor, elementalTypes){
  const ledger = readLedger()
  const key = banishKey(actor)
  //An unlinked token takes the traits ticked on its world actor, unless the gamemaster ticked some on this very token;
  //its banishing total stays its own
  const traits = spiritTraitsFor(ledger, actor.id, actor.isToken ? key : null)
  const summoner = characterEntry(ledger, actor.system.creatorId)
  if (summoner.hermeticElementalist && elementalTypes.includes(actor.system.type)) traits.isElemental = true
  Object.assign(actor.system, traits)
  actor.system.wildBanishTotal = Number(ledger.banish?.[key]) || 0
}

// The active GM moves the legacy values off the sheets into the ledger, then clears them
async function migrateLegacy(){
  if (!isActiveGM()) return
  const cleared = []
  const spirits = []
  //Once only: afterwards the sheets may hold the prepared values written back by an update, never read again
  if (readLedger().migrated) return
  const written = await writeLedger(ledger => (ledger.migrated ? null : migratedLedger(ledger, spirits, cleared)))
  if (!written) return
  for (const actor of spirits) await actor.update({
    "system.isElemental": false, "system.isWild": false, "system.hasDomain": false, "system.wildBanishTotal": 0,
  })
  for (const actor of cleared) await actor.update({
    "system.magic.spiritIndex": 0, "system.magic.astralReputationAdjustment": 0, "system.magic.wildIndex": 0, "system.magic.hermeticElementalist": false,
  })
}

function migratedLedger(ledger, spirits, cleared){
  for (const actor of game.actors ?? []) {
    if (actor.type !== "actorSpirit") continue
    const source = actor._source?.system ?? {
    }
    const set = SPIRIT_TRAITS.filter(t => source[t] === true)
    if (!set.length && !(Number(source.wildBanishTotal) > 0)) continue
    for (const trait of set) ledger = withSpiritTrait(ledger, actor.id, trait, true)
    if (Number(source.wildBanishTotal) > 0) ledger = withBanishTotal(ledger, actor.id, Number(source.wildBanishTotal))
    spirits.push(actor)
  }
  for (const actor of game.actors ?? []) {
    const found = legacyValues(actor._source?.system?.magic)
    if (!found) continue
    for (const [field, value] of Object.entries(found)) ledger = withCharacterField(ledger, actor.id, field, value)
    cleared.push(actor)
  }
  ledger.migrated = true
  return ledger
}

export function registerSpiritLedger(){
  game.settings.register("sr5", SPIRIT_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: emptyLedger(),
    //Every client prepares the reputations again when the ledger changes
    onChange: () => {
      for (const actor of ledgerReaders(game.actors, game.scenes)) {
        actor.reset()
        if (actor.sheet?.rendered) actor.sheet.render()
      }
    },
  })
}

export function initSpiritLedger(){
  Hooks.once("ready", migrateLegacy)
}
