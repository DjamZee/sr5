// An explosive charge set off from the sheet (Run & Gun p. 183-208 over SR5 p. 438; rules in
// rolls/roll-helpers/explosives.js, this file reads Foundry). The bearer prepares the charge in a small window, places
// its blast on the scene, and the active GM works the explosion out from the item (a homemade lot's secret change is
// his) and posts the card everyone caught in the blast resists from, the way a grenade's is (rollData-Resistance.js).
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5
} from "../config.js"
import {
  chargeOutcome, typeRange, baseRating, detonatorFails, DIRECTIONAL_ANGLE, MATERIAL_THRESHOLDS, VEHICLE_THRESHOLDS,
} from "../rolls/roll-helpers/explosives.js"

const isActiveGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id
const esc = text => foundry.utils.escapeHTML(String(text ?? ""))

/** What the window asks, read from its form, within what the item allows */
export function chargeRequest(form, item) {
  const value = name => form?.elements?.[name]?.value
  const kilos = Math.max(0, Math.min(Number(item.system.quantity) || 0, Number(value("kilos")) || 0))
  return {
    kilos,
    hits: Math.round(Number(value("hits")) || 0),
    placement: value("placement") || "free",
    shape: value("shape") || "circular",
    gasLeak: !!form?.elements?.gasLeak?.checked,
    detonator: Math.max(0, Math.min(3, Number(value("detonator")) || 0)),
    target: value("target") || "",
  }
}

/** The outcome of a request on an item; the gamemaster's secret change counts only when asked (his own browser) */
export function outcomeOf(item, request, withSecret) {
  const ex = item.system.explosive ?? {
  }
  return chargeOutcome({
    type: ex.type, rating: item.system.itemRating, kilos: request.kilos, hits: request.hits,
    offset: withSecret && ex.homemade ? ex.gmOffset : 0, placement: request.placement, shape: request.shape, gasLeak: request.gasLeak,
  })
}

const THRESHOLDS = {
  ...Object.fromEntries(Object.entries(MATERIAL_THRESHOLDS).map(([k, v]) => [`material.${k}`, v])),
  ...Object.fromEntries(Object.entries(VEHICLE_THRESHOLDS).map(([k, v]) => [`vehicle.${k}`, v])),
}

export class SR5ExplosiveCharge extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr5", "sr-explosive-charge"],
    position: {
      width: 460, height: "auto"
    },
    window: {
      title: "SR5.EXPLOSIVE_Title", icon: "fas fa-bomb", resizable: true
    },
    form: {
      handler: undefined, submitOnChange: false, closeOnSubmit: false
    },
    tag: "form",
    actions: {
      detonate: SR5ExplosiveCharge.#detonate,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/explosive-charge.hbs"
    }
  }

  static open(item) {
    if (!item?.system?.explosive?.type) return
    if (!item.isOwner) return ui.notifications.warn(game.i18n.localize("SR5.EXPLOSIVE_NotYours"))
    new SR5ExplosiveCharge({
      item, id: `sr5-explosive-${item.id}`
    }).render({
      force: true
    })
  }

  constructor(options = {
  }) {
    super(options)
    this.item = options.item
    this.request = {
      kilos: Math.min(1, Number(this.item.system.quantity) || 0) || Number(this.item.system.quantity) || 0,
      hits: 0, placement: "placed", shape: "circular", gasLeak: false, detonator: 0, target: "",
    }
  }

  get title() {
    return `${game.i18n.localize("SR5.EXPLOSIVE_Title")} : ${this.item.name}`
  }

  async _prepareContext() {
    const item = this.item, ex = item.system.explosive
    const range = typeRange(ex.type)
    const out = outcomeOf(item, this.request, game.user.isGM)
    const threshold = THRESHOLDS[this.request.target]
    const option = (key, label) => ({
      key, label: game.i18n.localize(label), selected: key === this.request.target
    })
    return {
      item, request: this.request, out, isGM: game.user.isGM, homemade: ex.homemade, gmOffset: ex.gmOffset ?? 0,
      rating: baseRating(ex.type, item.system.itemRating), typeLabel: game.i18n.localize(SR5.explosiveTypes[ex.type] ?? ""),
      quantity: item.system.quantity, tamped: !!range?.tamped,
      estimate: ex.homemade && !game.user.isGM,
      targets: [
        ...Object.keys(MATERIAL_THRESHOLDS).map(k => option(`material.${k}`, `SR5.EXPLOSIVE_Material_${k}`)),
        ...Object.keys(VEHICLE_THRESHOLDS).map(k => option(`vehicle.${k}`, `SR5.EXPLOSIVE_Vehicle_${k}`)),
      ],
      threshold, enough: threshold !== undefined ? out.targetDV >= threshold : null,
    }
  }

  _onRender(context, options) {
    super._onRender?.(context, options)
    //The window's root stays from one render to the next: one listener is enough
    if (this._listening) return
    this._listening = true
    const form = this.element
    form.addEventListener("change", async ev => {
      if (ev.target.name === "gmOffset" && game.user.isGM) {
        const offset = Math.max(-15, Math.min(15, Math.round(Number(ev.target.value) || 0)))
        await this.item.update({
          "system.explosive.gmOffset": offset
        })
      }
      this.request = chargeRequest(form, this.item)
      this.render()
    })
  }

  /** Place the blast, then ask the active GM for the explosion */
  static async #detonate() {
    const item = this.item
    const request = chargeRequest(this.element, item)
    if (!(request.kilos > 0)) return ui.notifications.warn(game.i18n.localize("SR5.EXPLOSIVE_NoKilos"))
    if (!canvas.scene) return ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActiveScene"))
    const estimate = outcomeOf(item, request, game.user.isGM)
    const {
      default: AbilityTemplate
    } = await import("../interface/canvas-template.js")
    const template = AbilityTemplate.fromItem(item, null, {
      radius: Math.max(1, estimate.radius), angle: estimate.shape === "directional" ? DIRECTIONAL_ANGLE : 0
    })
    this.minimize()
    const created = await template.drawPreview().catch(() => null)
    const templateDoc = Array.isArray(created) ? created[0] : created
    if (!templateDoc) return this.maximize()
    const data = {
      itemUuid: item.uuid, templateId: templateDoc.id, request
    }
    this.close()
    if (isActiveGM()) return explode(data, game.user.id)
    await SR5_SocketHandler.emitForGM("explosiveDetonate", data)
  }
}

