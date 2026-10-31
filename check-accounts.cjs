const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { POSTS } = require('./data.js');
const source = fs.readFileSync('accounts.js', 'utf8');
const empty = () => ({ likes: [], following: [], seen: [], scores: {} });
const row = (preferences = empty(), revision = 0) => ({
  data: { display_name: 'Viewer', preferences, revision },
  error: null
});

// Hold a response open so logout or a newer save can happen first
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const event = { preventDefault() {} };

// Fake the account requests so running these checks doesn't create users or send mail
function harness(options = {}) {
  const timers = new Map(),
    listeners = {},
    reads = [...(options.reads || [])],
    inserts = [...(options.inserts || [])];
  const responses = [...(options.updates || [])],
    updates = [],
    notices = [],
    navigations = [];
  let timerId = 0,
    authChange,
    elements = {},
    insertCount = 0;
  const auth = {
    onAuthStateChange(callback) {
      authChange = callback;
    },
    async getSession() {
      return {
        data: { session: options.guest ? null : { user: { id: 'viewer-a' } } },
        error: null
      };
    },
    async getUser() {
      return { data: { user: { id: 'viewer-a', user_metadata: {} } }, error: null };
    },
    async signUp() {
      return { data: { session: null }, error: null };
    },
    async signInWithPassword() {
      return { data: { session: { user: { id: 'viewer-a' } } }, error: null };
    },
    async resetPasswordForEmail() {
      return { error: null };
    },
    async updateUser() {
      return { error: null };
    },
    async signOut() {
      return { error: null };
    },
    ...options.auth
  };
  const client = {
    auth,
    from(table) {
      assert.equal(table, 'viewer_profiles');
      let operation = 'read',
        payload,
        filters = {};
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters[key] = value;
          return query;
        },
        insert(value) {
          operation = 'insert';
          payload = value;
          return query;
        },
        update(value) {
          operation = 'update';
          payload = value;
          return query;
        },
        async maybeSingle() {
          if (operation === 'update') {
            updates.push({ payload, filters });
            return responses.length
              ? responses.shift()
              : { data: { revision: payload.revision }, error: null };
          }
          return reads.length ? reads.shift() : row();
        },
        async single() {
          insertCount++;
          return inserts.length ? inserts.shift() : row();
        }
      };
      return query;
    }
  };
  const context = vm.createContext({
    window: {
      supabase: options.noSDK
        ? undefined
        : {
            createClient(url, key, config) {
              assert.equal(config.auth.flowType, 'pkce');
              assert.equal(config.auth.detectSessionInUrl, true);
              assert.equal(
                'storage' in config.auth,
                false,
                'Confirmation links can open in another tab'
              );
              return client;
            }
          },
      addEventListener(type, callback) {
        listeners[type] = callback;
      }
    },
    URL,
    AUTH_CONFIG: { url: 'https://example.invalid', publishableKey: 'public-test' },
    POSTS,
    document: {
      hidden: true,
      readyState: options.loading ? 'loading' : 'complete',
      addEventListener(type, callback) {
        listeners[type] = callback;
      }
    },
    setTimeout(callback, ms) {
      timers.set(++timerId, { callback, ms });
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    location: {
      href: options.href || 'https://app.example.invalid/',
      origin: 'https://app.example.invalid',
      reload() {
        navigations.push('reload');
      },
      replace(url) {
        navigations.push(url);
      }
    },
    toast(message) {
      notices.push(message);
    },
    Panels: {
      authPage(title, html) {
        context.openSheet(title, html);
      },
      page(title, html) {
        context.openSheet(title, html);
      },
      renderPosts(posts, container) {
        container.rendered = posts.map((post) => post.id);
      },
      signup() {}
    },
    state: empty(),
    localStorage: {
      getItem() {
        return '{}';
      }
    },
    refreshButtons() {},
    listPost() {},
    $: (selector) => elements[selector.slice(1)],
    openSheet(title, html) {
      const current = {};
      for (const match of html.matchAll(/id="([^"]+)"/g))
        current[match[1]] = {
          value: '',
          textContent: '',
          disabled: false,
          valid: true,
          reportValidity() {
            return this.valid;
          }
        };
      const submit = { disabled: false };
      for (const element of Object.values(current))
        element.querySelector = (selector) =>
          selector === '[type="submit"]' ? submit : current[selector.slice(1)] || null;
      elements = current;
    }
  });
  vm.runInContext(source + '\nglobalThis.api = Accounts;', context);
  return {
    api: context.api,
    auth,
    updates,
    notices,
    navigations,
    get state() {
      return context.state;
    },
    set state(value) {
      context.state = value;
    },
    get insertCount() {
      return insertCount;
    },
    get elements() {
      return elements;
    },
    emit(type, id = null) {
      authChange(type, id ? { user: { id } } : null);
    },
    trigger(type) {
      return listeners[type]();
    },
    runTimers(ms) {
      const callbacks = [];
      for (const [id, timer] of timers)
        if (timer.ms === ms) {
          timers.delete(id);
          callbacks.push(timer.callback);
        }
      return Promise.all(callbacks.map((callback) => callback()));
    }
  };
}

(async () => {

  // Start with messy guest data to check unknown IDs and extreme scores
  const guest = harness({ guest: true });
  const cleaned = guest.api.clean({
    likes: [POSTS[0].id, POSTS[0].id, 'unknown'],
    following: ['unknown'],
    seen: null,
    scores: { [POSTS[0].tags[0]]: 10000, unknown: 50 }
  });
  assert.equal(cleaned.likes.length, 1);
  assert.equal(cleaned.following.length, 0);
  assert.equal(cleaned.seen.length, 0);
  assert.equal(cleaned.scores[POSTS[0].tags[0]], 100);
  assert.equal(Object.keys(cleaned.scores).length, 1);
})();
