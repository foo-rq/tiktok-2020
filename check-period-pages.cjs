const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync('panels.js', 'utf8');

// Only fake the element methods these panels use so missing behavior fails visibly
function el() {
  return {
    children: [],
    attributes: {},
    append(...items) {
      this.children.push(...items);
    },
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    remove() {
      this.removed = true;
    }
  };
}
const body = el(),
  close = el(),
  phone = { inert: false },
  sheet = {
    dataset: {},
    classList: { add() {} },
    close() {
      closed++;
      this.open = false;
    },
    show() {
      this.open = true;
    }
  };
let closed = 0,
  back = 0,
  navigated = 0;
const nav = {
  id: 'me',
  innerHTML: '<small>Me</small>',
  textContent: 'Me',
  getAttribute: () => null,
  onclick() {
    navigated++;
  }
};
const context = vm.createContext({
  document: { createElement: el, querySelectorAll: () => [nav] },
  openSheet() {
    body.children = [];
  },
  $(s) {
    return { '#sheet': sheet, '#close': close, '#sheet-body': body, '.phone': phone }[s];
  },
  listPost(post, container) {
    container.append(post.id);
  }
});
for (const [a, b] of [
  ['  function node(', '  function page('],
  ['  function page(', '  function section('],
  ['  function renderPosts(', '  function discover(']
])
  vm.runInContext(source.slice(source.indexOf(a), source.indexOf(b)), context);

// Check that a full page gets its own navigation and leaves the feed inert underneath
const content = context.page('Me', '<p>Viewer</p>', { tab: 'me', back: () => back++ });
assert.equal(content.innerHTML, '<p>Viewer</p>');
assert.equal(body.children.length, 2);
const footer = body.children[1];
assert.equal(footer.children[0].className, 'selected');
footer.children[0].onclick();
assert.equal(navigated, 1);
const pageCloses = closed;
close.onclick();
assert.equal(back, 1);
assert.equal(closed, pageCloses);
assert.equal(
  phone.inert,
  true,
  'Full pages hide the feed from focus while leaving the theme switch available'
);

// Check the real cover URL and remove a broken image so text can take its place
const valid = context.thumbnail({ id: '6794179724890475782' });
assert.equal(valid.src, 'https://offload.tnktok.com/generate/cover/6794179724890475782');
assert.equal(valid.loading, 'lazy');
assert.equal(valid.referrerPolicy, 'no-referrer');
valid.onerror();
assert(valid.removed);

// Reject an ID that could turn a cover lookup into a different external request
assert.equal(
  context.thumbnail({ id: '../private?token=secret' }).src,
  undefined,
  'Thumbnail IDs must not create arbitrary external requests'
);

// Walk all 3 batches to catch duplicated or missing tiles at the page boundary
const gallery = el(),
  posts = Array.from({ length: 65 }, (_, id) => ({ id: String(id) }));
context.renderPosts(posts, gallery);
const grid = gallery.children[0],
  more = gallery.children[1];
assert.equal(grid.children.length, 30);
more.onclick();
assert.equal(grid.children.length, 60);
more.onclick();
assert.equal(grid.children.length, 65);
assert.equal(new Set(grid.children).size, 65);
assert.equal(more.hidden, true);
console.log(
  'Full-page navigation, thumbnail safety/fallback and grid paging checks passed.'
);

// Auth should stay inside its own page without adding the feed navigation
context.page('Sign up', '<form></form>', { navigation: false });
assert.equal(
  body.children.length,
  1,
  'Account pages must not reveal the feed or include main navigation'
);

context.document.createTextNode = (text) => ({ textContent: text });
context.Accounts = { emailForm() {} };
vm.runInContext(
  source.slice(
    source.indexOf('  function authPage('),
    source.indexOf('  function thumbnail(')
  ),
  context
);
vm.runInContext(
  source.slice(source.indexOf('  function signup('), source.indexOf('  root.Panels =')),
  context
);

// The back button should return to the screen that opened signup
context.signup(false, () => back++);
assert.equal(body.children.length, 1);
const chooser = body.children[0];
assert.equal(chooser.children[0].textContent, 'Sign up for TikTok 2020');
const beforeBack = back;
close.onclick();
assert.equal(back, beforeBack + 1, 'Signup returns to its originating page');
