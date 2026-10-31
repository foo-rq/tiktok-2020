const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');

// Run just the playback state handler so the test doesn't need the whole page
const handler = source.slice(
  source.indexOf('function handlePlaybackState('),
  source.indexOf("document.addEventListener('visibilitychange'")
);
const start = {},
  commands = [];
let cleared = 0;
const context = vm.createContext({
  USE_TIKTOK_CONTROLS: false,
  prepareNext() {},
  clearTimeout() {
    cleared++;
  },
  current: {
    dataset: {},
    querySelector: (selector) =>
      selector === '.start' ? start : { setAttribute() {}, classList: { toggle() {} } }
  },
  document: { hidden: false },
  sheet: { open: false, dataset: {} },
  performance: { now: () => 1000 },
  send: (...args) => commands.push(args.slice(1))
});
vm.runInContext(
  'let playing=false,activeSeconds=0,startedAt=0;\n' +
    source.slice(
      source.indexOf('function playbackAllowed'),
      source.indexOf('function resumePlayback')
    ) +
    handler,
  context
);
vm.runInContext('handlePlaybackState(2)', context);
assert.equal(start.hidden, true, 'Programmatic pauses do not show a duplicate icon');
assert.equal(commands.length, 0, 'A user pause must stay paused');
assert.equal(
  cleared,
  0,
  'A paused event before first playback must not cancel stall recovery'
);
context.current.dataset.retry = 'true';
start.innerHTML = 'Server error';
vm.runInContext('handlePlaybackState(2);handlePlaybackState(3)', context);
assert.equal(
  start.innerHTML,
  'Server error',
  'Late player events must not overwrite the error display'
);
vm.runInContext('handlePlaybackState(1)', context);
assert.equal(
  context.current.dataset.retry,
  'true',
  'A latched error must wait for an explicit retry'
);
assert.equal(
  commands.at(-1)[0],
  'pause',
  'Late playback must not flash through a latched error'
);
commands.length = 0;
delete context.current.dataset.retry;
vm.runInContext('handlePlaybackState(1)', context);
assert.equal(start.hidden, true);
assert.equal(cleared, 2);
vm.runInContext('handlePlaybackState(3)', context);
assert.equal(start.hidden, true, 'Buffering is not a user pause');
vm.runInContext('handlePlaybackState(0)', context);
assert.deepEqual(commands, [['seekTo', 0], ['play']]);

// Hidden tabs must stay stopped even if the media reports that it ended
context.document.hidden = true;
vm.runInContext('handlePlaybackState(0)', context);
assert.equal(commands.length, 2, 'Hidden tabs must not restart');
context.document.hidden = false;
context.sheet.open = true;
vm.runInContext('handlePlaybackState(0)', context);
assert.equal(commands.length, 2, 'Open sheets must not restart playback');
context.sheet.dataset.keepPlaying = 'true';
vm.runInContext('handlePlaybackState(0)', context);
assert.equal(commands.length, 4, 'Videos must keep looping behind comments');
const elements = {};
context.$ = (selector) => (elements[selector] ||= {});
context.sheet.classList = { remove() {} };
context.sheet.showModal = () => {
  context.sheet.open = true;
};
vm.runInContext(
  source.slice(
    source.indexOf('function openSheet('),
    source.indexOf("\n$('#close').onclick")
  ),
  context
);
vm.runInContext("openSheet('2020 comments','',true)", context);
assert.equal(commands.length, 4, 'Opening comments must not pause playback');
vm.runInContext("openSheet('Discover','')", context);
assert.equal(
  commands.at(-1)[0],
  'pause',
  'Other panels keep their existing pause behavior'
);
assert(
  !source.includes("querySelector('.pause-shield').hidden=next"),
  'Normal pauses must not cover the video'
);
console.log('Pause, buffering, loop and background playback checks passed.');
