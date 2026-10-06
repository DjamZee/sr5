// Test double of ../socket.js, for the tests only: Foundry never loads it (nothing imports a __mocks__ file).
// A test that writes vi.mock('../modules/socket.js') with no factory gets this file (a "redirect" mock), and
// sets the two calls it needs on SR5_SocketHandler after each vi.resetModules.
//
// Why not a factory: Vitest 4.1 serves the REAL module to the second of two import() of a factory-mocked
// module in flight at once (its mocker takes it for the factory importing itself). The shop's code fires such
// imports side by side (#notify is not awaited), and the real module brings the whole system: 26 to 77 s on a
// loaded machine, which the tests' afterEach then waited for (Tobias, 06/10). A redirect mock has no such race.
export const SR5_SocketHandler = {
  emitForPlayer: async () => {},
  emitForGM: async () => {},
}