/** The active GM works the explosion out from the item, spends its kilos and posts the card */
async function explode({
  itemUuid, templateId, request
}, requesterId) {
  const item = await fromUuid(itemUuid)
  const sender = game.users.get(requesterId)
  if (!item?.system?.explosive?.type || !sender || !item.testUserPermission?.(sender, "OWNER")) return
  const req = {
    ...request, kilos: Math.max(0, Math.min(Number(item.system.quantity) || 0, Number(request.kilos) || 0))
  }
  if (!(req.kilos > 0)) return
  const out = outcomeOf(item, req, true)
  const actor = item.actor
  //RG p. 206-207: a cheap detonator may fail; the charge stays where it was set, its kilos with it
  let failed = false, rolls = []
  if (req.detonator === 1 || req.detonator === 2) {
    const roll = await new Roll("1d6").evaluate()
    rolls.push(roll)
    failed = detonatorFails(req.detonator, roll.total)
  }
  if (!failed) await item.update({
    "system.quantity": Math.max(0, (Number(item.system.quantity) || 0) - req.kilos)
  })
  const explosion = {
    itemId: item.id, actorUuid: actor?.uuid ?? null, templateId, failed, name: item.name,
    dv: out.dv, falloff: out.falloff, radius: out.radius, ap: out.ap, targetDV: out.targetDV, multiplier: out.multiplier,
    shape: out.shape, backgroundCount: out.backgroundCount, backgroundRadius: out.backgroundRadius, kilos: req.kilos,
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor
    }),
    content: explosionContent(explosion),
    rolls,
    flags: {
      sr5: {
        explosion
      }
    },
  })
}

export async function _socketExplosiveDetonate(message, senderId) {
  if (!isActiveGM()) return
  await explode(message.data, senderId).catch(e => SR5_SystemHelpers.srLog(1, `Explosion not posted: ${e}`))
}

export function explosionContent(ex) {
  const t = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key)
  const lines = [`<p><strong>${esc(t("SR5.EXPLOSIVE_CardTitle", {
    name: ex.name, kilos: ex.kilos
  }))}</strong></p>`]
  if (ex.failed) return `<div class="sr5-explosion">${lines.join("")}<p>${esc(t("SR5.EXPLOSIVE_DetonatorFailed"))}</p></div>`
  if (!(ex.dv > 0)) return `<div class="sr5-explosion">${lines.join("")}<p>${esc(t("SR5.EXPLOSIVE_Dud"))}</p></div>`
  lines.push(`<p>${esc(t("SR5.EXPLOSIVE_CardBlast", {
    dv: ex.dv, ap: ex.ap, falloff: ex.falloff, radius: ex.radius
  }))}</p>`)
  if (ex.multiplier > 1) lines.push(`<p>${esc(t("SR5.EXPLOSIVE_CardTarget", {
    dv: ex.targetDV, multiplier: ex.multiplier
  }))}</p>`)
  if (ex.backgroundCount > 0) lines.push(`<p>${esc(t("SR5.EXPLOSIVE_CardBackground", {
    rating: ex.backgroundCount, radius: ex.backgroundRadius
  }))}</p>`)
  lines.push(`<button type="button" class="sr5-explosion-resist">${esc(t("SR5.EXPLOSIVE_Resist"))}</button>`)
  return `<div class="sr5-explosion">${lines.join("")}</div>`
}

/** The card's button: the selected token (or the user's character) resists the blast at its distance */
export function activateExplosionListeners(html, message) {
  const ex = message.flags?.sr5?.explosion
  if (!ex) return
  html.querySelectorAll(".sr5-explosion-resist").forEach(el => el.addEventListener("click", async ev => {
    ev.preventDefault()
    //A card a GM posted stands for the explosion: any other is not one
    if (!message.author?.isGM) return
    const speaker = ChatMessage.getSpeaker()
    const actor = SR5_EntityHelpers.getRealActorFromID(speaker.token || speaker.actor)
    if (!actor) return ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActor"))
    const [{
      SR5_PrepareRollTest
    }, {
      vouch
    }] = await Promise.all([import("../rolls/roll-prepare.js"), import("../rolls/roll-helpers/attack-card.js")])
    const data = SR5_PrepareRollTest.getBaseRollData(null, actor)
    data.test.type = "falseTest"
    data.test.title = game.i18n.format("SR5.EXPLOSIVE_ResistTitle", {
      name: ex.name
    })
    data.owner.itemId = ex.itemId
    data.damage.base = data.damage.value = Number(ex.dv) || 0
    data.damage.type = "physical"
    data.damage.resistanceType = "physicalDamage"
    //A blast is an attack's, as a grenade's: it can knock down (SR5 p. 195)
    data.damage.isAttack = true
    data.combat.armorPenetration = Number(ex.ap) || 0
    data.combat.grenade = {
      isGrenade: true, damageFallOff: Number(ex.falloff) || 0, blastRadius: Number(ex.radius) || 0, templateId: ex.templateId
    }
    data.target.actorId = null
    await actor.rollTest("resistanceCard", null, vouch(data))
  }))
}
