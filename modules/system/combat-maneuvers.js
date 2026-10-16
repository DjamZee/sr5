// Combat maneuvers of a small unit on the table (Run & Gun p. 112-116, Street Lethal p. 180-181; rules in
// rolls/roll-helpers/combat-maneuvers.js, this file reads Foundry).
// The leader opens the window from his Small Unit Tactics, picks the maneuver and posts its card; the members join it
// with their own teamwork roll (SR5 p. 51); the leader rolls his test through the usual roll window, the team's dice and
// limit in it. The active GM reads the result, writes who gets what in his ledger (a hidden world setting) and the rolls
// of the members find their boxes there, already ticked, until the combat turn (or the pass) is over.
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
  updateLedger
} from "./gm-ledger.js"
import {
  cardTrusted
} from "../rolls/roll-helpers/socket-guard.js"
import {
  COMBAT_MANEUVERS, maneuverThreshold, resolveManeuver, maneuverOffers, prunedLedger, tacnetCoordination, assistPool,
} from "../rolls/roll-helpers/combat-maneuvers.js"
import {
  readAssistDice, teamworkBonus, uniqueAssists
} from "../rolls/roll-helpers/ritualTeam.js"
import {
  isTacticsKnowledge
} from "../rolls/roll-helpers/tacnet.js"
import {
  tacnetOf, tacnetTacticsBonus
} from "./tacnet.js"
import {
  rollKinds
} from "../rolls/roll-helpers/indirect.js"

export const MANEUVER_LEDGER = "sr5ManeuverLedger"
const DEFENSE_TYPES = ["defense", "defenseSimple", "martialArtDefense", "grappleClinchDefense", "rammingDefense"]

const isActiveGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id
const esc = text => foundry.utils.escapeHTML(String(text ?? ""))
const t = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key)
const label = key => t(`SR5.MANEUVER_${key}`)

export function registerManeuverSetting() {
  game.settings.register("sr5", MANEUVER_LEDGER, {
    scope: "world", config: false, type: Object, default: {
    },
  })
}

