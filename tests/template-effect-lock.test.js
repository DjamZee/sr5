import {
  describe, it, expect, vi, afterEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"

// M1 D-M1-2: the template hook and the token hook both called createTemplateEffect for the same token and template
// at the same moment; each looked for the effect, found none, and created it: two "Mana barrier" items, -6 instead of
// -3. The calls for one token and one template now run one after the other, so the second one sees the first item.
describe("createTemplateEffect for one token and one template", () => {
  afterEach(() => vi.restoreAllMocks())

  it("runs the calls one after the other, never together", async () => {
    let running = 0, overlap = false
    const order = []
    vi.spyOn(SR5_EffectArea, "_createTemplateEffect").mockImplementation(async (token, template) => {
      running++
      if (running > 1) overlap = true
      await new Promise(resolve => setTimeout(resolve, 5))
      order.push(`${token.id}.${template.id}`)
      running--
    })
    const token = {
      id: "t1"
    }, template = {
      id: "m1"
    }
    await Promise.all([SR5_EffectArea.createTemplateEffect(token, template), SR5_EffectArea.createTemplateEffect(token, template)])
    expect(overlap).toBe(false)
    expect(order).toEqual(["t1.m1", "t1.m1"])
  })

  it("lets two different tokens go together, and goes on after a failure", async () => {
    let running = 0, together = false
    vi.spyOn(SR5_EffectArea, "_createTemplateEffect").mockImplementation(async token => {
      running++
      if (running > 1) together = true
      await new Promise(resolve => setTimeout(resolve, 5))
      running--
      if (token.id === "bad") throw new Error("failed")
    })
    const template = {
      id: "m1"
    }
    await Promise.all([SR5_EffectArea.createTemplateEffect({
      id: "a"
    }, template), SR5_EffectArea.createTemplateEffect({
      id: "b"
    }, template)])
    expect(together).toBe(true)
    await expect(SR5_EffectArea.createTemplateEffect({
      id: "bad"
    }, template)).rejects.toThrow()
    await expect(SR5_EffectArea.createTemplateEffect({
      id: "bad2"
    }, template)).resolves.toBeUndefined()
  })
})
