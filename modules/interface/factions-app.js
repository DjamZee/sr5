import {
  SR5FactionRegistry
} from "./faction-registry.js"
import {
  FACTION_TYPES, FACTION_REASONS, FACTION_SPENDS, ENEMY_REASON,
  attitudeShift, canSpend, longConPenalty, sameGameMonth
} from "./faction-rules.js"
import {
  worldTimeToComponents, calendarStartYear
} from "../system/calendar.js"

const newId = () => foundry.utils.randomID()

/**
 * The gamemaster's Faction Reputation tool (Cutting Aces p. 156-160): factions and their members,
 * movements of the p. 157 table (pending until the end of the mission, like Karma), spending of p. 160,
 * and the journal. Everything goes through SR5FactionRegistry, which only the active gamemaster writes.
 */
export class SR5FactionsApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: "sr5-factions",
    classes: ["sr5", "sr-application", "sr-factions"],
    position: {
      width: 760, height: 720
    },
    window: {
      title: "SR5.FACTION_Title", icon: "fas fa-people-group", resizable: true
    },
    actions: {
      createFaction: SR5FactionsApp.#createFaction,
      deleteFaction: SR5FactionsApp.#deleteFaction,
      editFaction: SR5FactionsApp.#editFaction,
      addTokens: SR5FactionsApp.#addTokens,
      removeMember: SR5FactionsApp.#removeMember,
      addContact: SR5FactionsApp.#addContact,
      removeContact: SR5FactionsApp.#removeContact,
      addMovement: SR5FactionsApp.#addMovement,
      applyPending: SR5FactionsApp.#applyPending,
      deleteEntry: SR5FactionsApp.#deleteEntry,
      spend: SR5FactionsApp.#spend,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/factions.hbs", scrollable: [""]
    }
  }

  static open(){
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("SR5.FACTION_OnlyGM"))
    const app = foundry.applications.instances.get("sr5-factions") ?? new SR5FactionsApp()
    return app.render({
      force: true
    })
  }

  static get characters(){
    return game.actors.filter(a => a.type === "actorPc").sort((a, b) => a.name.localeCompare(b.name))
  }

  static get contacts(){
    return this.characters.flatMap(pc => pc.items.filter(i => i.type === "itemContact")
      .map(c => ({
        uuid: c.uuid, label: `${c.name} (${pc.name})`
      })))
  }

  async _prepareContext(options){
    const context = await super._prepareContext(options)
    const {
      factions, log
    } = SR5FactionRegistry.data
    const name = id => game.actors.get(id)?.name ?? "?"
    const contacts = SR5FactionsApp.contacts
    const contactLabel = uuid => contacts.find(c => c.uuid === uuid)?.label ?? "?"
    const fname = id => factions.find(f => f.id === id)?.name ?? "?"
    const pcs = SR5FactionsApp.characters

    context.canWrite = SR5FactionRegistry.canWrite
    context.types = Object.fromEntries(FACTION_TYPES.map(t => [t, `SR5.FACTION_Type_${t}`]))
    context.factions = factions.map(f => ({
      ...f,
      typeLabel: `SR5.FACTION_Type_${f.type}`,
      enemyNames: (f.enemies ?? []).map(fname).join(", "),
      memberList: (f.members ?? []).map(id => ({
        id, name: name(id)
      })),
      contactList: (f.contacts ?? []).map(uuid => ({
        uuid, label: contactLabel(uuid)
      })),
      scores: pcs.map(pc => {
        const score = SR5FactionRegistry.score(f.id, pc.id)
        return {
          id: pc.id, name: pc.name, score, shift: attitudeShift(score) 
        }
      }).filter(s => log.some(e => e.factionId === f.id && e.actorId === s.id)),
    }))
    context.characters = pcs.map(pc => ({
      id: pc.id, name: pc.name
    }))
    context.contacts = contacts
    context.reasons = Object.entries(FACTION_REASONS).map(([key, value]) => ({
      key, value, label: `SR5.FACTION_Reason_${key}`
    }))
    context.spends = Object.entries(FACTION_SPENDS).map(([key, value]) => ({
      key, value, label: `SR5.FACTION_Spend_${key}`
    }))
    context.log = [...log].reverse().map(e => ({
      ...e, faction: fname(e.factionId), actor: name(e.actorId),
      reasonLabel: `SR5.FACTION_${e.reason?.startsWith("spend:") ? `Spend_${e.reason.slice(6)}` : `Reason_${e.reason}`}`,
    }))
    context.pendingCount = log.filter(e => e.pending).length
    return context
  }

  _onRender(context, options){
    super._onRender?.(context, options)
    // A gamemaster who is not the active one reads, but cannot act: every control is off
    if (!SR5FactionRegistry.canWrite){
      for (const el of this.element.querySelectorAll("button, input, select, textarea")) el.disabled = true
      for (const el of this.element.querySelectorAll("a[data-action]")) el.classList.add("disabled")
    }
    // The reason prefills the points with the book's value (p. 157); the gamemaster may change them
    const reason = this.element.querySelector("[name=reason]")
    const delta = this.element.querySelector("[name=delta]")
    reason?.addEventListener("change", () => {
      delta.value = FACTION_REASONS[reason.value] ?? 0
    })
  }

  #value(name){
    return this.element.querySelector(`[name="${name}"]`)?.value ?? ""
  }

  #checked(name){
    return [...this.element.querySelectorAll(`[name="${name}"]:checked`)].map(el => el.value)
  }

  static async #createFaction(){
    if (SR5FactionRegistry.refuse()) return
    const name = this.#value("newName").trim()
    if (!name) return
    const type = this.#value("newType") || "other"
    await SR5FactionRegistry.update(d => d.factions.push({
      id: newId(), name, type, enemies: [], members: [], contacts: [], note: ""
    }))
  }

  static async #deleteFaction(event, target){
    if (SR5FactionRegistry.refuse()) return
    const id = target.dataset.faction
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("SR5.FACTION_Delete")
      },
      content: `<p>${game.i18n.format("SR5.FACTION_DeleteConfirm", {
        name: SR5FactionRegistry.faction(id)?.name ?? ""
      })}</p>`,
    })
    if (!ok) return
    await SR5FactionRegistry.update(d => {
      d.factions = d.factions.filter(f => f.id !== id)
      for (const f of d.factions) f.enemies = (f.enemies ?? []).filter(e => e !== id)
      d.log = d.log.filter(e => e.factionId !== id)
    })
  }

  // Name, type, enemies (p. 157: the gamemaster decides which factions are enemies) and a note
  static async #editFaction(event, target){
    if (SR5FactionRegistry.refuse()) return
    const id = target.dataset.faction
    const f = SR5FactionRegistry.faction(id)
    if (!f) return
    const others = SR5FactionRegistry.data.factions.filter(o => o.id !== id)
    const esc = foundry.utils.escapeHTML ?? (s => s)
    const typeOptions = FACTION_TYPES.map(t => `<option value="${t}" ${t === f.type ? "selected" : ""}>${game.i18n.localize(`SR5.FACTION_Type_${t}`)}</option>`).join("")
    const enemyBoxes = others.map(o => `<label class="checkbox"><input type="checkbox" name="enemy" value="${o.id}" ${f.enemies?.includes(o.id) ? "checked" : ""}> ${esc(o.name)}</label>`).join("") || `<p class="hint">—</p>`
    const result = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: f.name
      },
      content: `<div class="form-group"><label>${game.i18n.localize("SR5.FACTION_Name")}</label><input type="text" name="name" value="${esc(f.name)}"></div>
        <div class="form-group"><label>${game.i18n.localize("SR5.FACTION_Type")}</label><select name="type">${typeOptions}</select></div>
        <fieldset><legend>${game.i18n.localize("SR5.FACTION_Enemies")}</legend>${enemyBoxes}</fieldset>
        <div class="form-group"><label>${game.i18n.localize("SR5.FACTION_Note")}</label><textarea name="note">${esc(f.note ?? "")}</textarea></div>`,
      ok: {
        callback: (ev, button) => {
          const form = button.form
          return {
            name: form.elements.name.value.trim() || f.name,
            type: form.elements.type.value,
            note: form.elements.note.value,
            enemies: [...form.querySelectorAll("[name=enemy]:checked")].map(el => el.value),
          }
        }
      },
      rejectClose: false,
    })
    if (!result) return
    await SR5FactionRegistry.update(d => {
      Object.assign(d.factions.find(x => x.id === id), result)
      // Enmity runs both ways
      for (const o of d.factions){
        if (o.id === id) continue
        const set = new Set(o.enemies ?? [])
        if (result.enemies.includes(o.id)) set.add(id)
        else set.delete(id)
        o.enemies = [...set]
      }
    })
  }

  // The selected tokens join the faction; a non-player character has one main faction only (p. 156)
  static async #addTokens(event, target){
    if (SR5FactionRegistry.refuse()) return
    const id = target.dataset.faction
    const ids = [...new Set((canvas.tokens?.controlled ?? []).map(t => t.document.actorId).filter(Boolean))]
      .filter(a => game.actors.get(a)?.type !== "actorPc")
    if (!ids.length) return ui.notifications.info(game.i18n.localize("SR5.FACTION_NoToken"))
    await SR5FactionRegistry.update(d => {
      for (const f of d.factions) f.members = (f.members ?? []).filter(m => !ids.includes(m))
      const f = d.factions.find(x => x.id === id)
      f.members = [...f.members, ...ids]
    })
  }

  static async #removeMember(event, target){
    if (SR5FactionRegistry.refuse()) return
    const {
      faction, member
    } = target.dataset
    await SR5FactionRegistry.update(d => {
      const f = d.factions.find(x => x.id === faction)
      f.members = f.members.filter(m => m !== member)
    })
  }

  static async #addContact(event, target){
    if (SR5FactionRegistry.refuse()) return
    const id = target.dataset.faction
    const uuid = this.element.querySelector(`[name="contact-${id}"]`)?.value
    if (!uuid) return
    await SR5FactionRegistry.update(d => {
      for (const f of d.factions) f.contacts = (f.contacts ?? []).filter(c => c !== uuid)
      d.factions.find(x => x.id === id).contacts.push(uuid)
    })
  }

  static async #removeContact(event, target){
    if (SR5FactionRegistry.refuse()) return
    const {
      faction, contact
    } = target.dataset
    await SR5FactionRegistry.update(d => {
      const f = d.factions.find(x => x.id === faction)
      f.contacts = f.contacts.filter(c => c !== contact)
    })
  }

  // A movement of the p. 157 table, for one or several characters. Pending by default:
  // "apply the effects at the end of a typical mission, at the same time as Karma".
  static async #addMovement(){
    if (SR5FactionRegistry.refuse()) return
    const factionId = this.#value("mvFaction")
    const actors = this.#checked("mvActor")
    const reason = this.#value("reason") || "custom"
    let delta = Number(this.#value("delta")) || 0
    const days = Number(this.#value("days")) || 0
    if (reason === "longConDetected" && days > 0) delta = longConPenalty(days)
    const pending = this.element.querySelector("[name=pending]")?.checked ?? true
    const enemies = this.element.querySelector("[name=enemiesToo]")?.checked && reason === "advanceGoals"
    const note = this.#value("mvNote")
    if (!factionId || !actors.length) return ui.notifications.info(game.i18n.localize("SR5.FACTION_PickFactionActor"))
    const time = game.time.worldTime
    await SR5FactionRegistry.update(d => {
      const f = d.factions.find(x => x.id === factionId)
      for (const actorId of actors){
        d.log.push({
          id: newId(), factionId, actorId, reason, delta, pending, time, note
        })
        if (enemies) for (const enemy of f?.enemies ?? []){
          d.log.push({
            id: newId(), factionId: enemy, actorId, reason: ENEMY_REASON,
            delta: FACTION_REASONS[ENEMY_REASON], pending, time, note: f.name,
          })
        }
      }
    })
  }

  static async #applyPending(){
    if (SR5FactionRegistry.refuse()) return
    await SR5FactionRegistry.update(d => {
      for (const e of d.log) e.pending = false
    })
  }

  static async #deleteEntry(event, target){
    if (SR5FactionRegistry.refuse()) return
    const id = target.dataset.entry
    await SR5FactionRegistry.update(d => {
      d.log = d.log.filter(e => e.id !== id)
    })
  }

  // Spending positive Faction Reputation (p. 159-160): never below zero
  static async #spend(){
    if (SR5FactionRegistry.refuse()) return
    const factionId = this.#value("spFaction")
    const actorId = this.#value("spActor")
    const kind = this.#value("spKind")
    const cost = FACTION_SPENDS[kind]
    const actor = game.actors.get(actorId)
    const faction = SR5FactionRegistry.faction(factionId)
    if (!faction || !actor || cost === undefined) return ui.notifications.info(game.i18n.localize("SR5.FACTION_PickFactionActor"))
    const score = SR5FactionRegistry.score(factionId, actorId)
    if (!canSpend(score, cost)){
      return ui.notifications.warn(game.i18n.format("SR5.FACTION_NotEnough", {
        score, cost
      }))
    }
    const raise = {
    }
    switch (kind){
      case "contactInfluence": {
        const uuid = this.#value("spContact")
        const contact = uuid ? await fromUuid(uuid) : null
        if (!contact || contact.parent?.id !== actorId || !faction.contacts?.includes(uuid)){
          return ui.notifications.warn(game.i18n.localize("SR5.FACTION_ContactNotInFaction"))
        }
        // Once a month per contact (p. 159): a warning, the gamemaster decides
        const start = calendarStartYear()
        const last = SR5FactionRegistry.data.raises[uuid]
        if (last !== undefined && sameGameMonth(worldTimeToComponents(last, start), worldTimeToComponents(game.time.worldTime, start))){
          const ok = await foundry.applications.api.DialogV2.confirm({
            window: {
              title: contact.name
            },
            content: `<p>${game.i18n.localize("SR5.FACTION_OnceAMonth")}</p>`,
          })
          if (!ok) return
        }
        await contact.update({
          "system.connection": (Number(contact.system.connection) || 0) + 1
        })
        raise[uuid] = game.time.worldTime
        break
      }
      case "newContact": {
        const result = await foundry.applications.api.DialogV2.prompt({
          window: {
            title: game.i18n.localize("SR5.FACTION_Spend_newContact")
          },
          content: `<div class="form-group"><label>${game.i18n.localize("SR5.FACTION_Name")}</label><input type="text" name="name"></div>
            <div class="form-group"><label>${game.i18n.localize("SR5.FACTION_Influence")}</label><input type="number" name="influence" value="1" min="1"></div>`,
          ok: {
            callback: (ev, button) => ({
              name: button.form.elements.name.value.trim(),
              influence: Number(button.form.elements.influence.value) || 1,
            })
          },
          rejectClose: false,
        })
        if (!result?.name) return
        // Loyalty 1, Influence set by the gamemaster, affiliated with the faction (p. 160)
        const [item] = await actor.createEmbeddedDocuments("Item", [{
          name: result.name, type: "itemContact", system: {
            connection: result.influence, loyalty: 1
          }
        }])
        await SR5FactionRegistry.update(d => d.factions.find(x => x.id === factionId).contacts.push(item.uuid))
        break
      }
      case "streetCred":
      case "notoriety":
        await actor.createEmbeddedDocuments("Item", [{
          name: `${game.i18n.localize(`SR5.FACTION_Spend_${kind}`)} (${faction.name})`,
          type: "itemReputation",
          system: {
            reputationType: kind, type: kind === "streetCred" ? "gain" : "loss", amount: 1
          },
        }])
        break
    }
    await SR5FactionRegistry.update(d => {
      d.log.push({
        id: newId(), factionId, actorId, reason: `spend:${kind}`, delta: -cost, pending: false,
        time: game.time.worldTime, note: "",
      })
      Object.assign(d.raises, raise)
    })
  }
}