function ledger() {
  try {
    return game.settings.get("sr5", MANEUVER_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

function now() {
  const combat = game.combat
  return combat?.started ? {
    combatId: combat.id, round: combat.round, pass: combat.initiativePass ?? null
  } : null
}

// The id the roll cards give an actor (its token for an unlinked one), for the combat
const cardActorId = actor => actor.isToken ? actor.token.id : actor.id

/** A Small Unit Tactics knowledge of an actor, the first one found */
export function tacticsItemOf(actor) {
  return actor?.items?.find(i => i.type === "itemKnowledge" && isTacticsKnowledge(i.name)) ?? null
}

/* -------------------------------------------- */
/*  The boxes of the rolls                       */
/* -------------------------------------------- */

/** What a prepared roll is, for a maneuver's bonus (rolls of combat-maneuvers.js) */
export function maneuverKinds(rollData) {
  const kinds = rollKinds(rollData.test)
  const type = rollData.test?.type, sub = rollData.test?.typeSub
  if (DEFENSE_TYPES.includes(type)) kinds.add("defense")
  const mode = rollData.combat?.firingMode?.selected
  if (kinds.has("rangedAttack") && mode && mode !== "SS" && mode !== "FN") kinds.add("autoAttack")
  if (type === "vehicleTest" || (type === "skillDicePool" && /^pilot/.test(sub || ""))) kinds.add("pilot")
  return kinds
}

export function maneuverOffersFor(rollData, actor) {
  if (!actor) return []
  const ledgerNow = ledger()
  if (!Object.keys(ledgerNow).length) return []
  return maneuverOffers(ledgerNow, actor.uuid, maneuverKinds(rollData), now())
}

/* -------------------------------------------- */
/*  The window                                   */
/* -------------------------------------------- */

export class SR5CombatManeuverWindow extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr5", "sr-combat-maneuver"],
    position: {
      width: 640, height: "auto"
    },
    window: {
      title: "SR5.MANEUVER_Title", icon: "fas fa-people-group", resizable: true
    },
    tag: "form",
    actions: {
      launch: SR5CombatManeuverWindow.#launch,
      simpleTest: SR5CombatManeuverWindow.#simpleTest,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/combat-maneuver.hbs"
    }
  }

  static open(actor, item) {
    if (!actor?.isOwner) return
    new SR5CombatManeuverWindow({
      actor, item, id: `sr5-maneuver-${actor.id}`
    }).render({
      force: true
    })
  }

  constructor(options = {
  }) {
    super(options)
    this.actor = options.actor
    this.item = options.item ?? tacticsItemOf(options.actor)
    this.choice = {
      key: "crossfire", threshold: "", detected: false, mapAndBinoculars: false, instructions: false
    }
  }

  async _prepareContext() {
    const m = COMBAT_MANEUVERS[this.choice.key]
    const net = tacnetOf(this.actor)
    const coordination = tacnetCoordination(net?.level)
    const group = page => page.startsWith("SL") ? "SL" : "RG"
    return {
      choice: this.choice,
      maneuvers: Object.entries(COMBAT_MANEUVERS).map(([key, v]) => ({
        key, label: label(key), page: v.page, group: group(v.page), selected: key === this.choice.key
      })),
      groups: [{
        key: "RG", label: t("SR5.MANEUVER_GroupRG")
      }, {
        key: "SL", label: t("SR5.MANEUVER_GroupSL")
      }],
      maneuver: m, page: m.page, description: label(`${this.choice.key}_D`), bookThreshold: m.threshold,
      threshold: maneuverThreshold(this.choice.key, this.choice),
      skill: this.item ? `${this.item.name} (${this.item.system.test?.dicePool ?? 0})` : t("SR5.MANEUVER_NoSkill"),
      tacnet: net ? t("SR5.MANEUVER_Tacnet", {
        name: net.name, level: net.level
      }) : "",
      instructionsLabel: t(coordination.instructions === "simple" ? "SR5.MANEUVER_InstructionsSimple" : "SR5.MANEUVER_InstructionsComplex"),
    }
  }

  _onRender(context, options) {
    super._onRender?.(context, options)
    //The window's root stays from one render to the next: one listener is enough
    if (this._listening) return
    this._listening = true
    this.element.addEventListener("change", () => {
      const f = this.element.elements
      this.choice = {
        key: f.key?.value || "crossfire", threshold: f.threshold?.value ?? "",
        detected: !!f.detected?.checked, mapAndBinoculars: !!f.mapAndBinoculars?.checked, instructions: !!f.instructions?.checked,
      }
      this.render()
    })
  }

  static async #launch() {
    const threshold = maneuverThreshold(this.choice.key, this.choice)
    if (!threshold) return ui.notifications.warn(t("SR5.MANEUVER_NeedThreshold"))
    if (!this.item) return ui.notifications.warn(t("SR5.MANEUVER_NoSkill"))
    //Explaining an unknown maneuver: a complex action, a simple one through an RP-Tac of level II or III (RG p. 113, 119)
    if (this.choice.instructions && game.combat) {
      const {
        SR5Combat
      } = await import("./srcombat.js")
      const type = tacnetCoordination(tacnetOf(this.actor)?.level).instructions
      const actions = [{
        type, value: 1, source: "combatManeuver"
      }]
      if (!SR5Combat.hasActionsLeft(this.actor, actions)) return
      await SR5Combat.changeActionInCombat(cardActorId(this.actor), actions)
    }
    await postManeuverCard(this.actor, this.item, this.choice.key, threshold, this.choice)
    this.close()
  }

  // Recognising or countering the other side's maneuver, or any other use of the skill: the plain test (RG p. 113)
  static async #simpleTest() {
    if (!this.item) return ui.notifications.warn(t("SR5.MANEUVER_NoSkill"))
    this.close()
    const {
      SR5_PrepareRollTest
    } = await import("../rolls/roll-prepare.js")
    SR5_PrepareRollTest.rollTest(this.item, "knowledgeSkill", null, {
      combatManeuverSkip: true
    })
  }
}

/* -------------------------------------------- */
/*  The card                                     */
/* -------------------------------------------- */

