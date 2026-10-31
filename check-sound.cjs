const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const handler = source.slice(
  source.indexOf('function refreshSoundButtons(){'),
  source.indexOf("$('#create').onclick")
);

// Capture the icon state and player commands independently
const attributes = {},
  paths = { '.sound-on': { style: {} }, '.sound-off': { style: {} } },
  commands = [];
const button = {
  setAttribute: (name, value) => (attributes[name] = value),
  querySelector: (selector) => paths[selector]
};
const context = vm.createContext({
  feed: { querySelectorAll: () => [button] },
  send: (card, command) => commands.push(command),
  current: {}
});

// The first click enables sound and changes the label to the next available action
vm.runInContext('let audioEnabled=false;\n' + handler + '\ntoggleSound();', context);
assert.equal(attributes['aria-label'], 'Mute video');
assert.equal(attributes['aria-pressed'], 'true');
assert.equal(paths['.sound-off'].style.display, 'none');

// A second click should mute without sending a playback command
vm.runInContext('toggleSound();', context);
assert.equal(attributes['aria-label'], 'Unmute video');
assert.equal(attributes['aria-pressed'], 'false');
assert.equal(paths['.sound-on'].style.display, 'none');
assert.deepEqual(
  commands,
  ['unMute', 'mute'],
  'Sound toggling must not resume a paused video'
);

// The speaker belongs to each video card so it scrolls away with that video
assert(
  !fs.readFileSync('index.html', 'utf8').includes('class="enable-sound"'),
  'Sound controls belong inside scrolling videos'
);
assert(source.includes("card.querySelector('.enable-sound').onclick=toggleSound;"));
const { soundPosts } = require('./panels.js');

// The same generic audio label does not mean it's the same recording
const generic = [
  { id: 'a', sound: 'original sound' },
  { id: 'b', sound: 'original sound' }
];
assert.deepEqual(
  soundPosts(generic, generic[0]),
  [generic[0]],
  'Generic sound labels must not join unrelated videos'
);

// Common spelling and whitespace variations should all stay isolated
for (const label of ['Original TikTok audio', 'Original audio', ' Original Sound ']) {
  const posts = [
    { id: 'a', sound: label },
    { id: 'b', sound: label }
  ];
  assert.equal(soundPosts(posts, posts[0]).length, 1);
}

// Named tracks can still collect videos that share the exact track label
const named = [
  { id: 'a', sound: 'Savage — Megan Thee Stallion' },
  { id: 'b', sound: 'Savage — Megan Thee Stallion' }
];
assert.equal(
  soundPosts(named, named[0]).length,
  2,
  'Named tracks can still group collection videos'
);
console.log('Sound toggle and generic-track isolation checks passed.');

// An unknown artist should stay unknown rather than borrowing the creator name
const { soundInfo } = require('./panels.js');
assert.deepEqual(
  soundInfo({ sound: 'Savage — Megan Thee Stallion', creator: 'dancer' }),
  { title: 'Savage', artist: 'Megan Thee Stallion' }
);
assert.deepEqual(
  soundInfo({ sound: 'Unidentified track', creator: 'dancer' }),
  { title: 'Unidentified track', artist: '' },
  'A video publisher must not be credited as an unknown track artist'
);
