const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
let observer,
  requests = [],
  fail = false;
const elements = [];

// Only fake the DOM properties that the comments panel uses
function element() {
  return { hidden: false, isConnected: true, append() {}, setAttribute() {} };
}

// Keep a count of requests and rendered nodes without needing a browser
const context = vm.createContext({
  commentRequest: 0,
  COMMENT_COUNTS: { x: 100 },
  sheet: { open: true, classList: { add() {} }, addEventListener() {} },
  document: {
    createElement() {
      const e = element();
      elements.push(e);
      return e;
    }
  },
  openSheet() {},
  $() {
    return { append() {} };
  },

  // Hold onto the callback so the test can simulate reaching the bottom
  IntersectionObserver: class {
    constructor(callback) {
      this.callback = callback;
      observer = this;
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  },

  // Return 2 pages and record the URLs so duplicate requests are visible
  fetch: async (url) => {
    requests.push(url);
    return {
      ok: !fail,
      json: async () => ({ comments: [{}], hasMore: requests.length < 2 })
    };
  },
  parseCommentPage: (x) => x,
  appendComment() {}
});
vm.runInContext(
  source.slice(
    source.indexOf('function showComments'),
    source.indexOf('function appendComment')
  ),
  context
);

// Repeated observer callbacks should still request each page only once
(async () => {

  // Opening the panel should immediately request page 0 with retry hidden
  context.showComments({ id: 'x' });
  assert.equal(elements[2].hidden, true, 'Retry starts hidden');
  assert.deepEqual(requests, ['comments/x-0.json']);

  // Let the first response settle before simulating another scroll
  await new Promise(setImmediate);

  // Fire twice before the response settles to catch duplicate page requests
  observer.callback([{ isIntersecting: true }]);
  observer.callback([{ isIntersecting: true }]);
  await new Promise(setImmediate);
  assert.deepEqual(
    requests,
    ['comments/x-0.json', 'comments/x-1.json'],
    'Scroll loads the next page once'
  );

  // The second response has no more pages so there is nothing left to observe
  assert(observer.disconnected);
  context.showComments({ id: 'x' });
  await new Promise(setImmediate);

  // Closing the panel should stop the observer from fetching anything else
  context.sheet.open = false;
  observer.callback([{ isIntersecting: true }]);
  assert.equal(requests.length, 3, 'Closed panels never fetch more');

  // Reopen with a failed request and check that retry becomes available
  context.sheet.open = true;
  fail = true;
  context.showComments({ id: 'x' });
  await new Promise(setImmediate);
  assert.equal(elements.at(-4).hidden, false, 'Fetch errors offer retry');

  // Paging should happen through scrolling rather than bringing back Load more
  assert(
    !source
      .slice(
        source.indexOf('function showComments'),
        source.indexOf('function appendComment')
      )
      .includes('Load more')
  );
  console.log(
    'Automatic comment paging, duplicate prevention, stale panels and retry passed.'
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
