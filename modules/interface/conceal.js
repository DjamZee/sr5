import {
  canBeConcealed, concealedState, concealedItems, concealResult, searchBasePool, searchPlan, isFound,
  CONCEALED_FLAG, SEARCH_ATTRIBUTES
} from "../rolls/roll-helpers/conceal-rules.js"
import {
  SR5Pickpocket
} from "./pickpocket.js"
import {
  SR5_SystemHelpers
} from "../system/utilitySystem.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_RollTest
} from "../rolls/roll-test.js"
import {
  refuseByRule, ruleLockActive
} from "../system/rule-locks.js"

//SR5 p. 139: a search is made looking attentively (+3), ticked by default; the GM unticks it, or ticks distracted (-2)
const SITUATIONS = ["attentive", "distracted"]
const SITUATION_LABELS = {
  attentive: "SR5.ConcealSearchAttentive",
  distracted: "SR5.ConcealSearchDistracted",
}

/**
 * Hiding an object on oneself, and searching someone for it (SR5 p. 422), from the sheet and the chat cards.
 *
 * The one who hides rolls from her sheet; the object keeps her hits (arbitrage de DjamZ, 2026-10-07). The one
 * who searches asks from his sheet, his target selected; the GM rolls his test against every hidden object, so
 * that nobody learns how many there are, and tells him what he finds.
 */
export class SR5Conceal {

  //The sheet's button: Palming cannot be used untrained (SR5 p. 135)
  static async startHide(actor, item) {
    if (!actor?.isOwner || !canBeConcealed(item)) return
    if (!(actor.system.skills?.palming?.rating?.value > 0) && refuseByRule("objects", "SR5.WARN_PickpocketNeedsPalming", null, {
      actor
    })) return
    return actor.rollTest("concealItem", null, {
      itemId: item.id
    })
  }

  /** The hide card is being written: the object keeps the hits, a weapon ready goes back out of sight.
   * @return {Boolean} whether the object is hidden
   */
  static async hide(item, roll) {
    if (!item?.isOwner || !canBeConcealed(item)) return false
    const result = concealResult({
      hits: roll?.hits, criticalGlitch: roll?.criticalGlitchRoll
    })
    if (!result) return false
    const update = {
      [`flags.sr5.${CONCEALED_FLAG}`]: result
    }
    if (item.type === "itemWeapon" && item.system.isActive) update["system.isActive"] = false
    await item.update(update)
    return true
  }

  //Taken out: the hidden state goes (arbitrage de DjamZ, 2026-10-07)
  static async takeOut(item) {
    if (!item?.isOwner || !concealedState(item)) return
    await item.unsetFlag("sr5", CONCEALED_FLAG)
  }

  //The id the cards name an actor by: its token for an unlinked one
  static actorIdOf(actor) {
    return actor?.isToken ? actor.token.id : actor?.id
  }

