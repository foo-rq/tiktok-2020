const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8'),
  events = {},
  timers = new Map(),
  elements = {};
let timer = 0;

// Keep each fake video's promises separate so we can resolve them out of order
function card(id) {

  // Capture browser media events without opening a real stream
  const listeners = {},
    pending = [];
  const video = {
    paused: true,
    muted: true,
    currentTime: 0,
    hasAttribute() {
      return !!this.src;
    },
    removeAttribute() {
      delete this.src;
    },
    load() {},
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    }
  };
  const start = {},
    record = { classList: { toggle() {} } },
    tap = { setAttribute() {} };
  return {
    dataset: { id, loading: 'true' },
    video,
    start,
    pending,
    emit(name) {
      listeners[name]();
    },
    querySelector: (s) =>
      ({ video: video, '.start': start, '.record': record, '.tap-area': tap })[s]
  };
}
const first = card('6794179724890475782'),
  other = card('6892129238284012806');
const context = vm.createContext({
  current: first,
  playing: false,
  activeSeconds: 0,
  startedAt: 0,
  audioEnabled: false,
  document: {
    hidden: false,
    addEventListener(name, fn) {
      events[name] = fn;
    }
  },
  sheet: {
    open: false,
    dataset: {},
    classList: { remove() {} },
    showModal() {
      this.open = true;
    }
  },
  feed: {
    children: [first, other],
    contains(c) {
      return this.children.includes(c);
    }
  },
  performance: { now: () => 1000 },
  setTimeout(fn) {
    timers.set(++timer, fn);
    return timer;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
  finishWatch() {
    context.playing = false;
  },
  $(s) {
    return (elements[s] ||= {});
  },
  removeUnavailable() {
    throw Error('Stream failure must never delete a post');
  },
  addPost() {},
  choose() {}
});
for (const [a, b] of [
  ['function send(', 'function learn('],
  ['function playbackAllowed', 'function activate'],
  ['function showPlayerError', 'function trimFeed'],
  ['function handlePlaybackState', 'function setMode'],
  ['function openSheet', "\n$('#close').onclick"]
])
  vm.runInContext(source.slice(source.indexOf(a), source.indexOf(b)), context);
context.bindPlayer(first);
context.bindPlayer(other);
(async () => {

  // Start with a playing card and make sure warming the next one doesn't play it
  first.nextElementSibling = other;
  context.playing = true;
  context.prepareNext(first);
  assert.equal(other.video.preload, 'auto');
  assert.equal(other.video.muted, true);
  assert.equal(other.video.paused, true);
  assert.equal(other.pending.length, 0, 'Prefetch must not play offscreen');

  // Reusing the warmed URL matters or the next swipe would start loading from scratch
  const warm = other.video.src;
  context.current = other;
  context.loadPlayer(other);
  assert.equal(other.video.src, warm, 'Activation reuses the prepared stream');
  context.releasePlayer(other);

  // A background tab shouldn't keep warming videos the user can't see
  context.current = first;
  context.playing = true;
  context.document.hidden = true;
  context.prepareNext(first);
  assert.equal(other.video.src, undefined, 'No prefetch in a hidden tab');
  context.document.hidden = false;

  // Full pages should stop prefetch just as they stop active playback
  context.sheet.open = true;
  context.sheet.dataset.keepPlaying = 'false';
  context.prepareNext(first);
  assert.equal(other.video.src, undefined, 'No prefetch behind full-page panels');
  context.sheet.open = false;
  delete first.nextElementSibling;
  context.playing = false;

  // Start a fresh video muted so autoplay can work before any sound gesture
  context.loadPlayer(first);
  assert.equal(
    first.video.src,
    'https://offload.tnktok.com/generate/video/6794179724890475782'
  );
  assert.equal(first.video.muted, true);

  // Pause before startup finishes to catch a late playing event undoing a deliberate pause
  context.togglePlayback(first);
  first.emit('playing');
  assert.equal(context.playing, false);
  assert.equal(first.video.paused, true);
  assert.equal(
    first.start.hidden,
    false,
    'A deliberate pause shows our single play icon'
  );
  context.togglePlayback(first);
  first.emit('playing');
  assert.equal(context.playing, true);
  assert.equal(first.start.hidden, true);
  context.send(first, 'unMute');
  assert.equal(first.video.muted, false);
  assert.equal(context.playing, true);

  // Opening comments should leave the current video alone
  context.openSheet('Comments', '', true);
  assert.equal(first.video.paused, false, 'Comments keep the video playing');
  context.sheet.open = false;
  context.openSheet('Discover', '');
  assert.equal(first.video.paused, true);
  first.emit('playing');
  assert.equal(context.playing, false);
  context.sheet.open = false;
  context.resumePlayback();
  first.emit('playing');
  assert.equal(context.playing, true);
  context.document.hidden = true;
  events.visibilitychange();
  assert.equal(first.video.paused, true);
  context.document.hidden = false;
  events.visibilitychange();
  first.emit('playing');
  assert.equal(context.playing, true);
  context.togglePlayback(first);
  context.document.hidden = true;
  events.visibilitychange();
  context.document.hidden = false;
  events.visibilitychange();
  assert.equal(first.video.paused, true, 'Explicit pauses survive backgrounding');

  // A completed video should restart at 0 rather than becoming a paused black card
  delete first.dataset.userPaused;
  first.video.currentTime = 20;
  first.emit('ended');
  assert.equal(first.video.currentTime, 0);
  assert.equal(first.video.paused, false, 'Ended videos restart');
  context.current = other;
  context.loadPlayer(other);
  other.emit('playing');
  first.emit('playing');
  assert.equal(first.video.paused, true, 'Late offscreen playback stops');
  assert.equal(other.video.paused, false);
  const denied = other.pending.at(-1);
  denied.reject({ name: 'NotAllowedError' });
  await Promise.resolve();
  assert.equal(other.dataset.userPaused, 'true');
  assert.equal(other.start.hidden, false);
  assert.equal(
    timers.has(other.loadTimer),
    false,
    'Autoplay denial must not later become a timeout'
  );
  context.togglePlayback(other);
  assert.equal(other.video.paused, false, 'Tap retries denied autoplay');
  other.emit('error');
  assert.equal(other.dataset.recovering, 'true');
  other.emit('playing');
  assert.equal(
    other.dataset.recovering,
    undefined,
    'Successful playback cancels transient errors'
  );
  context.releasePlayer(first);
  assert.equal(first.video.src, undefined);
  assert.equal(first.video.paused, true);

  // Release a player before its request rejects so an old failure can't show a new error
  const stale = other.pending.at(-1);
  context.releasePlayer(other);
  stale.reject({ name: 'NotSupportedError' });
  await Promise.resolve();
  assert.equal(
    other.dataset.retry,
    undefined,
    'Late rejected requests from released players are ignored'
  );
  context.loadPlayer(other);
  const timeout = timers.get(other.loadTimer);
  timeout();
  const show = timers.get(other.errorTimer);
  show();
  assert.equal(other.dataset.retry, 'true');
  assert.equal(other.start.hidden, false);
  assert(other.start.innerHTML.includes('Retry'));
  context.togglePlayback(other);
  assert.equal(other.dataset.retry, undefined);
  assert.equal(other.video.paused, false, 'Retry creates a fresh stream request');
  assert(!source.includes('<iframe'));
  assert(
    !source.includes('postMessage'),
    'No cross-origin player message surface remains'
  );

  // Read the files in page order so this check follows the real stylesheet setup
  // Read stylesheet links from the page so this follows the split files too
  const html = fs.readFileSync('index.html', 'utf8');
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(
    (match) => match[1].split('?')[0]
  );
  assert(styles.length > 1, 'The page should load the split stylesheets');
  const css = styles.map((path) => fs.readFileSync(path, 'utf8')).join('\n');
  assert(/object-fit\s*:\s*contain/.test(css));
  assert(!/inset\s*:\s*-64px/.test(css));
  console.log(
    'Direct playback, pause races, mute, looping, comments, visibility, release, denial and retry passed.'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