async function postManeuverCard(actor, item, key, threshold, choice) {
  const net = tacnetOf(actor)
  const maneuver = {
    key, threshold, detected: !!choice.detected, leaderUuid: actor.uuid, leaderId: cardActorId(actor), leaderName: actor.name,
    itemUuid: item.uuid, tacnetLevel: net?.level ?? 0, tacnetMembers: net?.members ?? [], state: "open", initiativeGiven: false,
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor
    }),
    content: maneuverContent(maneuver),
    flags: {
      sr5: {
        combatManeuver: maneuver
      }
    },
  })
}

export function maneuverContent(cm, outcome = null) {
  const m = COMBAT_MANEUVERS[cm.key]
  const lines = [
    `<p><strong>${esc(t("SR5.MANEUVER_CardTitle", {
      name: label(cm.key), threshold: cm.threshold
    }))}</strong> <span class="hint">(${esc(m?.page ?? "")})</span></p>`,
    `<p>${esc(t("SR5.MANEUVER_CardLeader", {
      name: cm.leaderName
    }))}</p>`,
    `<p class="hint">${esc(label(`${cm.key}_D`))}</p>`,
  ]
  if (cm.detected) lines.push(`<p class="hint">${esc(t("SR5.MANEUVER_Detected"))}</p>`)
  if (cm.state === "open") {
    lines.push(`<button type="button" class="sr5-maneuver-action" data-maneuver="join">${esc(t("SR5.MANEUVER_Join"))}</button>`)
    lines.push(`<button type="button" class="sr5-maneuver-action maneuver-leader" data-maneuver="lead">${esc(t("SR5.MANEUVER_Lead"))}</button>`)
  } else {
    if (outcome) lines.push(`<p><strong>${esc(outcome)}</strong></p>`)
    if (cm.tacnetLevel >= 2 && !cm.initiativeGiven && cm.state !== "ended") {
      lines.push(`<button type="button" class="sr5-maneuver-action maneuver-leader" data-maneuver="initiative">${esc(t("SR5.MANEUVER_TacnetInitiative"))}</button>`)
    }
    if (cm.state === "done") lines.push(`<button type="button" class="sr5-maneuver-action maneuver-leader" data-maneuver="end">${esc(t("SR5.MANEUVER_End"))}</button>`)
  }
  return `<div class="sr5-combat-maneuver">${lines.join("")}</div>`
}

function leaderOf(cm) {
  return SR5_EntityHelpers.getRealActorFromID(cm.leaderId)
}

export function activateManeuverListeners(html, message) {
  const cm = message.flags?.sr5?.combatManeuver
  if (!cm) return
  const leader = leaderOf(cm)
  if (!(leader?.isOwner || game.user.isGM)) html.querySelectorAll(".maneuver-leader").forEach(el => el.remove())
  html.querySelectorAll(".sr5-maneuver-action").forEach(el => el.addEventListener("click", ev => {
    ev.preventDefault()
    const action = ev.currentTarget.dataset.maneuver
    if (action === "join") return join(message)
    if (action === "lead") return lead(message)
    if (action === "initiative") return tacnetInitiative(message)
    if (action === "end") return requestGM({
      action: "end", cardId: message.id
    })
  }))
}

/** The assist cards posted for a maneuver, those a member's owner (or a GM) posted, one per member */
function believedAssists(cardId, leaderId) {
  const list = game.messages.contents.map(m => {
    const a = m.flags?.sr5?.maneuverAssist
    if (a?.cardId !== cardId) return null
    const actor = SR5_EntityHelpers.getRealActorFromID(a.actorId)
    if (!actor || !cardTrusted(m.author, actor.testUserPermission?.(m.author, "OWNER"))) return null
    return {
      ...a, uuid: actor.uuid
    }
  }).filter(Boolean)
  return uniqueAssists(list, leaderId)
}

