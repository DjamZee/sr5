import {
  SR5 
} from "../config.js"
import {
  SR5_CharacterUtility 
} from "../entities/actors/utilityActor.js"
import {
  SR5_EntityHelpers 
} from "../entities/helpers.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  systemEffectWrite
} from "./effect-editor.js"
import {
  SR5_PrepareRollTest 
} from "../rolls/roll-prepare.js"
import {
  SR5_MiscellaneousHelpers
} from "../rolls/roll-helpers/miscellaneous.js"
import {
  clearRunning
} from "./running.js"
import {
  markSprintLaterPhases, SPRINT_FATIGUE_FLAG
} from "./sprint-fatigue.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  turnStepAllowed, passAllowed, initChangeAllowed
} from "../rolls/roll-helpers/socket-senders.js"

export class SR5Combat extends Combat {
  //Pass effects whose deletion is under way (see endOwnerPassEffects)
  static _endingPassEffects = new Set()

  get initiativePass(){
    return this.getFlag("sr5", "combatInitiativePass") || 1
  }

  set initiativePass(_value) {
    // No-op: use SR5Combat.setInitiativePass() to change this value
  }

  static async setInitiativePass(combat, pass){
    await combat.unsetFlag("sr5", "combatInitiativePass")
    await combat.setFlag("sr5", "combatInitiativePass", pass)
  }

  /**
	* @param combatant
	* @param adjustment
	**/
  static async adjustInitiative(combatant, adjustment){
    combatant = typeof combatant === 'string' ? this.combatants.find((c) => c.id === combatant) : combatant
    if (!combatant || typeof combatant === 'string') {
      console.error('Could not find combatant with id ', combatant)
      return
    }

    let key = SR5_CharacterUtility.findActiveInitiative(combatant.actor.system)
    let udpateData ={
      initiative: Number(combatant.initiative) + adjustment,
      "flags.sr5.currentInitRating" : combatant.actor.system.initiatives[key].value,
      "flags.sr5.currentInitDice" : combatant.actor.system.initiatives[key].dice.value,
    }
    if (!combatant.flags.sr5.hasPlayed && (combatant.id !== combatant.combat.current.combatantId)) {
      let actualCombatant = combatant.combat.combatants.find(c => c.id === combatant.combat.current.combatantId)
      if (actualCombatant.initiative > (combatant.initiative + adjustment)) {
        udpateData = foundry.utils.mergeObject(udpateData, {
          "flags.sr5.baseCombatantInitiative": Number(combatant.initiative) + adjustment
        })
      }
    }
    await combatant.update(udpateData)
  }

  static async seizeInitiative(combatant){
    let actor = SR5Combat.getActorFromCombatant(combatant)
    if (!actor) return
    //deepClone hands back the live data model: spend the Edge point by its path, as the roll tests do
    let edge = actor.system.conditionMonitors.edge
    if (edge?.actual?.value < edge?.value){
      await combatant.setFlag("sr5", "seizeInitiative", true)
      await actor.update({
        "system.conditionMonitors.edge.actual.base": edge.actual.base + 1
      })
      ui.notifications.info(`${actor.name} ${game.i18n.localize("SR5.INFO_ActorSeizeInitiative")}`)
    } else {
      ui.notifications.info(`${actor.name} ${game.i18n.localize("SR5.INFO_ActorSeizeInitiativeFailed")}`)
    }
  }

  static async blitz(combatant){
    let actor = SR5Combat.getActorFromCombatant(combatant)
    if (!actor) return
    let edge = actor.system.conditionMonitors.edge
    if (edge?.actual.value < edge?.value){
      await combatant.update({
        initiative: null,
        "flags.sr5.blitz": true,
      })
      await actor.update({
        "system.conditionMonitors.edge.actual.base": edge.actual.base + 1
      })
      ui.notifications.info(`${actor.name} ${game.i18n.localize("SR5.INFO_ActorUseBlitz")}`)
    } else {
      ui.notifications.info(`${actor.name} ${game.i18n.localize("SR5.INFO_ActorUseBlitzFailed")}`)
    }
  }

  static async delayAction(combatant){
    await combatant.setFlag("sr5", "delayedAction", true)
  }

  static async handleIniPass(combatId) {
    const combat = game.combats?.get(combatId)
    if (!combat) return

    const initiativePass = combat.initiativePass + 1
    const turn = 0
    const acting = []

    for (const combatant of combat.combatants) {
      await SR5Combat.decreaseInitiativePassEffects(combatant)
      const initiative = SR5Combat.reduceIniResultAfterPass(Number(combatant.initiative))
      await combatant.update({
        initiative: initiative,
        "flags.sr5.hasPlayed": combatant.isDefeated,
        "flags.sr5.baseCombatantInitiative": initiative,
      })
      //Update actor's action if he can still play next initiative pass
      if(initiative > 0){
        acting.push(combatant.id)
        if (!combatant.actor.isToken) await SR5Combat.resetActionInCombat(combatant.actorId, combatant)
        else await SR5Combat.resetActionInCombat(combatant.tokenId, combatant)
      }
    }

    //Sprint fatigue (SR5 p. 174): a sprinter of the pass just ended who acts again has a later phase
    const sprintLedger = markSprintLaterPhases(combat.flags?.sr5?.[SPRINT_FATIGUE_FLAG], combat.round, initiativePass, acting)
    if (sprintLedger) await combat.setFlag("sr5", SPRINT_FATIGUE_FLAG, sprintLedger)

    await SR5Combat.setInitiativePass(combat, initiativePass)
    await combat.update({
      turn
    })
    await SR5Combat.endOwnerPassEffects(combat, combat.combatant)
    return
  }

