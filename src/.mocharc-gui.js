// Mocha configuration for the ExTester-driven GUI suite.
// The GUI specs use the TDD interface (suite/test); ExTester's runner
// otherwise defaults to BDD, which throws "suite is not defined".
const path = require('path');

module.exports = {
    ui: path.resolve(__dirname, 'gui-tdd-ui.js'),
    timeout: 120000,
    color: true,
    // Root Hook Plugin: clears stray modals/notifications after every test so a
    // single un-dismissed dialog can't cascade into element-not-visible
    // failures across all later suites. Path points at the compiled output.
    require: [path.resolve(__dirname, 'out/test/gui/rootHooks.js')],
};