/** A member's teamwork roll: his Small Unit Tactics, or Intuition - 1, limited by his Mental limit (RG p. 113) */
async function join(message) {
  const cm = message.flags.sr5.combatManeuver
  if (cm.state !== "open") return ui.notifications.warn(t("SR5.MANEUVER_Closed"))
  const speaker = ChatMessage.getSpeaker()
  const actor = SR5_EntityHelpers.getRealActorFromID(speaker.token || speaker.actor)
  if (!actor) return ui.notifications.warn(t("SR5.WARN_NoActor"))
  const actorId = cardActorId(actor)
  if (actorId === cm.leaderId) return ui.notifications.warn(t("SR5.MANEUVER_LeaderJoins"))
  if (COMBAT_MANEUVERS[cm.key]?.leaderOnly) return ui.notifications.warn(t("SR5.MANEUVER_LeaderOnly"))
  if (believedAssists(message.id, cm.leaderId).some(a => a.actorId === actorId)) return ui.notifications.warn(t("SR5.MANEUVER_AlreadyJoined", {
    name: actor.name
  }))
  const item = tacticsItemOf(actor)
  const penalties = actor.system.penalties
  const penalty = ["condition", "magic", "special"].reduce((s, k) => s + (Number(penalties?.[k]?.actual?.value) || 0), 0)
  //Street Lethal p. 176: an RP-Tac's bonus goes to the Small Unit Tactics tests too
  const pool = assistPool(item ? item.system.test?.dicePool : null, actor.system.attributes?.intuition?.augmented?.value, penalty) + tacnetTacticsBonus(actor)
  const limit = Number(actor.system.limits?.mentalLimit?.value) || 0
  let assist = {
    hits: 0, glitch: false, criticalGlitch: false
  }
  const rolls = []
  if (pool > 0) {
    const roll = await new Roll(`${pool}d6`).evaluate()
    assist = readAssistDice(roll.dice[0].results.map(r => r.result), limit)
    rolls.push(roll)
  }
  const lines = [t("SR5.MANEUVER_AssistRoll", {
    name: actor.name, maneuver: label(cm.key), pool, hits: assist.hits
  })]
  if (!item) lines.push(t("SR5.MANEUVER_AssistDefault"))
  if (assist.criticalGlitch) lines.push(t("SR5.MANEUVER_AssistCritical"))
  else if (assist.glitch) lines.push(t("SR5.MANEUVER_AssistGlitch"))
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor
    }),
    content: `<div class="sr5-maneuver-assist">${lines.map(l => `<p>${esc(l)}</p>`).join("")}</div>`,
    rolls,
    flags: {
      sr5: {
        maneuverAssist: {
          cardId: message.id, actorId, name: actor.name, ...assist
        }
      }
    },
  })
}

/** The leader's test, through the roll window, the team's dice and limit in it (SR5 p. 51) */
async function lead(message) {
  const cm = message.flags.sr5.combatManeuver
  if (cm.state !== "open") return ui.notifications.warn(t("SR5.MANEUVER_Closed"))
  const item = await fromUuid(cm.itemUuid)
  if (!item?.actor?.isOwner) return ui.notifications.warn(t("SR5.MANEUVER_NotLeader"))
  const assists = believedAssists(message.id, cm.leaderId)
  const bonus = teamworkBonus(Number(item.system.rating?.value) || 0, assists)
  const {
    SR5_PrepareRollTest
  } = await import("../rolls/roll-prepare.js")
  SR5_PrepareRollTest.rollTest(item, "knowledgeSkill", null, {
    combatManeuver: {
      cardId: message.id, bonus, threshold: cm.threshold, name: label(cm.key)
    }
  })
}

/** RG p. 119: the leader of an RP-Tac II gives 5 more Initiative to a member, of a III 10 to one and 5 to two others */
async function tacnetInitiative(message) {
  const cm = message.flags.sr5.combatManeuver
  if (!game.combat?.started) return ui.notifications.warn(t("SR5.MANEUVER_NoCombat"))
  const amounts = tacnetCoordination(cm.tacnetLevel).initiative
  const members = (cm.tacnetMembers ?? []).map(uuid => globalThis.fromUuidSync?.(uuid)).filter(Boolean)
  if (!members.length || !amounts.length) return
  const options = members.map(a => `<option value="${esc(a.uuid)}">${esc(a.name)}</option>`).join("")
  const content = amounts.map((n, i) => `<div class="form-group"><label>+${n}</label><select name="m${i}"><option value="">—</option>${options}</select></div>`).join("")
  const picked = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: t("SR5.MANEUVER_TacnetInitiative")
    },
    content,
    ok: {
      callback: (event, button) => amounts.map((n, i) => ({
        uuid: button.form.elements[`m${i}`].value, value: n
      })).filter(p => p.uuid)
    },
    rejectClose: false,
  })
  if (!picked?.length) return
  //One actor once: the same member picked twice keeps the larger share
  const seen = new Set()
  const gifts = picked.filter(p => !seen.has(p.uuid) && seen.add(p.uuid))
  await requestGM({
    action: "initiative", cardId: message.id, gifts
  })
}