  static async handleNextRound(combatId){
    //SR5_SystemHelpers.srLog(3, "New combat round");
    const combat = game.combats?.get(combatId)
    if (!combat) return
    //SR5 p. 164: a character runs until the end of the Combat Turn
    await clearRunning(combat)
    await combat.resetAll()
    for (let combatant of combat.combatants) {
      combatant.update({
        "flags.sr5.seizeInitiative": false,
        "flags.sr5.blitz": false,
        "flags.sr5.hasPlayed": combatant.isDefeated,
      })
      await SR5Combat.decreaseInitiativePassEffects(combatant)
      await SR5Combat.manageTurnEnd(combatant)
      //Update actor's action: done here, on the gamemaster's side, whoever started the new round
      if (!combatant.actor.isToken) await SR5Combat.resetActionInCombat(combatant.actorId, combatant)
      else await SR5Combat.resetActionInCombat(combatant.tokenId, combatant)
    }
    await SR5Combat.setInitiativePass(combat, 1)
    await combat.rollAll()

    const turn = 0
    await combat.update({
      turn
    })
    //The new initiative order is known only now: this is the real start of the round's first turn
    await SR5Combat.endOwnerPassEffects(combat, combat.combatant)
  }

  setupTurns(){
    // Determine the turn order and the current turn
    const turns = super.setupTurns()
    return turns.sort(SR5Combat.sortByRERIC)
  }

  static sortByRERIC(left, right) {
    // Check if a combatant Seize the initiative
    const leftSeizeInit = left.flags.sr5?.seizeInitiative
    const rightSeizeInit = right.flags.sr5?.seizeInitiative
    if (leftSeizeInit === true && rightSeizeInit === false) return -1
    if (rightSeizeInit === true && leftSeizeInit === false) return 1
    // First sort by initiative value if different
    const leftInit = Number(left.flags.sr5?.baseCombatantInitiative)
    const rightInit = Number(right.flags.sr5?.baseCombatantInitiative)
    if (isNaN(leftInit)) return 1
    if (isNaN(rightInit)) return -1
    if (leftInit > rightInit) return -1
    if (leftInit < rightInit) return 1

    // now we sort by ERIC
    const genData = (actor) => {
      if (!actor) return [0, 0, 0, 0]
      // edge, reaction, intuition, coinflip
      return [
        actor.system.specialAttributes?.edge?.augmented.value,
        actor.system.attributes?.reaction?.augmented.value,
        actor.system.attributes?.intuition?.augmented.value,
        Math.ceil(Math.random() * 2),
      ]
    }

    const leftData = genData(left.actor)
    const rightData = genData(right.actor)
    // if we find a difference that isn't 0, return it
    for (let index = 0; index < leftData.length; index++) {
      const diff = rightData[index] - leftData[index]
      if (diff !== 0) return diff
    }

    return 0
  }

  /**
	* Return the position in the current ini pass of the next undefeated combatant.
	*/
  get nextUndefeatedTurnPosition(){
    for (let [turnInPass, combatant] of this.turns.entries()) {
      if (turnInPass <= this.turn) continue
      if (!combatant.defeated && combatant.initiative > 0 && !combatant.flags.sr5.hasPlayed) {
        return turnInPass
      }
    }
    return this.turns.length
  }

  /**
	* Return the position in the current ini pass of the next combatant that has an action phase left.
	*/
  get nextViableTurnPosition(){
    for (let [turnInPass, combatant] of this.turns.entries()) {
      if (turnInPass <= this.turn) continue
      if (combatant.initiative > 0 && !combatant.flags.sr5.hasPlayed) {
        return turnInPass
      }
    }
    return this.turns.length
  }

  /**
	* Determine wheter the current combat situation (current turn order) needs and can have an initiative pass applied.
	* @return true means that an initiative pass must be applied
	*/
  doIniPass(nextTurn){
    if (nextTurn < this.turns.length) return false
    const currentScores = this.combatants.map(combatant => Number(combatant.initiative))

    return SR5Combat.iniOrderCanDoAnotherPass(currentScores)
  }
	

  async nextTurn(){
    for (let combatant of this.combatants){
      if (combatant.id === this.current.combatantId){
        let actor = SR5Combat.getActorFromCombatant(combatant)
        await actor.setFlag("sr5", "cumulativeDefense", 0)
      }
    }
    // Maybe advance to the next round/init pass
    let nextRound = this.round
    let initiativePass = this.initiativePass
    // Get the next viable turn position.
    let nextTurn = this.settings.skipDefeated ? this.nextUndefeatedTurnPosition : this.nextViableTurnPosition

    // Start of the combat Handling
    if (nextRound === 0 && initiativePass === 0) {
      await this.startCombat()
      return
    }

    // Just step from one combatant to the next!
    if (nextTurn < this.turns.length) {
      //The GM works out the combatants himself: a player only asks for the turn (security lot, Thomas)
      if (game.user?.isGM) await this.stepTurn(nextTurn)
      else SR5_SocketHandler.emitForGM("updateCombat", {
        combatId: this.id,
        round: this.round,
        turn: nextTurn,
      })
      return
    }

    // Initiative Pass Handling. Owner permissions are needed to change the initiative pass.
    if (!game.user?.isGM && this.doIniPass(nextTurn)) {
      await this._createDoIniPassSocketMessage()
      return
    }

    if (game.user?.isGM && this.doIniPass(nextTurn)) {
      await SR5Combat.handleIniPass(this.id)
      return
    }

    return this.nextRound()
  }

