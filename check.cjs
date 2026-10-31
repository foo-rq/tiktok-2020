const assert = require('node:assert/strict');
const { POSTS, beforeCutoff, videoDate, COMMENT_COUNTS } = require('./data.js');
const fs = require('node:fs');

// Duplicate IDs would make the feed and preference lookups disagree
assert.equal(new Set(POSTS.map((p) => p.id)).size, POSTS.length);
assert(POSTS.every((p) => /^\d{19}$/.test(p.id) && p.date.startsWith('2020-')));

// Test both sides of midnight so the archive cutoff stays exclusive
assert(beforeCutoff({ createdAt: '2020-12-31T23:59:59Z' }));
assert(!beforeCutoff({ createdAt: '2021-01-01T00:00:00Z' }));
assert(!beforeCutoff({ createdAt: 'invalid' }));
assert(!beforeCutoff({}));

// Known video IDs catch accidental changes to the timestamp decoding
assert.equal(videoDate('6876424179084709126'), '2020-09-25');
assert.equal(videoDate('6823517995856301317'), '2020-05-06');
assert.equal(videoDate('invalid'), null);
assert(POSTS.length > 0);

// Compare against the recorded failures rather than guessing from the catalog
const unavailable = JSON.parse(
  fs.readFileSync('sources/playback-checks.json', 'utf8')
).unavailable;
assert(
  POSTS.every((post) => !unavailable.includes(post.id)),
  'Confirmed unavailable videos must not ship'
);
assert(
  POSTS.every(
    (post) =>
      /^[\w.]{1,40}$/.test(post.creator) &&
      typeof post.caption === 'string' &&
      post.caption.length <= 2000
  )
);

// Walk every page so the counts cannot hide missing files
for (const [id, count] of Object.entries(COMMENT_COUNTS)) {
  const comments = [];
  for (let page = 0; page < Math.ceil(count / 50); page++) {
    const value = JSON.parse(fs.readFileSync(`comments/${id}-${page}.json`, 'utf8'));
    assert(value.comments.length > 0 && value.comments.length <= 50);

    // The final page must agree with the published comment count
    assert.equal(value.hasMore, page + 1 < Math.ceil(count / 50));
    comments.push(...value.comments);
  }

  // Counts should describe the files we actually have rather than the original totals
  assert.equal(comments.length, count);
  assert.equal(new Set(comments.map((c) => c.id)).size, count);

  // A historical comment must also be at least as new as its parent video
  for (const comment of comments) {
    assert(beforeCutoff(comment));
    assert(
      Date.parse(comment.createdAt) >= Date.parse(POSTS.find((p) => p.id === id).date)
    );
    assert(comment.text && comment.name);
  }
}

// Each catalog video needs a recorded successful startup
const streamAudit = JSON.parse(
  fs.readFileSync('sources/direct-stream-checks.json', 'utf8')
);
assert.equal(
  new Set(streamAudit.results.map((row) => row.id)).size,
  streamAudit.results.length,
  'Audit entries must be unique'
);

// A recorded startup only counts when the stream also reported real dimensions
const verifiedStreams = new Set(
  streamAudit.results
    .filter((row) => row.direct === 'played' && row.width > 0 && row.height > 0)
    .map((row) => row.id)
);
assert(
  POSTS.every((post) => verifiedStreams.has(post.id)),
  'Every published entry must have passed stream startup'
);
console.log(
  'Catalog, complete stream coverage and historical comment paging checks passed.'
);