  /**
   * The searcher's side, from his sheet: the token he targets, the skill and attribute he uses, then a request
   * to the GM (or the GM's own resolution when he searches himself).
   * @param {Actor} observer - the sheet's actor
   * @param {String} mode - "spot" or "patDown"
   */
  static async startSearch(observer, mode) {
    if (!observer?.isOwner) return
    const targets = Array.from(game.user.targets ?? [])
    const target = targets.length === 1 ? targets[0].document : null
    const observerId = SR5Conceal.actorIdOf(observer)
    if (!target?.actor || SR5Pickpocket.actorIdOf(target) === observerId) return ui.notifications.warn(game.i18n.localize("SR5.WARN_ConcealSearchTarget"))
    const targetId = SR5Pickpocket.actorIdOf(target)
    //SR5 p. 422: a pat-down is made by hand (the "ranges" rule lock)
    if (mode === "patDown" && !SR5Pickpocket.actorsInReach(observerId, targetId) && refuseByRule("ranges", "SR5.WARN_ConcealSearchReach", null, {
      actor: observer
    })) return

    const choice = await SR5Conceal.askSearch(observer, mode, target.name)
    if (!choice) return
    const request = {
      observerId, targetId, mode, skill: choice.skill, attribute: choice.attribute, requestId: foundry.utils.randomID()
    }
    if (game.user.isGM) return SR5Conceal.resolve(request, null)
    const modeKey = mode === "patDown" ? "SR5.ConcealSearchRequestPatDown" : "SR5.ConcealSearchRequestSpot"
    await ChatMessage.create({
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format(modeKey, {
        observer: SR5Pickpocket.tokenOf(observerId)?.name ?? observer.name, target: target.name
      }))}</p><button type="button" class="sr5-conceal-search">${foundry.utils.escapeHTML(game.i18n.localize("SR5.ConcealSearchResolve"))}</button>`,
      speaker: ChatMessage.getSpeaker({
        actor: observer
      }),
      whisper: game.users.filter(u => u.isGM).map(u => u.id).concat(game.user.id),
      flags: {
        sr5: {
          concealSearch: request
        }
      },
    })
  }

  //Perception or Palming (SR5 p. 422); Intuition [Mental], or in a pat-down Agility [Physical]
  static async askSearch(observer, mode, targetName) {
    // Not card-helpers' escape (N2): null and undefined show here as "null" and "undefined", not as an empty text
    const escape = foundry.utils.escapeHTML
    const skills = observer.system.skills ?? {
    }
    const skillOptions = ["perception", "palming"].filter(k => k === "perception" || skills[k]?.rating?.value > 0)
      .map(k => `<option value="${k}">${escape(game.i18n.localize(CONFIG.SR5.skills?.[k] ?? k))}</option>`).join("")
    const attributes = mode === "patDown" ? Object.keys(SEARCH_ATTRIBUTES) : ["intuition"]
    const attributeOptions = attributes.map(k => `<option value="${k}">${escape(game.i18n.localize(CONFIG.SR5.characterAttributes?.[k] ?? k))}</option>`).join("")
    const title = game.i18n.localize(mode === "patDown" ? "SR5.ConcealSearchPatDown" : "SR5.ConcealSearchSpot")
    return foundry.applications.api.DialogV2.wait({
      window: {
        title: `${title} : ${targetName}`
      },
      content: `<div class="form-group"><label>${escape(game.i18n.localize("SR5.ConcealSearchSkill"))}</label><select name="skill">${skillOptions}</select></div><div class="form-group"><label>${escape(game.i18n.localize("SR5.ConcealSearchAttribute"))}</label><select name="attribute">${attributeOptions}</select></div>`,
      buttons: [{
        action: "ok",
        label: title,
        default: true,
        callback: (event, button) => ({
          skill: button.form.elements.skill.value,
          attribute: button.form.elements.attribute.value,
        }),
      }],
      rejectClose: false,
    })
  }

  //The request card: its button is the GM's
  static onRenderSearchCard(message, html) {
    const request = message.flags?.sr5?.concealSearch
    if (!request) return
    const button = html.querySelector(".sr5-conceal-search")
    if (!button) return
    if (!game.user.isGM || request.done) return button.remove()
    button.addEventListener("click", ev => {
      ev.preventDefault()
      SR5Conceal.resolve(request, message)
    })
  }

  //The searcher's pool before the object, as his sheet works it out: the skill's pool, its attribute swapped
  static basePool(observer, skillKey, attributeKey) {
    const chosen = Number(observer.system.attributes?.[attributeKey]?.augmented?.value) || 0
    const skill = observer.system.skills?.[skillKey]
    //A creature without skills uses the attribute alone
    if (!skill) return chosen
    const linked = (skill.test?.modifiers ?? []).filter(m => m.type === "linkedAttribute").reduce((sum, m) => sum + (Number(m.value) || 0), 0)
    return searchBasePool(skill.test?.dicePool, linked, chosen)
  }

  /**
   * The GM's side: the situation, then one roll of the searcher against each hidden object, read on the GM's
   * browser. The searcher learns what he finds, never how many objects there were.
   * @param {Object} request - {observerId, targetId, mode, skill, attribute, requestId}
   * @param {ChatMessage|null} message - the request card, null when the GM searches himself
   */
  static async resolve(request, message) {
    if (!game.user.isGM) return
    if (message && game.messages.get(message.id)?.flags?.sr5?.concealSearch?.done) return ui.notifications.warn(game.i18n.localize("SR5.WARN_ConcealSearchDone"))
    const observer = SR5_EntityHelpers.getRealActorFromID(request.observerId)
    const target = SR5_EntityHelpers.getRealActorFromID(request.targetId)
    if (!observer || !target) return ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActor"))
    //The request is written by someone who plays the searcher; a pat-down is still made by hand, unless the
    //"ranges" rule lock is lifted (the searcher's browser has already whispered it)
    const refused = (message && !(message.author && observer.testUserPermission(message.author, "OWNER"))) ||
      !["spot", "patDown"].includes(request.mode) || !["perception", "palming"].includes(request.skill) ||
      !(request.attribute in SEARCH_ATTRIBUTES) || (request.mode !== "patDown" && request.attribute !== "intuition") ||
      (request.mode === "patDown" && ruleLockActive("ranges") && !SR5Pickpocket.actorsInReach(request.observerId, request.targetId))
    if (refused) {
      SR5_SystemHelpers.srLog(1, "Concealed search refused", request)
      return ui.notifications.warn(game.i18n.localize("SR5.WARN_ConcealSearchRefused"))
    }

    const hidden = concealedItems(target)
    // Not card-helpers' escape (N2): null and undefined show here as "null" and "undefined", not as an empty text
    const escape = foundry.utils.escapeHTML
    const observerName = SR5Pickpocket.tokenOf(request.observerId)?.name ?? observer.name
    const targetName = SR5Pickpocket.tokenOf(request.targetId)?.name ?? target.name
    const situation = hidden.length ? await foundry.applications.api.DialogV2.wait({
      window: {
        title: `${game.i18n.localize(request.mode === "patDown" ? "SR5.ConcealSearchPatDown" : "SR5.ConcealSearchSpot")} : ${targetName}`
      },
      content: `<p>${escape(game.i18n.format("SR5.ConcealSearchHiddenList", {
        items: hidden.map(i => `${i.name} (${concealedState(i).hits})`).join(", ")
      }))}</p>${SITUATIONS.map(k => `<div class="form-group"><label>${escape(game.i18n.localize(SITUATION_LABELS[k]))}</label><input type="checkbox" name="${k}" ${k === "attentive" ? "checked" : ""}/></div>`).join("")}<div class="form-group"><label>${escape(game.i18n.localize("SR5.ConcealSearchOther"))}</label><input type="number" name="other" step="1" value="0"/></div>`,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("SR5.ConcealSearchRoll"),
        default: true,
        callback: (event, button) => ({
          situations: SITUATIONS.filter(k => button.form.elements[k].checked),
          other: Number(button.form.elements.other.value) || 0,
        }),
      }],
      rejectClose: false,
    }) : {
      situations: [], other: 0
    }
    if (!situation) return
    //Checked again after the dialog: another click may have answered meanwhile
    if (message) {
      if (game.messages.get(message.id)?.flags?.sr5?.concealSearch?.done) return ui.notifications.warn(game.i18n.localize("SR5.WARN_ConcealSearchDone"))
      await message.update({
        "flags.sr5.concealSearch.done": true
      })
    }

    const base = SR5Conceal.basePool(observer, request.skill, request.attribute)
    const limit = Number(observer.system.limits?.[SEARCH_ATTRIBUTES[request.attribute]]?.value) || undefined
    const rows = []
    for (const line of searchPlan(hidden, {
      base, mode: request.mode, situations: situation.situations, other: situation.other
    })) {
      const roll = await SR5_RollTest.rollDice({
        dicePool: line.pool, limit
      })
      rows.push({
        ...line, hits: roll.hits, glitch: roll.glitchRoll, criticalGlitch: roll.criticalGlitchRoll, dice: roll.dices.map(d => d.result).join(" "),
        found: isFound(roll.hits, line.hiddenHits)
      })
    }

    //The GM's card: every roll, against every hidden object
    if (rows.length) await ChatMessage.create({
      content: SR5Conceal.resultTable(rows, {
        observerName, targetName, mode: request.mode, skill: request.skill, attribute: request.attribute, limit
      }),
      whisper: game.users.filter(u => u.isGM).map(u => u.id),
    })
    //What the searcher learns; in a pat-down the one searched knows too
    const found = rows.filter(r => r.found).map(r => r.item.name)
    const text = found.length ? game.i18n.format("SR5.ConcealSearchFound", {
      observer: observerName, target: targetName, items: found.join(", ")
    }) : game.i18n.format("SR5.ConcealSearchNothing", {
      observer: observerName, target: targetName
    })
    const whisper = new Set(SR5Pickpocket.whisperFor(observer))
    if (request.mode === "patDown") for (const id of SR5Pickpocket.whisperFor(target)) whisper.add(id)
    await ChatMessage.create({
      content: `<p>${escape(text)}</p>`,
      whisper: Array.from(whisper),
    })
  }

  static resultTable(rows, {
    observerName, targetName, mode, skill, attribute, limit
  }) {
    // Not card-helpers' escape (N2): null and undefined show here as "null" and "undefined", not as an empty text
    const escape = foundry.utils.escapeHTML
    const t = key => escape(game.i18n.localize(key))
    const head = escape(game.i18n.format(mode === "patDown" ? "SR5.ConcealSearchRequestPatDown" : "SR5.ConcealSearchRequestSpot", {
      observer: observerName, target: targetName
    }))
    const how = `${escape(game.i18n.localize(CONFIG.SR5.skills?.[skill] ?? skill))} + ${escape(game.i18n.localize(CONFIG.SR5.characterAttributes?.[attribute] ?? attribute))}${limit ? ` [${limit}]` : ""}`
    const body = rows.map(r => {
      const mods = r.modifiers.map(m => `${m.value > 0 ? "+" : ""}${m.value}`).join(" ")
      let result = r.found ? t("SR5.ConcealSearchResultFound") : t("SR5.ConcealSearchResultMissed")
      if (r.criticalGlitch) result += ` (${t("SR5.ConcealSearchCriticalGlitch")})`
      else if (r.glitch) result += ` (${t("SR5.Glitch")})`
      return `<li><strong>${escape(r.item.name)}</strong> : ${escape(game.i18n.format("SR5.ConcealSearchLine", {
        pool: r.pool, mods: mods ? ` (${mods})` : "", hits: r.hits, hidden: r.hiddenHits
      }))} — <strong>${result}</strong><br><small>${escape(r.dice)}</small></li>`
    }).join("")
    return `<p><strong>${head}</strong><br>${how}</p><ul class="sr5-conceal-result">${body}</ul>`
  }
}
