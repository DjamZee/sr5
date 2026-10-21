import {
  attitudeShift, shiftAttitude, scoreOf, oneFactionPerMember
} from "./faction-rules.js"
import {
  updateLedger
} from "../system/gm-ledger.js"

// Faction Reputation (Cutting Aces p. 156-160): one hidden world setting, written by the active
// gamemaster only. A player's client reads it (attitude of a social test, her own scores) but never
// writes it: who belongs to a faction and what a character is worth to it stay the gamemaster's.
//
// Shape: {factions: [{id, name, type, enemies: [id], members: [actorId], contacts: [itemUuid], note}],
//         log: [{id, factionId, actorId, reason, delta, pending, time, note}],
//         raises: {contactUuid: worldTime}}
// A score is the sum of the applied (not pending) movements: the log is the faction journal.
export const FACTIONS_SETTING = "sr5Factions"

const EMPTY = () => ({
  factions: [], log: [], raises: {
  }
})

export class SR5FactionRegistry {

  static register(){
    game.settings.register("sr5", FACTIONS_SETTING, {
      scope: "world", config: false, type: Object, default: EMPTY(),
      onChange: () => SR5FactionRegistry.#refresh(),
    })
  }

  static get data(){
    const raw = game.settings.get("sr5", FACTIONS_SETTING) ?? {
    }
    return {
      factions: raw.factions ?? [], log: raw.log ?? [], raises: raw.raises ?? {
      }
    }
  }

  static get canWrite(){
    return !!game.user?.isActiveGM
  }

  /**
   * True, with a warning, when this user may not write the registry (not the active gamemaster).
   * Every action that changes something calls it first, before any other effect.
   */
  static refuse(){
    if (this.canWrite) return false
    ui.notifications?.warn(game.i18n.localize("SR5.FACTION_OnlyGM"))
    return true
  }

  /**
   * Applies a change to a copy of the registry and saves it. Refused, with a warning, off the active GM.
   * The book's rule is kept whatever `mutate` does: one main faction per non-player character and per contact
   * (CA p. 156, oneFactionPerMember: the faction just joined wins). `mutate` must be synchronous: one that returns a
   * promise writes nothing (what it would write after its first await would be lost).
   * @param {(data:object) => void} mutate
   * @returns {Promise<boolean>} true once saved
   */
  static async update(mutate){
    if (this.refuse()) return false
    // In the registry's turn, on its latest state (gm-ledger.js)
    return updateLedger(FACTIONS_SETTING, raw => {
      const before = foundry.utils.deepClone(raw ?? {
      })
      const data = {
        factions: raw.factions ?? [], log: raw.log ?? [], raises: raw.raises ?? {
        }
      }
      const result = mutate(data)
      if (typeof result?.then === "function") {
        console.error("SR5 | factionRegistry.update: an async change is refused, nothing written")
        return null
      }
      return oneFactionPerMember(before, data)
    })
  }

  static faction(id){
    return this.data.factions.find(f => f.id === id) ?? null
  }

  static factionOfActor(actorId){
    if (!actorId) return null
    return this.data.factions.find(f => f.members?.includes(actorId)) ?? null
  }

  static factionOfContact(uuid){
    if (!uuid) return null
    return this.data.factions.find(f => f.contacts?.includes(uuid)) ?? null
  }

  static score(factionId, actorId){
    return scoreOf(this.data.log, factionId, actorId)
  }

  /**
   * A character's standing with each faction she has dealt with (a movement in the log).
   */
  static standing(actorId){
    const {
      factions, log
    } = this.data
    return factions
      .filter(f => log.some(e => e.factionId === f.id && e.actorId === actorId))
      .map(f => {
        const score = scoreOf(log, f.id, actorId)
        return {
          id: f.id, name: f.name, score, shift: attitudeShift(score),
          pending: log.filter(e => e.pending && e.factionId === f.id && e.actorId === actorId)
            .reduce((s, e) => s + (Number(e.delta) || 0), 0),
        }
      })
  }

  /**
   * The default NPC attitude of a social test (SR5 p. 142), moved by the character's Faction
   * Reputation with the target's faction (CA p. 160). Null when the target has no faction.
   */
  static attitudeFor(actorId, targetActor){
    const faction = this.factionOfActor(targetActor?.id)
    if (!faction || !actorId) return null
    const score = this.score(faction.id, actorId)
    const shift = attitudeShift(score)
    return {
      faction: faction.name, score, shift, attitude: shiftAttitude("neutral", shift)
    }
  }

  static #refresh(){
    for (const app of foundry.applications.instances.values()){
      if (app.rendered && (app.id === "sr5-factions" || app.document?.type === "actorPc")) app.render()
    }
  }
}

/**
 * The registry for the modules: game.sr5.factionRegistry. Exactly these, no more (there is no createFaction nor
 * affiliate here: a module creates a faction or affiliates a member by update()):
 * - data: a copy of {factions: [{id, name, type, enemies: [id], members: [actorId], contacts: [itemUuid], note}],
 *   log: [{id, factionId, actorId, reason, delta, pending, time, note}], raises: {contactUuid: worldTime}};
 * - canWrite: true on the active gamemaster's browser only;
 * - faction(id), factionOfActor(actorId), factionOfContact(itemUuid): a copy of the faction, or null;
 * - score(factionId, actorId): the applied movements' sum; standing(actorId): [{id, name, score, shift, pending}];
 * - attitudeFor(actorId, targetActor): {faction, score, shift, attitude} of a social test (CA p. 160), or null;
 * - update(mutate): the active gamemaster only (false, with a warning, elsewhere), in the registry's turn
 *   (gm-ledger.js). `mutate(data)` changes `data` in place, synchronously (an async one writes nothing). After it, one
 *   main faction per member and per contact (CA p. 156): a member listed in two factions stays in the one it just
 *   joined. The system does not check the rest: unique ids, a known faction in `enemies`, a reciprocal enmity are
 *   the module's to keep. Example, affiliate an NPC:
 *   update(d => d.factions.find(f => f.id === id).members.push(actorId)) — it leaves its former faction.
 * Every read gives a copy, so a module never edits the setting's cache.
 */
export const factionRegistryApi = () => {
  const copy = value => foundry.utils.deepClone(value ?? null)
  return Object.freeze({
    get data(){
      return copy(SR5FactionRegistry.data)
    },
    get canWrite(){
      return SR5FactionRegistry.canWrite
    },
    faction: id => copy(SR5FactionRegistry.faction(id)),
    factionOfActor: actorId => copy(SR5FactionRegistry.factionOfActor(actorId)),
    factionOfContact: uuid => copy(SR5FactionRegistry.factionOfContact(uuid)),
    score: (factionId, actorId) => SR5FactionRegistry.score(factionId, actorId),
    standing: actorId => SR5FactionRegistry.standing(actorId),
    attitudeFor: (actorId, targetActor) => SR5FactionRegistry.attitudeFor(actorId, targetActor),
    update: mutate => SR5FactionRegistry.update(mutate),
  })
}
