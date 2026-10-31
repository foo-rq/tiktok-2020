const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const { beforeCutoff } = require('./data.js');

// Read the actual app code so these checks cover the functions we ship
const source = fs.readFileSync('app.js', 'utf8');

// Imported text should stay text even when it looks like executable markup
const context = vm.createContext({ clearTimeout() {}, releasePlayer() {}, beforeCutoff });
vm.runInContext(
  source.slice(source.indexOf('function escapeHTML'), source.indexOf('const ICONS')),
  context
);

// An event handler in imported text must come back escaped rather than executable
assert.equal(
  context.escapeHTML('<img src=x onerror="alert(1)">'),
  '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
);

// Check the page shape before trusting any archived rows
vm.runInContext(
  source.slice(
    source.indexOf('function parseCommentPage'),
    source.indexOf('function showComments')
  ),
  context
);

// A date that cannot be parsed should fail before the row is rendered
assert.throws(
  () =>
    context.parseCommentPage({
      comments: [{ name: 'x', text: 'x', createdAt: 'invalid' }],
      hasMore: false
    }),
  /Invalid comment/
);

// A string that looks like false still isn't a boolean
assert.throws(
  () => context.parseCommentPage({ comments: [], hasMore: 'false' }),
  /Invalid comment page/
);

// The published page size is 50 so reject oversized input rather than trusting it
assert.throws(
  () => context.parseCommentPage({ comments: Array(51).fill({}), hasMore: false }),
  /Invalid comment page/
);

// Keep the last second of 2020 but reject the first second of 2021
const result = context.parseCommentPage({
  comments: [
    { name: 'x', text: '<script>bad</script>', createdAt: '2020-12-31T23:59:59Z' },
    { name: 'new', text: 'excluded', createdAt: '2021-01-01T00:00:00Z' }
  ],
  hasMore: false
});
assert.equal(result.comments.length, 1);

// Escaping the captions is separate from keeping comment bodies in text nodes
assert(
  source.includes('text.textContent=c.text'),
  'Comment text must never render as HTML'
);

// Comment bodies should only load when the user opens the panel
assert(
  !fs.readFileSync('data.js', 'utf8').includes('the vibes are'),
  'Comment bodies must not ship in the initial collection'
);

// Trimming old cards must not shift the video the user is watching
let removed = 0,
  unobserved = 0;
const cards = Array.from({ length: 11 }, () => ({
  remove() {
    removed++;
  }
}));
context.feed = { children: cards, scrollTop: 900 };
context.current = cards[9];

// Simulate the active card moving up by 100 pixels for each removed card
context.current.getBoundingClientRect = () => ({ top: -removed * 100 });

// Removed cards should stop being observed as well as leaving the DOM
context.observer = {
  unobserve() {
    unobserved++;
  }
};
vm.runInContext(
  source.slice(
    source.indexOf('function trimFeed'),
    source.indexOf('function handlePlaybackState')
  ),
  context
);

// Removing 6 cards should also remove 600 pixels from the scroll offset
context.trimFeed();

// Check removal and scroll compensation separately so failures point at the right step
assert.equal(removed, 6);
assert.equal(unobserved, 6);
assert.equal(
  context.feed.scrollTop,
  300,
  'Removing old cards must preserve the active video position'
);
console.log('Imported text escaping, comment validation and lazy loading checks passed.');

// Capture the rendered nodes so the date check uses the actual comment output
const rows = [];
context.document = {
  createElement() {
    return {
      children: [],
      setAttribute() {},
      append(...items) {
        this.children.push(...items);
      }
    };
  }
};
vm.runInContext(
  source.slice(
    source.indexOf('function appendComment'),
    source.indexOf("$('#foryou').onclick")
  ),
  context
);

// Keep the year visible rather than shortening this to month and day
context.appendComment(
  { name: 'Viewer', text: 'Hello', createdAt: '2020-06-07T15:20:00Z', date: '2020-6-7' },
  {
    append(row) {
      rows.push(row);
    }
  }
);

// The time node is the third child in the comment body
assert.equal(
  rows[0].children[1].children[2].textContent,
  '2020-6-7',
  'Comment dates retain the year'
);
