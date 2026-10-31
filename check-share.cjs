const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync('panels.js', 'utf8');
function element() {
  return {
    children: [],
    isConnected: true,
    append(...items) {
      this.children.push(...items);
    },
    setAttribute() {},
    focus() {},
    select() {}
  };
}

// Use a fake clipboard so this test never reads or changes the user's clipboard
const body = element(); // Hold the clipboard failure until after the first panel has closed
let rejectCopy;
const context = vm.createContext({
  openSheet(title, html, keepPlaying) {
    assert.equal(keepPlaying, true, 'Share must preserve playback');
    body.children = [];
  },
  $: () => body,
  node: () => element(),
  actionIcon: () => element(),
  originalUrl: () => 'https://www.tiktok.com/@creator/video/6794179724890475782',
  toast() {},
  navigator: {
    clipboard: {
      writeText: () =>
        new Promise((resolve, reject) => {
          rejectCopy = reject;
        })
    }
  }
});
vm.runInContext(
  source.slice(
    source.indexOf('  function share(post)'),
    source.indexOf('  function sound(post,')
  ),
  context
);
(async () => {
  context.share({ creator: 'creator' });

  // Start copying then move away before the browser rejects permission
  const firstGrid = body.children[0],
    pending = firstGrid.children[0].onclick();

  // Pretend another panel replaced this one while the permission request was open
  firstGrid.isConnected = false;
  body.children = [];
  rejectCopy(new Error('Clipboard blocked'));
  await pending;
  assert.equal(
    body.children.length,
    0,
    'A delayed clipboard failure must not append a field to another panel'
  );
  context.share({ creator: 'creator' });

  // Try again with the panel still open to make sure manual copy remains available
  const retry = body.children[0].children[0].onclick();
  rejectCopy(new Error('Clipboard blocked'));
  await retry;
  assert.equal(
    body.children.length,
    2,
    'An active share panel must still offer the selectable-link fallback'
  );
  assert(body.children[1].value.startsWith('https://www.tiktok.com/'));
  console.log('Share fallback and stale-panel checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
