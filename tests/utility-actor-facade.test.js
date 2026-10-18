import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

// The 110 static methods of SR5_CharacterUtility, captured before utilityActor.js was split into family files (N5)
const METHODS = [
  "_actorModifPossession", "_englishLabel", "_generateKnowledgeSkills", "_generateLanguageSkills",
  "aiProgramCap", "aiProgramCapWarning", "applyAIProgramCap", "applyAugmentationCap",
  "applyAutosoftEffect", "applyCustomEffects", "applyFocusBonus", "applyHostType", "applyMentorSpirit",
  "applyMetahumanAdaptation", "applyMysticAptitude", "applyPenalty", "applyProgramToAgent",
  "applyRacialModifers", "applySpeedDemon", "applyVehicleReplacements", "applyVisionToToken",
  "canSwitchToInitiative", "capRemoteLimit", "capVehicleArmor", "defaultInitiative",
  "devicelessAILogicStandIn", "findActiveInitiative", "generateAgentMatrix", "generateDeviceMatrix",
  "generateDeviceMatrixActions", "generateDevicelessAIMatrixResistance", "generateDrugAddiction",
  "generateMatrixActions", "generateMatrixActionsDefenses", "generateMatrixAttributes",
  "generateMatrixResistances", "generateRammingTest", "generateResonanceMatrix", "generateSpiritSkills",
  "generateSpriteMatrix", "generateSpriteSkills", "generateVehicleMatrix", "generateVehicleSkills",
  "generateVehicleTest", "getCyberEyes", "getMetatype", "getTokensOfActor", "grantMetatypeVision",
  "handleAstralVision", "handleDrugShots", "handleSecondaryAttributes", "handleSensorVision",
  "handleSustaining", "handleVehiclePriceMultiplier", "handleVision", "isDeckUnconfigured",
  "isDepthActive", "isDevicelessAI", "isLocalDroneAutosoft", "keepStrongestFocus",
  "keepStrongestFocusOn", "refreshVisionOfTokens", "registerIndirectEffect", "registerSituationalEffect",
  "resetCalculatedValues", "resetMatrixActionRules", "setSpiritMagicType", "settleMetatypeVision",
  "switchProgramFlagByName", "switchToInitiative", "switchVision", "updateActions", "updateArmor",
  "updateAstralValues", "updateAttributes", "updateBackgroundCount", "updateConditionMonitors",
  "updateControledVehicle", "updateCounterSpellPool", "updateDefenses", "updateDerivedAttributes",
  "updateEncumbrance", "updateEssence", "updateGreyMana", "updateInitiativeAstral",
  "updateInitiativeMatrix", "updateInitiativePhysical", "updateKarmas", "updateLimits",
  "updateMagicMasteries", "updateMatrixEffect", "updateModificationsSlots", "updateMovements",
  "updateNotoriety", "updateNuyens", "updatePenalties", "updatePowerPoints", "updateProgramAgent",
  "updatePublicAwareness", "updateRecoil", "updateResistances", "updateSkills",
  "updateSpecialAttributes", "updateSpecialProperties", "updateSpiritAttributes", "updateSpiritValues",
  "updateSpriteValues", "updateStreetCred", "updateTradition", "updateVehicleSlots",
]

describe("SR5_CharacterUtility facade", () => {
  const own = Object.getOwnPropertyNames(SR5_CharacterUtility).filter(n => !["length", "name", "prototype"].includes(n))

  it("keeps exactly the same 110 static methods", () => {
    expect(METHODS).toHaveLength(110)
    expect([...own].sort()).toEqual([...METHODS].sort())
  })

  it("keeps them as class statics: functions, non-enumerable, writable, configurable", () => {
    for (const name of METHODS) {
      const descriptor = Object.getOwnPropertyDescriptor(SR5_CharacterUtility, name)
      expect(typeof descriptor.value, name).toBe("function")
      expect(descriptor.enumerable, name).toBe(false)
      expect(descriptor.writable, name).toBe(true)
      expect(descriptor.configurable, name).toBe(true)
    }
  })

  it("keeps its class name and still extends Actor", () => {
    expect(SR5_CharacterUtility.name).toBe("SR5_CharacterUtility")
    expect(Object.getPrototypeOf(SR5_CharacterUtility)).toBe(globalThis.Actor)
  })

  it("routes internal calls through the class, so a spy sees them", () => {
    const spy = vi.spyOn(SR5_CharacterUtility, "updateStreetCred").mockImplementation(() => {})
    globalThis.game = {
      ...globalThis.game, i18n: {
        localize: key => key 
      } 
    }
    SR5_CharacterUtility.updateNotoriety({
      system: {
        notoriety: {
          base: -2, modifiers: [] 
        }, streetCred: {
          base: 0, modifiers: [] 
        } 
      } 
    })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
