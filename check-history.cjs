const assert = require('node:assert/strict');
const { searchHistory, rememberSearch } = require('./panels.js');
let saved = '[]';

// Keep storage in memory so this test cannot touch the user's real search history
const storage = {
  getItem: () => saved,
  setItem: (key, value) => {
    assert.equal(key, 'tiktok2020-searches');
    saved = value;
  }
};

// Trim input and move repeat searches to the front without keeping duplicates
assert(rememberSearch('  Fleetwood Mac  ', storage));
assert(rememberSearch('food', storage));
assert(rememberSearch('fleetwood mac', storage));

// Matching ignores case but the displayed entry keeps the latest spelling
assert.deepEqual(searchHistory(storage), ['fleetwood mac', 'food']);

// History should stay bounded even after a long search session
for (let i = 0; i < 20; i++) rememberSearch('query ' + i, storage);
assert.equal(searchHistory(storage).length, 10);
assert.equal(searchHistory(storage)[0], 'query 19');

// Old or edited storage should not break the search page
saved = '[null,{},"",123,"food","FOOD"]';
assert.deepEqual(searchHistory(storage), ['food']);

// Broken JSON should act like empty history rather than break the page
saved = 'invalid';
assert.deepEqual(searchHistory(storage), []);

// Blocked storage should return false instead of throwing into the search screen
assert.equal(
  rememberSearch('test', {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    }
  }),
  false
);
console.log(
  'Device search history, validation, deduplication and storage-error checks passed.'
);
