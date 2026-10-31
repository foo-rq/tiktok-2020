const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');

// Keep randomness fixed so a ranking change gives a repeatable failure
const posts = Array.from({ length: 30 }, (_, i) => ({
  id: String(i),
  creator: 'creator',
  tags: [i === 0 ? 'favorite' : 'other']
}));
const context = vm.createContext({
  USE_TIKTOK_CONTROLS: false,
  clearTimeout() {},
  POSTS: posts,
  state: { seen: [], following: [], scores: { favorite: 100 } },
  mode: 'foryou',
  failedVideos: new Set(),
  feed: { children: [] },
  Math: Object.assign(Object.create(Math), { random: () => 0.5 })
});
vm.runInContext(
  source.slice(source.indexOf('function choose()'), source.indexOf('function addPost')),
  context
);

// Go through the whole collection before allowing repeats
const watched = [];
for (let i = 0; i < 30; i++) {
  const post = context.choose();
  assert(post);
  watched.push(post.id);
  context.state.seen.push(post.id);
  context.feed.children.push({ dataset: { id: post.id } });

  // Simulate the same bounded queue used while scrolling
  if (context.feed.children.length > 9) context.feed.children.shift();
}
assert.equal(
  new Set(watched).size,
  30,
  'Ranking must exhaust unseen videos before repeating'
);
assert(context.choose(), 'An exhausted collection can repeat outside the current queue');

// Exhausting valid choices should return nothing instead of recycling known failures
context.failedVideos = new Set(posts.map((p) => p.id));
assert.equal(context.choose(), null);
context.failedVideos = new Set();
context.feed.children = [];
context.state.seen = [];

// Strong old interests shouldn't bury the familiar featured videos
context.POSTS = [
  { id: 'popular', creator: 'a', tags: ['dance'], featured: true },
  { id: 'ordinary', creator: 'b', tags: Array(5).fill('favorite') }
];
assert.equal(
  context.choose().id,
  'popular',
  'Cultural picks must surface even when old preferences strongly favor another topic'
);

// Once the featured video was watched an unseen ordinary video still deserves its turn
context.state.seen = ['popular'];
assert.equal(
  context.choose().id,
  'ordinary',
  'A watched featured video must not displace an unseen catalog video'
);

// A new featured option should beat one that was already watched
context.POSTS.push({ id: 'popular2', creator: 'c', tags: ['dance'], featured: true });
context.state.seen = ['popular'];
assert.equal(
  context.choose().id,
  'popular2',
  'Unseen curated videos must precede watched curated videos'
);

// Remove a confirmed failure and make sure the next card takes its place
let activated = null,
  persisted = null,
  finished = 0;

// Let remove update the fake children list just as removing a real card would
const card = (id) => ({
  dataset: { id },
  querySelector: () => ({}),
  getBoundingClientRect: () => ({ top: 0 }),
  remove() {
    context.feed.children.splice(context.feed.children.indexOf(this), 1);
  }
});
const bad = card('bad'),
  next = card('next');
Object.assign(context, {
  POSTS: [{ id: 'bad' }, { id: 'next' }],
  current: bad,
  feed: {
    children: [bad, next],
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0 })
  },
  failedVideos: new Set(),
  observer: { unobserve() {} },
  localStorage: {
    setItem(key, value) {
      persisted = JSON.parse(value);
    }
  },
  finishWatch() {
    finished++;
  },
  send() {},
  releasePlayer() {},
  addPost() {},
  activate(value) {
    activated = value;
  }
});
vm.runInContext(
  source.slice(
    source.indexOf('function removeUnavailable'),
    source.indexOf('function trimFeed')
  ),
  context
);
context.handlePlayerError(bad, { errorCode: 1001 });
assert.equal(
  context.POSTS.some((p) => p.id === 'bad'),
  false
);
assert.equal(context.feed.children.includes(bad), false);

// Finishing watch time and activating the replacement both need to happen
assert.equal(activated, next);
assert.equal(finished, 1);
assert.deepEqual(persisted, ['bad']);

// A temporary server error should offer retry without deleting the video
let pendingError;
context.setTimeout = (fn) => {
  pendingError = fn;
};
context.feed.contains = (value) => context.feed.children.includes(value);
const start = { setAttribute() {} };
next.querySelector = () => start;
context.current = next;
context.handlePlayerError(next, { errorCode: 2001 });
assert.equal(
  next.dataset.retry,
  undefined,
  'Transient errors must not flash immediately'
);
pendingError();
assert.equal(
  context.POSTS.length,
  1,
  'Temporary loading failures must not delete valid videos'
);
assert.equal(next.dataset.retry, 'true');
assert.equal(start.hidden, false);
assert(start.innerHTML.includes('Server error') && start.innerHTML.includes('Retry'));
assert(!source.includes('Couldn’t load video. Tap to retry.'));
console.log('Feed ranking, unavailable removal and transient errors passed.');

// Old embed failures should not hide videos that now have verified streams
let clearedKey;
const legacy = vm.createContext({
  POSTS: [{ id: 'verified' }],
  localStorage: {
    getItem() {
      return '["verified"]';
    },
    removeItem(key) {
      clearedKey = key;
    }
  }
});
vm.runInContext(
  source.slice(
    source.indexOf('const failedVideos='),
    source.indexOf("const feed=$('#feed')")
  ),
  legacy
);
assert.equal(
  legacy.POSTS.length,
  1,
  'Old embed failures must not hide freshly verified streams'
);
assert.equal(clearedKey, 'tiktok2020-unavailable');
console.log('Legacy availability-cache migration passed.');
