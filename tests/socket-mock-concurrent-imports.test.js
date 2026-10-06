import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// The shop's code imports the socket module twice at once (#notify is not awaited). With a factory mock,
// Vitest 4.1 gave the second import the REAL module, the whole system, 26 to 77 s on a loaded machine
// (Tobias, 06/10). The double of modules/__mocks__/socket.js holds whatever the number of imports in flight.
vi.mock('../modules/socket.js')

beforeEach(() => {
  vi.resetModules()
})

describe('the socket double (modules/__mocks__/socket.js)', () => {
  it('answers every import in flight at once, never the real module', async () => {
    const modules = await Promise.all([
      import('../modules/socket.js'),
      import('../modules/interface/shop-vendor.js'),
      import('../modules/socket.js'),
      import('../modules/socket.js'),
    ])
    const sockets = [modules[0], modules[2], modules[3]].map(module => module.SR5_SocketHandler)
    // The real handler registers listeners; the double has only the two calls
    for (const handler of sockets) expect(handler.registerSocketListeners).toBeUndefined()
    expect(new Set(sockets).size).toBe(1)
  })
})
