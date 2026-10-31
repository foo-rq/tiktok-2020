const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8'),
  timers = new Map();
let time = 1000,
  serial = 0,
  toggles = 0,
  profiles = 0,
  menus = 0,
  signups = 0,
  saves = 0;
const tap = {},
  card = {
    querySelector: () => tap,
    classList: { add() {}, remove() {} },
    offsetWidth: 0
  };

// Control the clock so taps and long presses don't depend on test speed
const context = vm.createContext({
  Accounts: { signedIn: true },
  Panels: {
    signup() {
      signups++;
    }
  },
  state: { likes: [] },
  sheet: { open: false },
  current: card,
  performance: { now: () => time },
  setTimeout(fn) {
    timers.set(++serial, fn);
    return serial;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
  learn() {},
  save() {
    saves++;
  },
  refreshButtons() {},
  togglePlayback() {
    toggles++;
  },
  showCreator() {
    profiles++;
  }
});
vm.runInContext(
  source.slice(source.indexOf('function likePost('), source.indexOf('function addPost(')),
  context
);
context.videoMenu = () => menus++;
const post = { id: '6794179724890475782' };

// A guest like should open signup without changing saved likes
context.Accounts.signedIn = false;
context.likePost(post, true);
assert.equal(signups, 1);
assert.equal(context.state.likes.length, 0);
context.Accounts.signedIn = true;
context.bindInteractions(card, post);

// Ignore extra fingers so pinch gestures cannot start a long press
tap.onpointerdown({ button: 0, isPrimary: false, clientX: 0, clientY: 0 });
assert.equal(
  timers.size,
  0,
  'A secondary touch must not start a hold or interfere with pinch zoom'
);

// The second tap should cancel the pending pause from the first tap
tap.onclick({ detail: 1 });
tap.onclick({ detail: 2 });
assert.equal(toggles, 0, 'Double tap must not also pause');
assert.equal(context.state.likes.length, 1);
assert.equal(timers.size, 0);
tap.onclick({ detail: 2 });
assert.equal(
  context.state.likes.length,
  1,
  'Double tapping a liked video must not unlike it'
);
assert.equal(saves, 1);

// The heart button can unlike even though repeated double taps cannot
context.likePost(post);
assert.equal(context.state.likes.length, 0, 'The heart button can unlike');

// A horizontal swipe opens the profile and suppresses the trailing click
tap.onpointerdown({ button: 0, clientX: 150, clientY: 50 });
tap.onpointermove({ clientX: 30, clientY: 55 });
tap.onpointerup({ clientX: 30, clientY: 55 });
assert.equal(profiles, 1);
tap.onclick({ detail: 1 });
assert.equal(timers.size, 0, 'A swipe must not also pause');
time += 600;

// Keyboard clicks have no second pointer tap to wait for
tap.onclick({ detail: 0 });
assert.equal(toggles, 1, 'Keyboard activation must pause immediately');
tap.onpointerdown({ button: 0, clientX: 100, clientY: 50 });

// Run the hold timer ourselves instead of waiting for real time
for (const fn of timers.values()) fn();
timers.clear();
assert.equal(menus, 1);
time += 600;
tap.onpointerdown({ button: 0, pointerType: 'mouse', clientX: 100, clientY: 50 });
assert.equal(timers.size, 0, 'Mouse dragging must not trigger a touch hold menu');
tap.onpointerup({ clientX: 100, clientY: 50 });
time += 600;
tap.onpointerdown({ button: 0, clientX: 100, clientY: 50 });

// A timer from the previous video must not open a menu after scrolling
context.current = {};
for (const fn of timers.values()) fn();
timers.clear();
assert.equal(menus, 1, 'An offscreen hold must not open a menu');
console.log(
  'Double-tap, keyboard activation, swipe, long-press and guest-like checks passed.'
);