  //Turn changed outside nextTurn (previous turn, turn set by hand in the tracker): the pass of the
  //new current combatant starts too, so the effects it gave until that pass end (Kill Code p. 43)
  _onUpdate(changed, options, userId){
    super._onUpdate(changed, options, userId)
    if (!("turn" in changed) || !game.user?.isActiveGM) return
    //A new round (nextRound, then resetAll with turnEvents false) still holds the old order: its first turn
    //starts once the initiative is rolled again, where handleNextRound ends the effects itself
    if ("round" in changed || options.turnEvents === false) return
    SR5Combat.endOwnerPassEffects(this, this.combatant).catch(e => console.error(e))
  }

  /** The next turn position, as nextTurn reads it */
  get nextTurnPosition(){
    return this.settings?.skipDefeated ? this.nextUndefeatedTurnPosition : this.nextViableTurnPosition
  }

  /** Step from the current combatant to the one at nextTurn: the current one has played, a delayed
   * action is spent. On the GM's browser. */
  async stepTurn(nextTurn){
    //Written on the combatants themselves: the combat's own update does not write its embedded combatants, and
    //hasPlayed stayed false (Jakob, Thomas pointe 3)
    const updates = []
    for (let combatant of this.combatants){
      if (combatant.flags.sr5?.delayedAction) updates.push({
        _id: combatant.id, "flags.sr5.delayedAction": false
      })
      else if (combatant.id === this.current.combatantId) updates.push({
        _id: combatant.id, "flags.sr5.hasPlayed": true
      })
    }
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates)
    await this.update({
      turn: nextTurn
    })
    await SR5Combat.endOwnerPassEffects(this, this.combatant)
  }

  /** Whether the sender is a GM or owns the combatant whose turn it is: the one who may end it */
  static ownsCurrentTurn(combat, sender){
    return !!sender && (sender.isGM || !!combat?.combatant?.testUserPermission?.(sender, "OWNER"))
  }

  static #refuse(kind, senderId, data){
    SR5_SystemHelpers.srLog(1, `Socket ${kind} refused from ${game.users.get(senderId)?.name ?? senderId}`, data)
    return false
  }

  //A player ends her turn: believed from the owner of the current combatant, and only for the turn the
  //GM finds next himself; the combatants are the GM's, never the request's (security lot, Thomas)
  static async _socketUpdateCombat(message, senderId){
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      },
      combat = game.combats?.get(data.combatId)
    if (!sender || !combat) return false
    const nextTurn = combat.nextTurnPosition
    if (!turnStepAllowed({
      senderIsGM: sender.isGM, ownsCurrent: SR5Combat.ownsCurrentTurn(combat, sender), askedTurn: data.turn, nextTurn, turns: combat.turns.length
    }) || data.round !== combat.round) return SR5Combat.#refuse("updateCombat", senderId, data)
    await combat.stepTurn(nextTurn)
    return true
  }

  async startCombat() {
    await SR5Combat.setInitiativePass(this, 1)
    await this.update({
      round: 1,
      turn: 0,
    })
    await this.rollAll()

    return this
  }

  async nextRound(){
    // Owner permissions are needed to change the shadowrun initiative round: the GM does it all, once he
    // finds the round over himself (security lot, Thomas)
    if (!game.user?.isGM) return this._createDoNextRoundSocketMessage()

    // Let Foundry handle time and some other things.
    await super.nextRound()
    for (let combatant of this.combatants){
      await combatant.setFlag("sr5", "hasPlayed", combatant.isDefeated)
    }
    await SR5Combat.handleNextRound(this.id)
  }

  /**
	* use default behaviour but ALWAYS start at the top!
	*/
  async rollAll(){
    const combat = await super.rollAll()
    if (combat.turn !== 0) await combat.update({
      turn: 0
    })
    return combat
  }

  async rollNPC(){
    const combat = await super.rollNPC()
    if (combat.turn !== 0) await combat.update({
      turn: 0
    })
    return combat
  }

  async rollInitiative(ids, {
    formula=null, updateTurn=true, messageOptions={
    }
  }={
  }) {

    // Structure input data
    ids = typeof ids === "string" ? [ids] : ids
    const currentId = this.combatant?.id
    const chatRollMode = game.settings.get("core", "rollMode")

    // Iterate over Combatants, performing an initiative roll for each
    const updates = []
    const messages = []
    for ( let [i, id] of ids.entries() ) {
      // Get Combatant data (non-strictly)
      const combatant = this.combatants.get(id)
      if ( !combatant?.isOwner ) continue

      // Produce an initiative roll for the Combatant
      const roll = combatant.getInitiativeRoll(formula)
      await roll.evaluate()
      let initiative = roll.total

      if (this.flags.sr5?.combatInitiativePass > 1){
        let currentPass = this.flags.sr5?.combatInitiativePass - 1
        initiative -= (currentPass * 10)
        if (initiative < 0) initiative = 0
      }
      updates.push({
        _id: id, 
        initiative: initiative, 
        "flags.sr5.baseCombatantInitiative": initiative,
      })

      // Construct chat message data
      let title
      switch (SR5_CharacterUtility.findActiveInitiative(combatant.actor.system)) {
        case "physicalInit":
          title = game.i18n.localize('SR5.InitiativePhysical')
          break
        case "astralInit":
          title = game.i18n.localize('SR5.InitiativeAstral')
          break
        case "matrixInit":
          title = game.i18n.localize('SR5.InitiativeMatrix')
          break
      }
      let templateData = {
        actor: combatant.actor,
        title: title,
        roll: roll,
      }

      const template = `systems/sr5/templates/rolls/roll-init.hbs`
      const html = await foundry.applications.handlebars.renderTemplate(template, templateData)

      const messageData = foundry.utils.mergeObject(
        {
          speaker: {
            scene: this.scene?.id,
            actor: combatant.actor?.id,
            token: combatant.token?.id,
            alias: combatant.name
          },
          content: html,
          flags: {
            "core.initiativeRoll": true,
            "img": combatant.img,
            css: "SRCustomMessage",
          },
        },
        messageOptions
      )

      let chatData = new ChatMessage(messageData, {
        create: false
      })

      // If the combatant is hidden, use a private roll unless an alternative rollMode was explicitly requested
      chatData.rollMode = "rollMode" in messageOptions ? messageOptions.rollMode :
        (combatant.hidden ? CONST.DICE_ROLL_MODES.PRIVATE : chatRollMode )

      // Play 1 sound for the whole rolled set
      if ( i > 0 ) chatData.sound = null
      messages.push(chatData.toObject())
    }

    if ( !updates.length ) return this

    // Update multiple combatants
    await this.updateEmbeddedDocuments("Combatant", updates)

    // Ensure the turn order remains with the same combatant
    if ( updateTurn && currentId ) {
      await this.update({
        turn: this.turns.findIndex(t => t.id === currentId)
      })
    }

    if (this.initiativePass === 1) await this.update({
      turn: 0
    })

    // Create multiple chat messages
    await ChatMessage.implementation.create(messages)

    return this
  }

  static iniOrderCanDoAnotherPass(scores){
    for (const score of scores) {
      if (SR5Combat.iniScoreCanDoAnotherPass(score)) return true
    }
    return false
  }

  /**
	* Check if there is another initiative pass possible with the given score.
	* @param score
	* @return true means another initiative pass is possible
	*/
  static iniScoreCanDoAnotherPass(score){
    return SR5Combat.reduceIniResultAfterPass(score) > 0
  }

  /**
	* Reduce the given initiative score according to @PDF SR5#159
	* @param score This given score can't be reduced under zero.
	*/
  static reduceIniResultAfterPass(score){
    return Math.max(score -10, 0)
  }

  //A new round, asked by the owner of the current combatant once nobody has a turn left in the round
  //and no initiative pass is due, as the GM finds it himself (security lot, Thomas): a player's console
  //reset every initiative of the fight
  static async _socketDoNextRound(message, senderId) {
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      },
      combat = typeof data.id === "string" ? game.combats?.get(data.id) : null
    if (!sender || !combat) return SR5Combat.#refuse("doNextRound", senderId, data)
    const nextTurn = combat.nextTurnPosition
    const due = data.round === combat.round && nextTurn >= combat.turns.length && !combat.doIniPass(nextTurn)
    if (!passAllowed({
      senderIsGM: sender.isGM, ownsCurrent: SR5Combat.ownsCurrentTurn(combat, sender), due
    })) return SR5Combat.#refuse("doNextRound", senderId, data)
    return combat.nextRound()
  }

  //A new initiative pass (SR5 p. 159), on the same terms, once the GM finds it due
  static async _socketDoInitPass(message, senderId) {
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      },
      combat = typeof data.id === "string" ? game.combats?.get(data.id) : null
    if (!sender || !combat) return SR5Combat.#refuse("doInitPass", senderId, data)
    const due = data.round === combat.round && data.pass === combat.initiativePass && combat.doIniPass(combat.nextTurnPosition)
    if (!passAllowed({
      senderIsGM: sender.isGM, ownsCurrent: SR5Combat.ownsCurrentTurn(combat, sender), due
    })) return SR5Combat.#refuse("doInitPass", senderId, data)
    return await SR5Combat.handleIniPass(combat.id)
  }

  //The round and the pass the request was made in: a request repeated after the GM moved on is refused
  async _createDoNextRoundSocketMessage() {
    await SR5_SocketHandler.emitForGM("doNextRound", {
      id: this.id, round: this.round
    })
  }

  async _createDoIniPassSocketMessage() {
    await SR5_SocketHandler.emitForGM("doInitPass", {
      id: this.id, round: this.round, pass: this.initiativePass
    })
  }

  static getActorFromCombatant(combatant){
    //The synthetic actor of an unlinked token, found without the canvas
    return combatant.actor
  }

  static getCombatantFromActor(document){
    if (!game.combat) return
    let combatant
    if (document.isToken) combatant = game.combat.combatants.find(c => c.tokenId === document.token.id)
    //The base actor of unlinked tokens is none of them: its sheet, opened from the actors list, spent the actions
    //of the first token of the combat (Blandine)
    else combatant = game.combat.combatants.find(c => c.actorId === document.id && c.token?.actorLink !== false)
    return combatant
  }

  //The id a change of initiative names a fighter by: an unlinked token's actor shares its base actor's id, so its token's
  static fighterIdOf(actor){
    return actor?.isToken ? actor.token?.id : actor?.id
  }

  //An actor update that can change the initiative of its fighter: the comparison with the combatant is harmless otherwise.
  //Items written through the actor (the sheet's toggles) count: wired reflexes switched on add Reaction and a die (SR5 p. 162)
  static updateMovesInitiative(data){
    return !!(data?.system?.initiatives || data?.system?.conditionMonitors || data?.system?.matrix || data?.system?.attributes || Array.isArray(data?.items))
  }

  //The ids to compare again after an update of this actor: an unlinked token's own, or every fighter of a base actor,
  //each unlinked token by its own id (its synthetic actor is prepared again from the base) and the linked ones by the actor's
  static initTargetsOfActor(document){
    if (!game.combat || !document) return []
    if (document.isToken) return document.token?.id ? [document.token.id] : []
    const ids = new Set()
    for (const combatant of game.combat.combatants){
      if (combatant.actorId !== document.id) continue
      ids.add(combatant.token?.actorLink === false ? combatant.tokenId : document.id)
    }
    return [...ids]
  }

  //The dice kept for a fighter: only this round's and this initiative's, and only values a d6 can give (a new round rolls
  //the initiative again, SR5 p. 159)
  static initDiceKept(stored, round, initKey){
    const clean = list => Array.isArray(list) ? list.filter(v => Number.isInteger(v) && v >= 1 && v <= 6).slice(0, 10) : []
    if (!stored || stored.round !== round || stored.initKey !== initKey) return {
      added: [], removed: []
    }
    return {
      added: clean(stored.added), removed: clean(stored.removed)
    }
  }

  //Dice gained (delta > 0) take back the dice lost this round first, dice lost take back the dice gained this round
  //first; only what remains is rolled (fresh), as the book asks for a die never rolled
  static async takeInitDice(kept, delta, fresh){
    const added = [...kept.added], removed = [...kept.removed], values = []
    const [from, to] = delta > 0 ? [removed, added] : [added, removed]
    const count = Math.abs(delta)
    while (values.length < count && from.length) values.push(from.pop())
    values.push(...await fresh(count - values.length))
    to.push(...values)
    return {
      values, memory: {
        added, removed
      }
    }
  }

  static async changeInitInCombat(documentId, initChange){
    if (!game.combat) return
    let document = SR5_EntityHelpers.getRealActorFromID(documentId)
    let combatant = SR5Combat.getCombatantFromActor(document),
      sign

    if (!combatant) return
    if (combatant.initiative <= 0) return
    //The fighter's own actor: an unlinked token's, not the base actor whose id it shares (SR5 p. 162 and 171)
    document = combatant.actor ?? document

    let initKey = SR5_CharacterUtility.findActiveInitiative(document.system),
      initRatingChange = (initChange ||0), 
      initDiceChange = 0, 
      diceResult = 0,
      diceToRoll = 0

    if (document.system.initiatives[initKey].value !== combatant.flags.sr5.currentInitRating) initRatingChange += document.system.initiatives[initKey].value - combatant.flags.sr5.currentInitRating
    if (document.system.initiatives[initKey].dice.value !== combatant.flags.sr5.currentInitDice) {
      const delta = document.system.initiatives[initKey].dice.value - combatant.flags.sr5.currentInitDice
      sign = Math.sign(delta)
      diceToRoll = Math.abs(delta)
      if (isNaN(diceToRoll)) diceToRoll = 0
      else {
        //SR5 p. 162: dice gained or lost are rolled. A die already rolled this round is kept (ruling of DjamZ, 2026-10-06):
        //switching wired reflexes off and on again gives back the same die, it does not roll it again. The memory lives on
        //the combat, which the GM alone writes, never on the combatant a player owns
        const combat = combatant.combat
        const kept = SR5Combat.initDiceKept(combat?.flags?.sr5?.initDiceKept?.[combatant.id], combat?.round, initKey)
        const fresh = async n => n > 0 ? (await new Roll(`${n}d6`).evaluate()).dice[0].results.map(r => r.result) : []
        const {
          values, memory
        } = await SR5Combat.takeInitDice(kept, delta, fresh)
        diceResult = values.reduce((sum, v) => sum + v, 0)
        if (combat && game.users?.activeGM?.isSelf) await combat.update({
          [`flags.sr5.initDiceKept.${combatant.id}`]: {
            ...memory, round: combat.round, initKey
          }
        })
      }
      if (sign > 0) initDiceChange += diceResult
      else initDiceChange -= diceResult
    }
    if (isNaN(initRatingChange)) initRatingChange = 0
    let initFinalChange = initRatingChange + initDiceChange

    if (initRatingChange !== 0  || initDiceChange !== 0) {
      await SR5Combat.adjustInitiative(combatant, initFinalChange)
      let signDice ="", signRating="", initRatingValue = Math.abs(initRatingChange), initDiceValue = Math.abs(diceResult)

      if (sign < 0) signDice = "-"
      else signDice = "+"

      if (initRatingChange > 0) signRating = "+"
      else signRating = "-"

      if (diceToRoll > 0) ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_ChangeInitInCombat", {
        signRating: signRating, signDice: signDice, diceToRoll: diceToRoll, initDiceChange: initDiceValue, initRatingChange: initRatingValue, initFinalChange: initFinalChange
      })}`)
      else ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_ChangeInitInCombatNoDices", {
        initFinalChange: initFinalChange
      })}`)
    }
  }

  //A change of initiative: from a GM or the owner of the fighter (her own fear, stun, full defense or
  //interruption); anyone else only gets the sheet read again, no change of hers (security lot, Thomas)
  static async _socketChangeInitInCombat(message, senderId){
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      },
      document = SR5_EntityHelpers.getRealActorFromID(data.documentId)
    if (!sender || !document) return SR5Combat.#refuse("changeInitInCombat", senderId, data)
    //The guard is the active GM's: a request sent to another GM is not run behind his back
    if (game.users.activeGM && game.users.activeGM.id !== game.user?.id) return SR5Combat.#refuse("changeInitInCombat", senderId, data)
    if (!initChangeAllowed({
      senderIsGM: sender.isGM, ownsActor: !!document.testUserPermission?.(sender, "OWNER"), initChange: data.initChange
    })) return SR5Combat.#refuse("changeInitInCombat", senderId, data)
    const initChange = Number.isFinite(data.initChange) ? data.initChange : undefined
    await SR5Combat.changeInitInCombat(data.documentId, initChange)
  }

  static async changeInitInCombatHelper(documentId, initChange){
    if (!game.user?.isGM) {
      await SR5_SocketHandler.emitForGM("changeInitInCombat", {
        documentId: documentId,
        initChange: initChange,
      })
    } else await SR5Combat.changeInitInCombat(documentId, initChange)
  }

  static async changeActionInCombat(documentId, actions, updateActor = true){
    //A manual adjustment that gives actions back (negative value) is the GM's: a player does not raise the actions
    //of her character herself (ruling of DjamZ, 2026-10-06, G13). Refunds of the system stay capped by spendActions
    if (!game.user?.isGM && actions?.some(a => a?.source === "manual" && Number(a.value) < 0)) {
      return ui.notifications.warn(game.i18n.localize("SR5.WARN_RaiseActionsGMOnly"))
    }
    let actor = await SR5_EntityHelpers.getRealActorFromID(documentId)
    if (!actor) return
    //The prepared counters: a refund is capped at what the pass grants, the prepared value (base and the item effects
    //that add actions). The source copy only carries the stored default, and capped a refund below it
    let counters = foundry.utils.deepClone(actor.system.specialProperties.actions)
    let combatant = await SR5Combat.getCombatantFromActor(actor)
    let initModifier
    if (!combatant) return

    //Update actor actions: the counters only, never the prepared values written in the source
    if (updateActor){
      //SR5 p. 164: a simple action spent leaves no complex one, and the reverse
      SR5_MiscellaneousHelpers.spendActions(counters, actions.filter(a => a.type !== "special"))
      await actor.update({
        "system.specialProperties.actions.free.current": counters.free.current,
        "system.specialProperties.actions.simple.current": counters.simple.current,
        "system.specialProperties.actions.complex.current": counters.complex.current,
      })
    }

    //... and combatant actions
    await combatant.update({
      "flags.sr5.actions.free": counters.free.current,
      "flags.sr5.actions.simple": counters.simple.current,
      "flags.sr5.actions.complex": counters.complex.current,
    })
		
    for (let action of actions){
      if (action.source === "manual") {
        action.value = -action.value
        let sign = action.value > 0 ? "+" : ""
        ui.notifications.info(`${game.i18n.format("SR5.INFO_TakeActionsManually", {
          actor: actor.name, actionValue: action.value, actionType: game.i18n.localize(SR5.actionTypes[action.type]), sign: sign
        })}`) 
      }
      else ui.notifications.info(`${game.i18n.format("SR5.INFO_TakeActions", {
        actor: actor.name, actionValue: action.value, actionType: game.i18n.localize(SR5.actionTypes[action.type]), actionSource: game.i18n.localize(SR5.actionSources[action.source])
      })}`) 
    }
    // SR5 p. 170: every interruption action of the list lowers the Initiative score by its own cost
    initModifier = -SR5_MiscellaneousHelpers.interruptionInitiativeCost(actions)
    if (initModifier) await SR5Combat.changeInitInCombatHelper(documentId, initModifier)

    // SR5 p. 178: a simple or complex action spent on something other than firing ends the progressive recoil.
    // Attacks are handled in SR5_RollTest.rollTest (only ranged attacks build recoil); manual adjustments are bookkeeping.
    // A change of firing mode or choke spent with the shot is handled by the roll itself, which fired after it
    if (actions.some(a => (a.type === "simple" || a.type === "complex") && !["attack", "manual", "changeFiringMode", "changeChokeSettings"].includes(a.source))) await actor.resetRecoil()

    //Decrease external effect duration
    for (let item of actor.items){
      if (item.type === "itemEffect") {
        let itemData = foundry.utils.duplicate(item.system)

        //Decrease effect duration
        if (item.system.durationType === "action"){
          itemData.duration -= 1
          //Delete effect if duration < 0;
          if (itemData.duration <= 0){
            await actor.deleteEmbeddedDocuments("Item", [item.id])
            await SR5_EntityHelpers.deleteEffectOnActor(actor, item.system.type)
            ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DurationFinished", {
              effect: item.name
            })}`)
          } else {
            await item.update({
              system: itemData
            })
            ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DurationReduceOneRound", {
              effect: item.name
            })}`)
          }
        }
      }
    }

  }

  //When the world setting asks for it, refuses an action the character no longer has in this initiative pass,
  //with a warning: nothing is spent (SR5 p. 164-165). Unchecked (default), or out of combat, every action goes through
  //A simple or complex action outside the character's phase, or with a score of 0 or less (SR5 p. 162 and 164), is
  //only a warning; with the setting checked, a score of 0 or less refuses it like a missing action
  static hasActionsLeft(actor, actions){
    if (!actor || !game.combat) return true
    let combatant = SR5Combat.getCombatantFromActor(actor)
    if (!combatant) return true
    let block = game.settings.get("sr5", "sr5BlockMissingActions")
    if (game.combat.started && combatant.initiative !== null && combatant.initiative !== undefined){
      let problem = SR5_MiscellaneousHelpers.actionPhaseProblem(actions, {
        initiative: combatant.initiative, isCurrent: game.combat.combatant?.id === combatant.id
      })
      if (problem) ui.notifications.warn(game.i18n.format(problem === "noInitiative" ? "SR5.WARN_ActionNoInitiative" : "SR5.WARN_ActionOutOfPhase", {
        actor: actor.name, initiative: combatant.initiative
      }))
      if (problem === "noInitiative" && block) return false
    }
    if (!block) return true
    let missing = SR5_MiscellaneousHelpers.missingAction(actions, actor.system.specialProperties?.actions)
    if (!missing) return true
    ui.notifications.warn(game.i18n.format("SR5.WARN_NoActionLeft", {
      actor: actor.name, value: missing.value, action: game.i18n.localize(SR5.actionTypes[missing.type]), current: missing.current
    }))
    return false
  }

  //Reset actions on actor
  static async resetActionInCombat(documentId, combatant){
    //Only the gamemaster gives actions back (a new pass, a new round, or the tracker entry)
    if (!game.user?.isGM) return ui.notifications.warn(game.i18n.localize("SR5.WARN_ResetActionsGMOnly"))
    let actor = combatant?.actor ?? SR5_EntityHelpers.getRealActorFromID(documentId)
    if (!actor) return
    //The prepared value carries the extra actions granted by effects: a copy of system would hold the stored one
    let actions = actor.system.specialProperties.actions
    let actionsUpdate = {
    }
    for (let key of Object.keys(SR5.actionTypes)) {
      if (actions[key]) actionsUpdate[`system.specialProperties.actions.${key}.current`] = actions[key].value
    }
    await combatant.update({
      "flags.sr5.actions.free": actions.free.value,
      "flags.sr5.actions.simple": actions.simple.value,
      "flags.sr5.actions.complex": actions.complex.value,
    })
    await actor.update(actionsUpdate)
  }

  //Effects lasting until the next Initiative Pass (Kill Code p. 43, I Am the Firewall): counted down at each pass and each new round
  static async decreaseInitiativePassEffects(combatant){
    let actor = SR5Combat.getActorFromCombatant(combatant)
    if (!actor) return
    for (let item of actor.items){
      if (item.type !== "itemEffect" || item.system.durationType !== "initiativePass") continue
      //Tied to its owner's next pass, even in the next round: ended when the owner's turn starts
      if (SR5Combat.endsOnOwnerTurn(item, combatant.combat)) continue
      let duration = item.system.duration - 1
      if (duration <= 0){
        await actor.deleteEmbeddedDocuments("Item", [item.id])
        ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DurationFinished", {
          effect: item.name
        })}`)
      } else await item.update({
        "system.duration": duration
      })
    }
  }

  //Kill Code p. 43: the I Am the Firewall bonus lasts until the start of the hacker's next Initiative Pass.
  //Only when the hacker fights in this combat; otherwise the effect keeps its pass countdown
  static endsOnOwnerTurn(item, combat){
    if (item.system.type !== "iAmTheFirewall" || !combat) return false
    return combat.combatants.some(c => c.actorId === item.system.ownerID)
  }

  //Turn start: the effects the starting combatant gave to its allies until its next pass are over
  static async endOwnerPassEffects(combat, combatant){
    let ownerId = combatant?.actorId
    if (!ownerId) return
    for (let c of combat.combatants){
      let actor = SR5Combat.getActorFromCombatant(c)
      if (!actor) continue
      //An effect already being deleted by a concurrent call (turn set by hand and by the system) is skipped
      let ended = actor.items.filter(i => i.type === "itemEffect" && i.system.durationType === "initiativePass" && i.system.ownerID === ownerId && SR5Combat.endsOnOwnerTurn(i, combat) && !SR5Combat._endingPassEffects.has(i.uuid ?? i.id))
      if (!ended.length) continue
      const keys = ended.map(i => i.uuid ?? i.id)
      for (let k of keys) SR5Combat._endingPassEffects.add(k)
      try {
        await actor.deleteEmbeddedDocuments("Item", ended.map(i => i.id))
      } finally {
        for (let k of keys) SR5Combat._endingPassEffects.delete(k)
      }
      for (let item of ended) ui.notifications.info(`${c.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DurationFinished", {
        effect: item.name
      })}`)
    }
  }


  //Do stuff on actor when turn is ending
  static async manageTurnEnd(combatant){
    let actor = SR5Combat.getActorFromCombatant(combatant)
    if (!actor) return

    let damageInfo

    //Decrease external effect duration
    for (let item of actor.items){
      if (item.type === "itemEffect") {
        let itemData = foundry.utils.duplicate(item.system)

        //Decrease effect duration
        if (item.system.durationType === "round"){
          itemData.duration -= 1
          //Delete effect if duration < 0;
          if (itemData.duration <= 0){
            await actor.deleteEmbeddedDocuments("Item", [item.id])
            await SR5_EntityHelpers.deleteEffectOnActor(actor, item.system.type)
            ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DurationFinished", {
              effect: item.name
            })}`)

            //Head case Attribute Boost (Stolen Souls p. 201): Stun damage equal to the hits once the boost ends.
            //Applied straight to the monitor: this is not an attack, so no knockdown check
            if (itemData.type === "naniteAttributeBoost" && Number(itemData.value) > 0 && actor.system.conditionMonitors.stun) {
              //Dynamic import: entityActor-helpers already imports this module
              const {
                SR5_ActorHelper
              } = await import("../entities/actors/entityActor-helpers.js")
              // Excess Stun carries over to Physical, then to overflow (SR5 p. 171, 172)
              let monitors = foundry.utils.deepClone(actor.system.conditionMonitors)
              monitors.stun.actual.base += Number(itemData.value)
              SR5_EntityHelpers.updateValue(monitors.stun.actual, 0)
              const overflow = SR5_ActorHelper.carryMonitorOverflow(monitors, actor.type)
              let monitorUpdates = {
              }
              for (let key of ["stun", "physical", "overflow"]) {
                if (monitors[key]?.actual) monitorUpdates[`system.conditionMonitors.${key}.actual.base`] = monitors[key].actual.base
              }
              await actor.update(monitorUpdates)
              ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_NaniteBoostDamage", {
                damage: itemData.value
              })}`)
              if (overflow.carriedDamage > 0) ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${overflow.carriedDamage}${game.i18n.localize(SR5.damageTypesShort.physical)} ${game.i18n.localize("SR5.Applied")}.`)
              if (overflow.isDead) await SR5_ActorHelper.createDeadEffect(actor.id)
              else if (monitors.stun.actual.value >= monitors.stun.value) await SR5_ActorHelper.createKoEffect(actor.id)
            }
          } else {
            await item.update({
              system: itemData
            })
            ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_DurationReduceOneRound", {
              effect: item.name
            })}`)
          }
        }

        //Special case : Acid Damage
        //SR5 p. 172: each Combat Turn the acid DV drops by 1 and the damage is applied again, and the acid eats
        //1 more point of armor until its DV reaches 0. The effect value is a text field: convert it before
        //subtracting, and store the reduced DV for the next turn
        let acidValue = Number(itemData.value) - 1
        if (itemData.type === "acidDamage" && acidValue > 0) {
          let armor = actor.items.find((i) => i.type === "itemArmor" && i.system.isActive && !i.system.isAccessory)
          if (armor){
            //Only the effects, copied from the source: the prepared armor written back put its computed values in the source
            let itemEffects = Object.values(armor.toObject().system.itemEffects ?? [])
            let itemEffect = itemEffects.find((e) => e.target === "system.armorValue")
            if (itemEffect){
              itemEffect.value -= 1
            } else {
              let armorEffect = {
                "name": `${game.i18n.localize("SR5.ElementalDamage")} (${game.i18n.localize("SR5.ElementalDamageAcid")})`,
                "target": "system.armorValue",
                "wifi": false,
                "type": "value",
                "value": -1,
                "multiplier": 1
              }
              itemEffects.push(armorEffect)
            }
            await actor.updateEmbeddedDocuments("Item", [{
              _id: armor.id, "system.itemEffects": itemEffects
            }], systemEffectWrite())
            ui.notifications.info(`${combatant.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.format("SR5.INFO_AcidReduceArmor", {
              armor: armor.name
            })}`)
          }

          damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
          damageInfo.damage.resistanceType = "physicalDamage"
          damageInfo.damage.value = acidValue
          damageInfo.damage.type = "physical"
          damageInfo.damage.element = "acid"

          actor.rollTest("resistanceCard", null, damageInfo)
          if (actor.items.get(item.id)) await item.update({
            "system.value": acidValue
          })
        }

        //Apply Fire effect if any
        //SR5 p. 173: the fire DV starts at 3 and goes up by 1 each Combat Turn. The effect value is a text field:
        //adding 1 to it would append a digit ("3" + 1 = "31")
        if (itemData.type === "fireDamage") {
          let fireValue = Number(itemData.value)
          damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
          damageInfo.damage.value = fireValue
          damageInfo.damage.type = "physical"

          await actor.takeDamage(damageInfo)
          itemData.value = fireValue + 1
          ui.notifications.info(`${combatant.name} ${game.i18n.format("SR5.INFO_FireDamageIncrease", {
            fire: itemData.value
          })}`)
          await item.update({
            system: itemData
          })
        }
      }

    }

    //Remove full defense effect
    if (actor.effects.find(e => e.origin === "fullDefense")){
      await SR5_EntityHelpers.deleteEffectOnActor(actor, "fullDefense")
      ui.notifications.info(`${combatant.name} ${game.i18n.localize("SR5.INFO_FullDefenseEnd")}`)
    }

    //Reset Spell defense dice pool, by path: deepClone(actor.system) handed back the live data model, and an
    //update given that model recorded nothing, so the pool was never reset
    //Read actor.system afresh, as the damage and effect updates above have rebuilt it
    let counterSpellPool = actor.system.magic?.counterSpellPool
    if (counterSpellPool && counterSpellPool.current !== counterSpellPool.value){
      await actor.update({
        "system.magic.counterSpellPool.current": counterSpellPool.value
      })
    }

    //Handle Regeneration
    let actorData = actor.system
    if (actorData.specialProperties?.regeneration){
      if (actorData.conditionMonitors.physical?.actual?.value > 0 || actorData.conditionMonitors.stun?.actual?.value > 0 || actorData.conditionMonitors.condition?.actual?.value > 0)
        actor.rollTest("regeneration")
    }
  }

}


//Custom Initiative formula
export const _getInitiativeFormula = function() {
  const actor = this.actor
  if ( !actor ) return "1d6"

  let key = SR5_CharacterUtility.findActiveInitiative(actor.system)
  let initiative = actor.system.initiatives[key].value
  let initiativeDice = actor.system.initiatives[key].dice.value + "d6"
  if (this.flags.sr5?.blitz) initiativeDice = "5d6"

  const parts = [initiative, initiativeDice]
  return parts.filter((p) => p !== null).join(" + ")
}