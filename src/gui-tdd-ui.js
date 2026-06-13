// Custom Mocha interface for the ExTester GUI suite.
//
// The GUI specs are authored with TDD suite/test blocks but BDD-style
// lifecycle hooks (before/after/beforeEach/afterEach). No built-in Mocha
// interface exposes both, so this interface layers the BDD hook aliases on
// top of the standard TDD interface.
const Mocha = require('mocha');
const tdd = require('mocha/lib/interfaces/tdd');

module.exports = function tddWithBddHooks(suite) {
    tdd(suite);
    suite.on('pre-require', (context) => {
        context.before = context.suiteSetup;
        context.after = context.suiteTeardown;
        context.beforeEach = context.setup;
        context.afterEach = context.teardown;
    });
};

// Allow `ui: 'tdd-bdd-hooks'` by name as well as by path.
Mocha.interfaces['tdd-bdd-hooks'] = module.exports;
