import {
  describe, it, expect, vi
} from 'vitest'

// Measured in Foundry 13.351: a changed shared vision list left the camera without a vision source,
// because initializeVision alone does not build the source of a token whose answer changed.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))
vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
  },
}))
vi.mock('../modules/entities/helpers.js', () => ({
  SR5_EntityHelpers: {
  },
}))

const {
  SR5SharedVision
} = await import('../modules/interface/shared-vision.js')

describe('drawing the shared vision again', () => {
  it('builds the source of a token that became a vision source, and drops the one that no longer is', () => {
    const token = (hasVision, isSource) => ({
      vision: hasVision ? {
      } : undefined,
      _isVisionSource: () => isSource,
      initializeVisionSource: vi.fn(),
    })
    const camera = token(false, true)
    const dropped = token(true, false)
    const unchanged = token(true, true)
    globalThis.canvas = {
      ready: true,
      tokens: {
        placeables: [camera, dropped, unchanged]
      },
      perception: {
        update: vi.fn()
      },
    }
    globalThis.document ??= {
      getElementById: () => null
    }
    SR5SharedVision.refresh()
    expect(camera.initializeVisionSource).toHaveBeenCalledOnce()
    expect(dropped.initializeVisionSource).toHaveBeenCalledOnce()
    expect(unchanged.initializeVisionSource).not.toHaveBeenCalled()
  })
})
