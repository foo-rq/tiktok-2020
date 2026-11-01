const Accounts = (() => {

  // Keep the project path when an email link brings us back
  const returnUrl = new URL('./', location.href).href;

  // This text is shared by signup and reset so the requirements don't drift apart
  const passwordRule =
    'Use at least 8 characters, with uppercase, lowercase, a number and a symbol.';

  // Keep this in sync with the rules saved in the account service
  const validPassword = (value) =>
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    Array.from(value).some((char) => '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~'.includes(char));

  // Account setup is optional for browsing so catch startup failures here
  let client;
  try {
    client = window.supabase.createClient(AUTH_CONFIG.url, AUTH_CONFIG.publishableKey, {
      auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true }
    });
  } catch {

    /* Let guests keep browsing if accounts can't start */
  }
  let user = null,
    revision = 0,
    profileName = 'Viewer',
    saveTimer,
    pending,
    queue = Promise.resolve(),
    conflict = false;

  // Old requests might finish after logout or an account switch
  // Use the session counter to keep those results out of the new account
  let sessionId,
    sessionEpoch = 0,
    saveVersion = 0,
    reloading = false;

  // Auth can report the same change more than once
  // Queue 1 reload so the callback can finish before the page goes away
  function reload() {
    if (reloading) return;
    reloading = true;
    setTimeout(() => location.reload(), 0);
  }

  // Only keep preferences that belong to videos and creators in this collection
  function clean(value) {
    const ids = new Set(POSTS.map((post) => post.id));
    const creators = new Set(POSTS.map((post) => post.creator));

    // Scores are only useful for tags we can actually recommend
    const tags = new Set(POSTS.flatMap((post) => post.tags));
    return {

      // A set removes duplicate likes imported from more than 1 device
      likes: [
        ...new Set(
          (Array.isArray(value?.likes) ? value.likes : []).filter((id) => ids.has(id))
        )
      ],

      // Drop creators that are no longer in the catalog
      following: [
        ...new Set(
          (Array.isArray(value?.following) ? value.following : []).filter((id) =>
            creators.has(id)
          )
        )
      ],

      // Old watched IDs should not keep growing after catalog entries are removed
      seen: [
        ...new Set(
          (Array.isArray(value?.seen) ? value.seen : []).filter((id) => ids.has(id))
        )
      ],

      // Keep the strongest 128 interests and clamp old or edited values
      scores: Object.fromEntries(
        Object.entries(
          value?.scores && typeof value.scores === 'object' ? value.scores : {}
        )
          .filter(([tag, score]) => tags.has(tag) && Number.isFinite(score))
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 128)
          .map(([tag, score]) => [tag, Math.max(-20, Math.min(100, score))])
      )
    };
  }

  async function init(guest) {

    // A failed account setup should still leave a usable guest feed
    if (!client) return clean(guest);

    // Remember which session started this read
    // Check it after each wait in case someone logs out meanwhile
    const epoch = sessionEpoch;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (epoch !== sessionEpoch) return clean(guest);
    sessionId = data.session?.user?.id || null;

    // No saved session means we should not read any account profile
    if (!data.session) return clean(guest);

    // Check the account with the server before loading its profile
    const verified = await client.auth.getUser();
    if (verified.error) throw verified.error;
    if (epoch !== sessionEpoch) return clean(guest);
    const verifiedUser = verified.data.user;
    let result = await client
      .from('viewer_profiles')
      .select('display_name,preferences,revision')
      .eq('user_id', verifiedUser.id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (epoch !== sessionEpoch) return clean(guest);

    // A confirmed account might not have opened the app before
    // Create its profile on the first visit rather than during signup
    if (!result.data) {
      const name =
        String(verifiedUser.user_metadata?.display_name || 'Viewer')
          .trim()
          .slice(0, 30) || 'Viewer';
      result = await client
        .from('viewer_profiles')
        .insert({ user_id: verifiedUser.id, display_name: name })
        .select('display_name,preferences,revision')
        .single();

      // Another tab could have made the profile between our read and insert
      if (result.error?.code === '23505')
        result = await client
          .from('viewer_profiles')
          .select('display_name,preferences,revision')
          .eq('user_id', verifiedUser.id)
          .maybeSingle();
      if (result.error) throw result.error;
    }
    if (epoch !== sessionEpoch) return clean(guest);

    // Don't pretend the account loaded if its profile is still missing
    if (!result.data) throw new Error('Account preferences could not load.');
    user = verifiedUser;
    sessionId = user.id;

    // Future saves must start from the revision we actually read
    revision = result.data.revision;
    profileName = result.data.display_name;

    // Guest likes stay separate unless the user chooses to import them
    return clean(result.data.preferences);
  }

  function persist(value) {

    // A conflict needs a fresh read before this tab can safely save again
    if (!user || conflict) return;

    // Replace the pending snapshot so the latest state wins within this tab
    pending = clean(value);
    saveVersion++;
    clearTimeout(saveTimer);

    // Wait for a burst of likes to settle instead of saving every tap
    saveTimer = setTimeout(flush, 400);
  }

  function flush() {

    // Return the same queue so logout can wait even when there's nothing new to send
    if (!pending || !user || conflict) return queue;

    // Capture the owner now rather than reading a different account later
    const preferences = pending,
      owner = user.id,
      epoch = sessionEpoch,
      version = saveVersion;

    // New interactions can build another pending snapshot while this one saves
    pending = null;

    // Save in order so a slower request cannot land after a newer one
    queue = queue
      .then(async () => {
        if (conflict || epoch !== sessionEpoch || user?.id !== owner) return;

        // Don't overwrite a newer save from another device
        const result = await client
          .from('viewer_profiles')
          .update({
            preferences,
            revision: revision + 1,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', owner)
          .eq('revision', revision)
          .select('revision')
          .maybeSingle();
        if (epoch !== sessionEpoch || user?.id !== owner) return;
        if (result.error) throw result.error;

        // No updated row means the revision changed elsewhere
        // Stop saving until reload rather than guessing how to merge
        if (!result.data) {
          conflict = true;
          throw new Error(
            'Another device changed your profile. Reload before saving more changes.'
          );
        }

        // Use the server's revision for the next queued write
        revision = result.data.revision;
      })
      .catch((error) => {
        if (epoch !== sessionEpoch || user?.id !== owner) return;

        // Keep the failed save for retry unless a newer change has replaced it
        if (!conflict && version === saveVersion && !pending) pending = preferences;
        toast(
          'Changes were not saved. ' +
            (error.message || 'Check your connection and try again.')
        );
      });
    return queue;
  }

  function profile(showEmailNotice = false) {

    // Keep signup inside Me and remember how to return here
    if (!user) {
      Panels.page(
        'Me',
        '<section class="viewer-guest"><div class="guest-portrait" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/></svg></div><h3>Sign up for an account</h3><p>Save your likes and follow creators.</p>' +

        // Keep this on Me so the reminder stays visible after the form closes
        (showEmailNotice === true ? '<div class="signup-email-note" role="status"><p>Please check your email.</p><small>Check spam if you can&#39;t find it.</small></div>' : '') +
        '<button class="primary" id="signup">Sign up</button><p>Already have an account? <button class="text-button" id="login">Log in</button></p></section>',
        { tab: 'me', reopen: profile }
      );
      $('#signup').onclick = () => Panels.signup(false, profile);
      $('#login').onclick = () => Panels.signup(true, profile);
      return;
    }
    Panels.page(
      'Me',
      '<section class="creator-header viewer-header"><div class="profile-portrait" id="account-initial" aria-hidden="true"></div><h3 id="account-name"></h3><p id="account-counts"></p></section><h3 class="liked-heading">Liked videos</h3><div id="liked-list"></div>',
      {
        tab: 'me',
        reopen: profile,

        // Keep these outside the liked-video scroll area so they never disappear below it
        // A long liked list shouldn't make someone hunt for Log out
        footer: '<div class="profile-account-actions"><button id="import-preferences" class="text-button">Import preferences from this device</button><button id="signout" class="text-button">Log out</button></div>'
      }
    );

    // Names are user input so put them in text nodes
    $('#account-initial').textContent = Array.from(profileName)[0] || '?';
    $('#account-name').textContent = profileName;

    // Use the singular for 1 like while keeping the following count as a label
    $('#account-counts').textContent =
      state.likes.length + (state.likes.length === 1 ? ' liked video, ' : ' liked videos, ') + state.following.length + ' following';

    // Only render liked videos that still exist in the current catalog
    Panels.renderPosts(
      POSTS.filter((post) => state.likes.includes(post.id)),
      $('#liked-list')
    );
    $('#import-preferences').onclick = () => {

      // Import is deliberate since this device might have been shared
      let guest;
      try {
        guest = clean(JSON.parse(localStorage.getItem('tiktok2020') || '{}'));
      } catch {
        guest = clean({});
      }

      // Combine the lists but keep account scores where the same tag exists
      state = clean({
        likes: [...state.likes, ...guest.likes],
        following: [...state.following, ...guest.following],
        seen: [...state.seen, ...guest.seen],
        scores: { ...guest.scores, ...state.scores }
      });

      // Save the merged preferences before repainting counts and liked videos
      persist(state);
      refreshButtons();
      profile();
    };
    const signout = $('#signout');
    signout.onclick = async () => {

      // A second click must not start another logout while the first is waiting
      if (signout.disabled) return;
      signout.disabled = true;
      try {

        // Give pending changes a chance to save before ending this session
        await flush();

        // Log out this browser without ending sessions on the user's other devices
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
        reload();
      } catch {
        toast('Could not log out. Try again.');
      } finally {
        signout.disabled = false;
      }
    };
  }

  // This only returns a yes or no so signup never needs access to other profiles
  async function usernameAvailable(name) {
    const { data, error } = await client.rpc('username_available', { p_name: name });
    if (error) throw error;
    if (typeof data !== 'boolean') throw new Error('Could not check username. Try again.');
    return data;
  }

  // Provider errors can arrive without punctuation so finish the sentence before showing it
  function errorText(error, fallback) {
    const message = String(error.message || fallback).trim();

    // Keep existing question marks and exclamation marks instead of adding another stop
    return /[.!?]$/.test(message) ? message : message + '.';
  }

  function emailForm(login = false, back) {
    if (!client) {
      toast('Accounts are unavailable. Reload to try again.');
      return;
    }
    Panels.authPage(
      login ? 'Log in' : 'Sign up',
      '<form id="email-form" class="account-form">' +
        (!login
          ? '<label for="display-name">Display name</label><input id="display-name" name="display-name" autocomplete="nickname" required maxlength="30">'
          : '') +
        '<label for="account-email">Email</label><input id="account-email" name="email" type="email" autocomplete="username" required maxlength="254">' +
        '<label for="account-password">Password</label><input id="account-password" name="password" type="password" autocomplete="' +
        (login ? 'current-password' : 'new-password') +
        '" required minlength="' +
        (login ? 1 : 8) +
        '" maxlength="128">' +
        (!login
          ? '<p class="panel-note">Use at least 8 characters, with uppercase, lowercase, a number and a symbol.</p>'
          : '') +
        '<button class="account-submit" type="submit">' +
        (login ? 'Log in' : 'Sign up') +

        // Keep validation and delivery failures in 1 announced slot below the submit button
        '</button><p id="account-status" role="status" aria-live="polite"></p></form>',
      () => Panels.signup(login, back)
    );

    // Hold the form nodes here so an async response still refers to its own form
    const form = $('#email-form'),
      submit = form.querySelector('[type="submit"]');
    const status = form.querySelector('#account-status'),
      emailInput = form.querySelector('#account-email');
    const passwordInput = form.querySelector('#account-password'),
      nameInput = form.querySelector('#display-name');
    form.onsubmit = async (event) => {
      event.preventDefault();

      // Block repeat submissions while the first request is still running
      if (submit.disabled || !form.reportValidity()) return;

      // Clear the previous error colour while checking this submission
      status.dataset.error = 'false';
      const email = emailInput.value.trim(),
        password = passwordInput.value;

      // Never trim passwords since spaces could be part of the password
      const name = login ? '' : nameInput.value.trim();

      // Whitespace passes the browser's required check but isn't a usable name
      if (!login && !name) {
        status.dataset.error = 'true';
        status.textContent = 'Enter a display name.';
        return;
      }

      // Apply the new password rules at signup without rejecting an existing login
      if (!login && !validPassword(password)) {
        status.dataset.error = 'true';
        status.textContent = passwordRule;
        return;
      }
      submit.disabled = true;
      status.textContent = login ? 'Logging in...' : 'Creating account...';
      let checkedName = false;
      try {

        // Check before signup so a taken name doesn't create an account or send mail
        if (!login) {
          const available = await usernameAvailable(name);
          if ($('#email-form') !== form) return;
          checkedName = true;
          if (!available) {

            // This is a validation failure so keep the same form and mark the shared slot red
            status.dataset.error = 'true';
            status.textContent = 'Username already taken.';
            return;
          }
        }

        // Both paths share the form but only signup sends a display name
        const result = login
          ? await client.auth.signInWithPassword({ email, password })
          : await client.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: returnUrl, data: { display_name: name } }
            });
        if (result.error) throw result.error;

        // Clear the field once the server accepts the request
        passwordInput.value = '';

        // Confirmation can leave us without a session even after signup succeeds
        if (result.data.session) {
          reload();
          return;
        }
        // A late response shouldn't pull someone away from a different page
        if ($('#email-form') !== form) return;


        // Confirmed accounts can come back without identities instead of an error
        // Stay here with the message rather than suggesting another email was sent
        if (!login && result.data.user?.identities?.length === 0) {
          status.dataset.error = 'true';
          status.textContent = 'An account with this email already exists.';
          return;
        }

        // A new signup returns to Me with the email reminder kept on that page

        // The notice belongs to Me so leaving the form doesn't hide the next step
        profile(true);
      } catch (error) {
        if ($('#email-form') !== form) return;
        status.dataset.error = 'true';

        // Another signup can claim the name after our first check
        // The database rejects that race so check again to show the useful message
        if (checkedName && !['user_already_exists', 'email_exists'].includes(error.code)) {
          try {
            if (!(await usernameAvailable(name))) {
              status.textContent = 'Username already taken.';
              return;
            }
          } catch {

            // Keep the original signup error if the second availability check fails
          }
        }

        status.textContent =

          // Duplicate signup can also arrive as an error rather than an empty identity list
          // Keep delivery errors on the form so they aren't mistaken for success
          error.code === 'user_already_exists' || error.code === 'email_exists'
            ? 'An account with this email already exists.'
            : error.code === 'email_address_not_authorized'
              ? 'Email delivery is in private testing. Use the email on your project account for now.'
              : errorText(error, 'Account service unavailable. Try again.');
      } finally {

        // Leave the form usable after a rejected request
        submit.disabled = false;
      }
    };
  }

  // This form is only reached through a recovery session from the email link
  function resetForm() {
    Panels.authPage(
      'Reset password',
      '<form id="reset-form" class="account-form"><label for="new-password">New password</label><input id="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><button type="submit" class="account-submit">Save password</button><p id="reset-status" role="status"></p></form>'
    );
    const form = $('#reset-form'),
      password = form.querySelector('#new-password');
    const submit = form.querySelector('[type="submit"]'),
      status = form.querySelector('#reset-status');
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (submit.disabled || !form.reportValidity()) return;

      // Reset and signup must enforce the same new password requirements
      if (!validPassword(password.value)) {
        status.textContent = passwordRule;
        return;
      }
      submit.disabled = true;
      status.textContent = 'Saving password...';
      try {
        const result = await client.auth.updateUser({ password: password.value });
        if (result.error) throw result.error;
        password.value = '';

        // Finish the recovery session and ask for a fresh login
        const signedOut = await client.auth.signOut({ scope: 'local' });

        // The password already changed so don't report the whole reset as failed
        if (signedOut.error) {
          status.textContent =
            'Password saved. Log out from your profile before logging in again.';
          return;
        }

        // Remove recovery parameters so refresh doesn't reopen the reset flow
        location.replace(returnUrl);
      } catch (error) {
        status.textContent = errorText(error, 'Could not save your password. Try again.');
      } finally {
        submit.disabled = false;
      }
    };
  }
  client?.auth.onAuthStateChange((event, session) => {

    // Ignore routine token events that don't change which account owns the page
    if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'PASSWORD_RECOVERY')
      return;
    const nextId = session?.user?.id || null;

    // Token refreshes for the same account shouldn't reset the page
    const changed = sessionId !== undefined && nextId !== sessionId;

    // Clear queued work before the next account can start saving
    if (event === 'SIGNED_OUT' || changed) {
      sessionEpoch++;
      user = null;
      pending = null;
      conflict = false;
      clearTimeout(saveTimer);
    }
    sessionId = nextId;
    if (event === 'PASSWORD_RECOVERY') {

      // Recovery can arrive before the form container exists
      const showRecovery = () => {

        // Don't leave the previous account's likes visible during recovery
        if (changed) {
          try {
            state = clean(JSON.parse(localStorage.getItem('tiktok2020') || '{}'));
          } catch {
            state = clean({});
          }
          refreshButtons();
        }
        resetForm();
      };

      // Wait for the DOM when recovery fires during page startup
      if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', showRecovery, { once: true });
      else setTimeout(showRecovery, 0);
    } else if (changed) reload();
  });

  // Try pending saves again when leaving the tab or getting a connection back
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
  window.addEventListener('online', flush);

  // Expose the actions the rest of the app needs without exposing the client
  return {
    init,
    persist,
    profile,
    emailForm,
    clean,
    get signedIn() {
      return !!user;
    }
  };
})();
