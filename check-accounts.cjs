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
  for (const invalid of [
    null,
    false,
    2,
    'bad',
    [],
    { likes: {}, following: 2, scores: [] }
  ])
    assert.equal(guest.api.clean(invalid).likes.length, 0);

  // Use the whole collection so the profile limit isn't only tested with tiny fixtures
  const full = guest.api.clean({
    likes: POSTS.map((p) => p.id),
    following: POSTS.map((p) => p.creator),
    seen: POSTS.map((p) => p.id),
    scores: Object.fromEntries(POSTS.flatMap((p) => p.tags).map((tag) => [tag, 100]))
  });
  assert(Object.keys(full.scores).length <= 128);
  assert(
    Buffer.byteLength(JSON.stringify(full)) < 120 * 1024,
    'Full collection fits the approved 128 KB profile limit, including JSONB spacing'
  );
  await guest.api.init(cleaned);
  assert.equal(guest.api.signedIn, false);
  guest.api.profile();
  assert.equal(typeof guest.elements.signup.onclick, 'function');
  assert.equal(typeof guest.elements.login.onclick, 'function');
  const viewer = harness();
  viewer.state = await viewer.api.init(empty());
  viewer.state.likes = [POSTS[0].id];
  viewer.api.profile();
  assert.equal(viewer.elements['account-name'].textContent, 'Viewer');
  assert.equal(viewer.elements['liked-list'].rendered[0], POSTS[0].id);
  assert.equal(
    viewer.updates.length,
    0,
    'Rendering the rebuilt profile must not change account data'
  );

  // Guest browsing should survive the account library failing to load
  const unavailable = harness({ noSDK: true });
  assert.equal((await unavailable.api.init(cleaned)).likes.length, 1);
  unavailable.api.emailForm();
  assert.match(unavailable.notices[0], /unavailable/);

  // A failed profile read must not turn guest preferences into account data
  const failed = harness({ reads: [{ error: new Error('Storage unavailable') }] });
  await assert.rejects(failed.api.init(cleaned), /Storage unavailable/);
  failed.api.persist(cleaned);
  await failed.runTimers(400);
  assert.equal(failed.api.signedIn, false);
  assert.equal(
    failed.updates.length,
    0,
    'Failed profile loads cannot save guest state into an account'
  );

  // Another tab might create the profile between the read and insert
  const createdElsewhere = harness({
    reads: [{ data: null, error: null }, row(cleaned, 5)],
    inserts: [{ error: { code: '23505' } }]
  });
  assert.equal((await createdElsewhere.api.init(empty())).likes.length, 1);
  assert.equal(
    createdElsewhere.insertCount,
    1,
    'A creation race rereads the existing profile without overwriting it'
  );

  // Finish a read after logout and check that it can't restore the old account
  const load = deferred(),
    late = harness({ reads: [load.promise] });
  const initializing = late.api.init(empty());
  await tick();
  late.emit('SIGNED_OUT');
  load.resolve(row(cleaned));
  assert.equal((await initializing).likes.length, 0);
  assert.equal(
    late.api.signedIn,
    false,
    'Late responses cannot restore a signed-out identity'
  );

  // A refresh for the same account is fine but an account switch must clear pending saves
  const switched = harness();
  await switched.api.init(empty());
  switched.emit('SIGNED_IN', 'viewer-a');
  switched.emit('TOKEN_REFRESHED', 'viewer-a');
  await switched.runTimers(0);
  assert.equal(switched.navigations.length, 0);
  switched.api.persist(cleaned);
  switched.emit('SIGNED_IN', 'viewer-b');
  await switched.runTimers(400);
  await switched.runTimers(0);
  assert.equal(switched.api.signedIn, false);
  assert.equal(switched.updates.length, 0);
  assert.equal(
    switched.navigations.length,
    1,
    'An account switch clears pending preferences and reloads once'
  );

  // Going offline should leave a retryable snapshot without changing its revision
  const transient = harness({ updates: [{ error: new Error('Offline') }] });
  await transient.api.init(empty());
  transient.api.persist(cleaned);
  await transient.runTimers(400);
  await transient.trigger('online');
  assert.equal(transient.updates.length, 2, 'A network failure is retryable');
  assert.equal(transient.updates[1].filters.revision, 0);

  // Fail an old save after a new snapshot was queued
  // A later retry must not bring the old preferences back
  const request = deferred(),
    newer = harness({ updates: [request.promise] });
  await newer.api.init(empty());
  newer.api.persist(cleaned);
  const firstSave = newer.runTimers(400);
  await tick();
  newer.api.persist({ ...empty(), likes: [POSTS[1].id] });
  const secondSave = newer.runTimers(400);
  request.resolve({ error: new Error('Offline') });
  await Promise.all([firstSave, secondSave]);
  await newer.trigger('online');
  assert.equal(
    newer.updates.length,
    2,
    'Failed older snapshots must not overwrite a newer save'
  );
  assert.equal(newer.updates[1].payload.preferences.likes[0], POSTS[1].id);

  // A revision conflict needs a reload rather than an automatic retry
  const conflict = harness({ updates: [{ data: null, error: null }] });
  await conflict.api.init(empty());
  conflict.api.persist(cleaned);
  await conflict.runTimers(400);
  conflict.api.persist(empty());
  await conflict.runTimers(400);
  await conflict.trigger('online');
  assert.equal(
    conflict.updates.length,
    1,
    'Revision conflicts cannot overwrite another device'
  );
  assert.match(conflict.notices[0], /Another device/);

  // Log out while 1 write is running and another is still queued
  const inFlight = deferred(),
    signedOut = harness({ updates: [inFlight.promise] });
  await signedOut.api.init(empty());
  signedOut.api.persist(cleaned);
  const outgoing = signedOut.runTimers(400);
  await tick();
  signedOut.api.persist(empty());
  const queued = signedOut.runTimers(400);
  signedOut.emit('SIGNED_OUT');
  inFlight.resolve({ error: new Error('No session') });
  await Promise.all([outgoing, queued]);
  await signedOut.trigger('online');
  assert.equal(
    signedOut.updates.length,
    1,
    'Queued account writes are canceled after sign-out'
  );
  assert.equal(
    signedOut.notices.length,
    0,
    'Old-session responses do not change the new session'
  );

  // Recovery for another account must not leave the previous account's likes visible
  const recovered = harness();
  await recovered.api.init(empty());
  recovered.state = cleaned;
  recovered.api.persist(cleaned);
  recovered.emit('PASSWORD_RECOVERY', 'viewer-b');
  assert.equal(
    recovered.api.signedIn,
    false,
    'Recovery for another account invalidates the previous identity'
  );
  await recovered.runTimers(400);
  await recovered.runTimers(0);
  assert.equal(
    recovered.updates.length,
    0,
    'Previous account preferences cannot save during recovery'
  );
  assert.equal(
    recovered.state.likes.length,
    0,
    'Previous account preferences are removed from the UI'
  );
  assert(recovered.elements['reset-form'], 'The recovery form remains available');
  assert.equal(
    recovered.navigations.length,
    0,
    'Recovery must not reload and discard the reset flow'
  );

  let signupRequests = 0;
  const minimum = harness({
    guest: true,
    auth: {
      signUp: async () => {
        signupRequests++;
        return { data: { session: null }, error: null };
      }
    }
  });
  minimum.api.emailForm();
  minimum.elements['display-name'].value = 'Viewer';
  minimum.elements['account-email'].value = 'viewer@example.invalid';
  minimum.elements['account-password'].value = 'Ab1!xyz';
  await minimum.elements['email-form'].onsubmit(event);
  assert.equal(
    signupRequests,
    0,
    'Short passwords must not request signup even when browser validity passes'
  );
  assert.match(minimum.elements['account-status'].textContent, /8 characters/);
  minimum.elements['account-password'].value = 'Ab1!xyzw';
  await minimum.elements['email-form'].onsubmit(event);
  assert.equal(signupRequests, 1);
  const weakSamples = ['abcdefgh', 'ABCDEFGH', '12345678', 'Abcdefgh', 'Abcdefg1'];
  for (const password of weakSamples) {
    minimum.api.emailForm();
    minimum.elements['display-name'].value = 'Viewer';
    minimum.elements['account-email'].value = 'viewer@example.invalid';
    minimum.elements['account-password'].value = password;
    await minimum.elements['email-form'].onsubmit(event);
  }
  assert.equal(signupRequests, 1, 'All character requirements are enforced');
  const signup = deferred(),
    forms = harness({ guest: true, auth: { signUp: () => signup.promise } });
  forms.api.emailForm();
  const old = forms.elements;
  old['account-email'].value = 'viewer@example.invalid';
  old['account-password'].value = 'Test-password1!';
  old['display-name'].value = 'Viewer';
  const submission = old['email-form'].onsubmit(event);
  forms.api.emailForm(true);
  forms.elements['account-password'].value = 'keep-current-input';
  signup.resolve({ data: { session: null }, error: null });
  await submission;
  assert.equal(old['account-password'].value, '');
  assert.equal(
    forms.elements['account-password'].value,
    'keep-current-input',
    'Async results must only touch their original form'
  );

  const resetMail = deferred();
  let emails = 0;
  forms.auth.resetPasswordForEmail = () => {
    emails++;
    return resetMail.promise;
  };
  const forgot = forms.elements['forgot-password'];
  const sending = forgot.onclick();
  await forgot.onclick();
  assert.equal(emails, 1, 'Repeated reset clicks send one request');
  resetMail.resolve({ error: new Error('Offline') });
  await sending;
  assert.equal(forgot.disabled, false);
  assert.match(forms.elements['account-status'].textContent, /Offline/);
  forms.auth.resetPasswordForEmail = async () => {
    throw new Error('Network failure');
  };
  await forgot.onclick();
  assert.match(forms.elements['account-status'].textContent, /Network failure/);

  forms.emit('PASSWORD_RECOVERY', 'viewer-a');
  await forms.runTimers(0);
  const reset = forms.elements,
    passwordChange = deferred();
  let changes = 0;
  reset['new-password'].value = 'New-test-password1!';
  forms.auth.updateUser = () => {
    changes++;
    return passwordChange.promise;
  };
  reset['reset-form'].valid = false;
  await reset['reset-form'].onsubmit(event);
  assert.equal(changes, 0);
  reset['reset-form'].valid = true;
  const changing = reset['reset-form'].onsubmit(event);
  await reset['reset-form'].onsubmit(event);
  assert.equal(changes, 1, 'Password submissions cannot run twice concurrently');
  passwordChange.resolve({ error: new Error('Offline') });
  await changing;
  assert.match(reset['reset-status'].textContent, /Offline/);
  assert.equal(reset['reset-form'].querySelector('[type="submit"]').disabled, false);
  forms.auth.updateUser = async () => ({ error: null });
  forms.auth.signOut = async () => ({ error: new Error('Offline') });
  await reset['reset-form'].onsubmit(event);
  assert.match(reset['reset-status'].textContent, /Password saved/);
  assert.equal(
    forms.navigations.length,
    0,
    'Do not claim the reset session ended when sign-out failed'
  );
  forms.auth.signOut = async () => ({ error: null });
  reset['new-password'].value = 'Another-test-password1!';
  await reset['reset-form'].onsubmit(event);
  assert.equal(forms.navigations[0], 'https://app.example.invalid/');

  const loading = harness({ loading: true });
  loading.emit('PASSWORD_RECOVERY', 'viewer-a');
  await loading.runTimers(0);
  assert.equal(
    Object.keys(loading.elements).length,
    0,
    'Recovery waits for the app scripts to finish loading'
  );
  loading.trigger('DOMContentLoaded');
  assert(loading.elements['reset-form']);
  let capturedRedirect;
  const pages = harness({
    guest: true,
    href: 'https://foo-rq.github.io/tiktok-2020/?code=example',
    auth: {
      signUp: async (request) => {
        capturedRedirect = request.options.emailRedirectTo;
        return { data: { session: null }, error: null };
      }
    }
  });
  pages.api.emailForm();
  pages.elements['display-name'].value = 'Viewer';
  pages.elements['account-email'].value = 'viewer@example.invalid';
  pages.elements['account-password'].value = 'Valid-pass1!';
  await pages.elements['email-form'].onsubmit(event);
  assert.equal(
    capturedRedirect,
    'https://foo-rq.github.io/tiktok-2020/',
    'Confirmation returns to the project path'
  );
  console.log(
    'Account validation, session isolation, save recovery, profile races and auth form checks passed.'
  );
})();
