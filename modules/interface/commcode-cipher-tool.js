// The gamemaster's cipher tool (lot 39, a bonus of the table asked by DjamZ on 14/10): any text (a clue, a note)
// ciphered with a key, to make a riddle the players undo by hand, and read back. It writes nothing in the world but
// the chat card the gamemaster chooses to post. The cipher is in system/commcode-cipher.js.

import {
  decipher, encipher, hasKey
} from "../system/commcode-cipher.js"

const {
  ApplicationV2
} = foundry.applications.api

export class SR5CipherTool extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sr5-cipher-tool",
    classes: ["sr5", "sr-application", "sr-commcode", "sr-cipher-tool"],
    position: {
      width: 520, height: "auto"
    },
    window: {
      title: "SR5.CIPHERTOOL_Title", icon: "fas fa-key", resizable: true
    },
    actions: {
      encipher: SR5CipherTool.#onEncipher,
      decipher: SR5CipherTool.#onDecipher,
      post: SR5CipherTool.#onPost,
    },
  }

  static open(){
    if (!game.user?.isGM) return
    const app = foundry.applications.instances.get("sr5-cipher-tool") ?? new SR5CipherTool()
    return app.render({
      force: true
    })
  }

  async _renderHTML(){
    const esc = foundry.utils.escapeHTML
    const t = key => esc(game.i18n.localize(key))
    const div = document.createElement("div")
    div.className = "sr-cipher-tool-body"
    div.innerHTML = `
      <p class="sr-commcode-hint">${t("SR5.CIPHERTOOL_Hint")}</p>
      <label>${t("SR5.CIPHERTOOL_Text")}<textarea name="source" rows="4" spellcheck="false"></textarea></label>
      <label>${t("SR5.CIPHERTOOL_Key")}<input type="text" name="key" autocomplete="off" spellcheck="false"></label>
      <div class="sr-commcode-call-buttons">
        <button type="button" data-action="encipher"><i class="fas fa-lock"></i> ${t("SR5.CIPHERTOOL_Encipher")}</button>
        <button type="button" data-action="decipher"><i class="fas fa-lock-open"></i> ${t("SR5.CIPHERTOOL_Decipher")}</button>
      </div>
      <label>${t("SR5.CIPHERTOOL_Result")}<textarea name="result" rows="4" readonly spellcheck="false"></textarea></label>
      <div class="sr-commcode-call-buttons">
        <button type="button" data-action="post"><i class="fas fa-comment"></i> ${t("SR5.CIPHERTOOL_Post")}</button>
      </div>`
    return div
  }

  _replaceHTML(result, content){
    // Keep what the gamemaster typed when the window is drawn again
    const kept = Object.fromEntries(Array.from(content.querySelectorAll("textarea, input")).map(f => [f.name, f.value]))
    content.replaceChildren(result)
    for (const [name, value] of Object.entries(kept)) {
      const field = content.querySelector(`[name="${name}"]`)
      if (field) field.value = value
    }
  }

  #field(name){
    return this.element.querySelector(`[name="${name}"]`)
  }

  #run(how){
    const key = this.#field("key").value
    if (!hasKey(key)) return ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_CipherNoKey"))
    this.#field("result").value = how(this.#field("source").value, key)
  }

  static #onEncipher(){
    this.#run(encipher)
  }

  static #onDecipher(){
    this.#run(decipher)
  }

  // The riddle goes to the chat, for all to see: the cipher only, never the key
  static async #onPost(){
    const text = this.#field("result").value.trim()
    if (!text) return
    const esc = foundry.utils.escapeHTML
    await ChatMessage.create({
      content: `<div class="sr-commcode-cipher-card"><p><i class="fas fa-key"></i> ${esc(game.i18n.localize("SR5.CIPHERTOOL_Posted"))}</p><p class="cipher">${esc(text).replace(/\n/g, "<br>")}</p></div>`,
      speaker: ChatMessage.getSpeaker({
        alias: game.i18n.localize("SR5.CIPHERTOOL_Title")
      }),
    })
  }
}
