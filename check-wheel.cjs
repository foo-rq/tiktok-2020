const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');

// Advance time ourselves so the gesture lock test never waits on real timers
let now = 0,
  idle,
  prevented = 0;
const moves = [];
const context = vm.createContext({
  performance: { now: () => now },
  clearTimeout() {},
  setTimeout(fn) {
    idle = fn;
  },
  current: {
    nextElementSibling: { getBoundingClientRect: () => ({ top: 600 }) },
    previousElementSibling: null
  },
  feed: {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTo(value) {
      moves.push(value);
    },
    addEventListener() {}
  },
  window: { addEventListener() {} },
  sheet: { open: false }
});
vm.runInContext(
  source.slice(
    source.indexOf('let wheelLocked='),
    source.indexOf("setMode('foryou');", source.indexOf('let wheelLocked='))
  ),
  context
);

// Count prevented events to make sure browser gestures remain untouched later
const event = {
  deltaX: 0,
  deltaY: 100,
  preventDefault() {
    prevented++;
  }
};

// A trackpad sends lots of events for what feels like 1 scroll
for (let i = 0; i < 20; i++) context.handleWheel(event);
assert.equal(moves.length, 1, 'Trackpad momentum must produce 1 navigation per gesture');

// Target the adjacent card rather than adding an arbitrary scroll distance
assert.equal(moves[0].top, 600, 'Navigation must target the adjacent card');

// Once momentum settles a fresh gesture should be allowed to move again
idle();
now = 500;
context.handleWheel(event);
assert.equal(moves.length, 2);

// Leave browser zoom and horizontal scrolling alone
const before = prevented;
context.handleWheel({ ...event, ctrlKey: true });
context.handleWheel({ ...event, deltaX: 200 });
assert.equal(
  prevented,
  before,
  'Browser zoom and horizontal gestures must remain native'
);
console.log('Wheel gesture grouping and adjacent-card navigation checks passed.');