async function requestGM(data) {
  if (isActiveGM()) return handleRequest(data, game.user.id)
  await SR5_SocketHandler.emitForGM("combatManeuver", data)
}

export async function _socketCombatManeuver(message, senderId) {
  if (!isActiveGM()) return
  await handleRequest(message.data, senderId).catch(e => SR5_SystemHelpers.srLog(1, `Combat maneuver: ${e}`))
}

async function handleRequest(data, senderId) {
  const card = game.messages.get(data.cardId)
  const cm = card?.flags?.sr5?.combatManeuver
  const sender = game.users.get(senderId)
  const leader = cm ? leaderOf(cm) : null
  if (!cm || !sender || !(sender.isGM || leader?.testUserPermission?.(sender, "OWNER"))) return
  if (data.action === "end") {
    await updateLedger(MANEUVER_LEDGER, current => {
      if (!current[card.id]) return null
      delete current[card.id]
      return current
    })
    const ended = {
      ...cm, state: "ended"
    }
    return card.update({
      content: maneuverContent(ended, t("SR5.MANEUVER_Ended")), "flags.sr5.combatManeuver": ended
    })
  }
  if (data.action === "initiative" && !cm.initiativeGiven && game.combat?.started) {
    const {
      SR5Combat
    } = await import("./srcombat.js")
    const amounts = tacnetCoordination(cm.tacnetLevel).initiative
    const names = []
    for (const [i, gift] of (data.gifts ?? []).slice(0, amounts.length).entries()) {
      if (!(cm.tacnetMembers ?? []).includes(gift.uuid)) continue
      const actor = await fromUuid(gift.uuid)
      if (!actor) continue
      await SR5Combat.changeInitInCombatHelper(cardActorId(actor), amounts[i])
      names.push(`${actor.name} +${amounts[i]}`)
    }
    const given = {
      ...cm, initiativeGiven: true
    }
    await card.update({
      content: maneuverContent(given, cm.outcomeText), "flags.sr5.combatManeuver": given
    })
    if (names.length) ChatMessage.create({
      speaker: card.speaker, content: `<p>${esc(t("SR5.MANEUVER_InitiativeGiven", {
        names: names.join(", ")
      }))}</p>`
    })
  }
}

/* -------------------------------------------- */
/*  The leader's result, read by the active GM   */
/* -------------------------------------------- */

async function resolveFromRoll(message) {
  const data = message.flags?.sr5data
  const ref = data?.various?.combatManeuver
  if (!ref?.cardId) return
  const card = game.messages.get(ref.cardId)
  const cm = card?.flags?.sr5?.combatManeuver
  if (!cm || cm.state !== "open") return
  const leader = leaderOf(cm)
  //The leader's own card, posted by his owner or a GM
  if (!leader || SR5_EntityHelpers.getRealActorFromID(data.owner?.actorId)?.uuid !== leader.uuid) return
  if (!cardTrusted(message.author, leader.testUserPermission?.(message.author, "OWNER"))) return
  const assists = believedAssists(card.id, cm.leaderId)
  const result = resolveManeuver(cm.key, {
    hits: Number(data.roll?.hits) || 0, threshold: cm.threshold, leaderUuid: leader.uuid,
    leaderGlitch: !!data.roll?.glitchRoll, leaderCritical: !!data.roll?.criticalGlitchRoll,
    assists: assists.map(a => ({
      uuid: a.uuid, glitch: a.glitch, criticalGlitch: a.criticalGlitch
    })), detected: cm.detected,
  })
  const m = COMBAT_MANEUVERS[cm.key]
  const point = now()
  const holds = (turn) => {
    if (!point || m.lasting) return null
    return {
      combatId: point.combatId, round: point.round, pass: turn ? null : point.pass
    }
  }
  const members = {
  }
  for (const [uuid, r] of Object.entries(result.members)) members[uuid] = {
    bonus: r.bonus, penalty: r.penalty, holds: holds(r.bonus || r.turn)
  }
  await updateLedger(MANEUVER_LEDGER, current => {
    const next = prunedLedger(current, point)
    next[card.id] = {
      key: cm.key, label: `${label(cm.key)} (${t("SR5.MANEUVER_Short")})`, bonuses: result.bonuses, members
    }
    return next
  })
  //RG p. 113 and 115: the Initiative a maneuver gives, to the members in the combat
  if (result.success && m.initiative && point) {
    const {
      SR5Combat
    } = await import("./srcombat.js")
    for (const [uuid, r] of Object.entries(result.members)) {
      if (!r.bonus) continue
      const actor = await fromUuid(uuid)
      if (actor && SR5Combat.getCombatantFromActor(actor)) await SR5Combat.changeInitInCombatHelper(cardActorId(actor), m.initiative)
    }
  }
  const bonusText = result.bonuses.map(b => `${t(`SR5.MANEUVER_Rolls_${b.rolls}`)} +${b.value}`)
    .concat(m.initiative ? [t("SR5.MANEUVER_Rolls_initiative", {
      value: m.initiative
    })] : []).join(", ")
  let outcome
  if (result.critical) outcome = t("SR5.MANEUVER_OutcomeCritical", {
    penalty: Object.values(result.members)[0]?.penalty ?? 0
  })
  else if (result.success) outcome = t("SR5.MANEUVER_OutcomeSuccess", {
    hits: data.roll?.hits ?? 0, bonus: bonusText || t("SR5.MANEUVER_SeeBook")
  })
  else outcome = t("SR5.MANEUVER_OutcomeFailure", {
    hits: data.roll?.hits ?? 0, penalty: m.failPenalty
  })
  const glitched = assists.filter(a => a.glitch && !a.criticalGlitch).map(a => a.name)
  if (result.success && glitched.length) outcome += ` ${t("SR5.MANEUVER_OutOfPlace", {
    names: glitched.join(", ")
  })}`
  const done = {
    ...cm, state: "done", outcomeText: outcome, success: result.success
  }
  await card.update({
    content: maneuverContent(done, outcome), "flags.sr5.combatManeuver": done
  })
}

export function initCombatManeuvers() {
  Hooks.on("createChatMessage", message => {
    if (!isActiveGM() || !message.flags?.sr5data?.various?.combatManeuver) return
    resolveFromRoll(message).catch(e => SR5_SystemHelpers.srLog(1, `Combat maneuver not resolved: ${e}`))
  })
  //A new combat turn: the GM's ledger forgets what no longer holds
  Hooks.on("updateCombat", (combat, changes) => {
    if (!isActiveGM() || changes.round === undefined) return
    updateLedger(MANEUVER_LEDGER, current => {
      const next = prunedLedger(current, now())
      return Object.keys(next).length === Object.keys(current).length ? null : next
    }).catch(() => {})
  })
}

/**
 * The leader's roll: the team's dice and limit (SR5 p. 51), and the card it answers kept on the roll so that the GM can
 * read it (roll-prepare.js, knowledgeSkill)
 */
export function applyManeuverTeamwork(rollData, ref) {
  if (!ref?.cardId) return rollData
  rollData.various = rollData.various || {
  }
  rollData.various.combatManeuver = {
    cardId: ref.cardId
  }
  rollData.test.title = `${rollData.test.title} — ${ref.name}`
  if (ref.threshold > 0) rollData.threshold = {
    ...(rollData.threshold || {
    }), value: ref.threshold
  }
  if (ref.bonus?.dice > 0) rollData.dicePool.modifiers.push({
    type: "maneuverTeamwork", label: t("SR5.MANEUVER_Teamwork"), value: ref.bonus.dice
  })
  if (ref.bonus?.limit > 0) {
    rollData.limit.modifiers = rollData.limit.modifiers || {
    }
    rollData.limit.modifiers.maneuverTeamwork = {
      value: ref.bonus.limit, label: t("SR5.MANEUVER_Teamwork")
    }
  }
  return rollData
}
