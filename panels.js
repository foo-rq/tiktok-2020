(function (root) {
  const categories = ['Top', 'Users', 'Videos', 'Sounds', 'Hashtags'];
  const normalize = value => String(value || '').toLocaleLowerCase();

  // Tags can come from metadata or captions so collect both without duplicates
  const hashtags = post => [...new Set([...(post.tags || []), ...((post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []).map(tag => tag.slice(1))])];
  const originalUrl = post => `https://www.tiktok.com/@${encodeURIComponent(post.creator)}/video/${encodeURIComponent(post.id)}`;
  const historyKey = 'tiktok2020-searches';

  // Storage can contain old or edited values so tidy it before showing suggestions
  function searchHistory(storage) {
    try {
      storage=storage||localStorage;
      const value=JSON.parse(storage.getItem(historyKey)||'[]');
      if(!Array.isArray(value))return [];

      // Compare without case so food and FOOD don't take 2 history slots
      const seen=new Set();

      // Bound the stored input first in case someone edited browser storage
      return value.slice(0,100).filter(term=>typeof term==='string'&&term.trim()&&term.length<=80)
        .map(term=>term.trim()).filter(term=>{const key=normalize(term);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,10);
    } catch { return []; }
  }

  // Keep the newest search at the front and cap history at 10 entries
  function rememberSearch(query,storage) {
    const term=String(query||'').trim().slice(0,80);
    if(!term)return true;
    try { storage=storage||localStorage;storage.setItem(historyKey,JSON.stringify([term,...searchHistory(storage).filter(item=>normalize(item)!==normalize(term))].slice(0,10)));return true; }
    catch { return false; }
  }

  // Each search tab checks its own fields rather than matching everything
  function matches(posts, query, category) {
    const term = normalize(query).replace(/^#/, '');
    return posts.filter(post => {
      const fields = category === 'Users' ? [post.creator, post.name]
        : category === 'Sounds' ? [post.sound]
        : category === 'Hashtags' ? hashtags(post)
        : category === 'Videos' ? [post.caption, ...hashtags(post)]
        : [post.creator, post.name, post.caption, post.sound, ...hashtags(post)];
      return fields.some(field => normalize(field).includes(term));
    });
  }

  const unnamedSound = value => !value || /^original(?: tiktok)? (?:audio|sound)$/.test(normalize(value).trim());

  function soundPosts(posts, post) {

    // Shortcut: original sound is a label rather than a shared recording ID
    // Only group these after we have verified sound metadata
    return unnamedSound(post.sound)
      ? [post] : posts.filter(item => item.sound === post.sound);
  }

  function soundInfo(post) {
    const parts=String(post.sound||'Original sound').split(' — ');
    return {title:parts[0],artist:parts.slice(1).join(' — ')};
  }

  // Most panel copy is data so default to textContent rather than HTML
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function hashtag(className) {
    const icon=node('span',className);icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<svg viewBox="0 0 24 24"><path d="m10 4-3 16M17 4l-3 16M5 9h15M4 15h15"/></svg>';
    return icon;
  }

  // Full pages share the same sheet and navigation to keep their layout consistent
  function page(title, html = '', options = {}) {
    openSheet(title, '');
    $('#sheet').classList.add('page-sheet');
    $('#sheet').dataset.page='true';

    // Full pages use a nonmodal sheet with the feed made inert underneath
    $('#sheet').close();$('#sheet').show();
    $('.phone').inert=true;
    const close = $('#close');
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7M8 12h13"/></svg>';
    close.ariaLabel = 'Back';

    // Remember the return path so Inbox can lead back to Discover
    close.onclick = options.back || (() => $('#sheet').close());
    const content = node('div', 'page-content');

    // This is app-owned markup so don't put user text into this parameter
    content.innerHTML = html;
    $('#sheet-body').append(content);

    // Auth uses its own back button and doesn't need another bottom bar
    if(options.navigation===false)return content;
    const navigation = node('nav', 'page-nav');
    navigation.setAttribute('aria-label', 'Main navigation');

    // Copy the existing menu contents so the full pages don't invent a different layout
    document.querySelectorAll('.phone > nav button').forEach(original => {
      const button = node('button', original.id === (options.tab || '') ? 'selected' : '');
      button.innerHTML = original.innerHTML;
      button.setAttribute('aria-label', original.getAttribute('aria-label') || original.textContent.trim());
      button.onclick = () => {

        // Remember the scroll position before opening Inbox over this page
        if(original.id==='inbox'){const position=content.scrollTop;inbox(options.reopen?()=>{options.reopen();$('#sheet .page-content').scrollTop=position;}:undefined);}
        else original.onclick();
      };
      navigation.append(button);
    });
    $('#sheet-body').append(navigation);
    return content;
  }

  function authPage(title, html='', back) {
    const body=page(title,html,{back,navigation:false});
    $('#sheet').classList.add('auth-page');
    return body;
  }

  function thumbnail(post) {
    const image = node('img', 'video-cover');
    image.alt = '';

    // Covers can wait until they're near the screen instead of loading the whole catalog
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    if (/^\d{19}$/.test(post.id)) image.src = 'https://offload.tnktok.com/generate/cover/' + post.id;

    // Drop a failed image so the text fallback stays visible
    image.onerror = () => image.remove();
    return image;
  }

  function section(container, title) {
    const group = node('section', 'panel-section');
    group.append(node('h3', 'panel-section-title', title));
    container.append(group);
    return group;
  }

  function renderPosts(posts, container) {
    if (!posts.length) { container.append(node('p', 'panel-empty', 'No videos available.')); return; }
    const grid = node('div', 'video-grid');
    container.append(grid);

    // Build a small tile batch instead of hundreds of nodes for a big result set
    let shown = 0;
    const more = node('button', 'grid-more', 'Load more');
    function append() {
      posts.slice(shown, shown + 30).forEach(post => listPost(post, grid));
      shown += 30;

      // Keep the button for another batch but hide it when there's nothing left
      more.hidden = shown >= posts.length;
    }
    more.onclick = append;
    container.append(more);
    append();
  }

  function discover(saved = {}) {
    const body = page('Discover', '', {tab:'discover',reopen:()=>discover({query:input.value,category:selected})});
    $('#sheet').classList.add('discover-page');
    body.classList.add('panel-discover');
    const label = node('label', 'panel-search-label', 'Search');
    label.htmlFor = 'collection-search';
    const input = node('input', 'search-input');
    input.id = 'collection-search';
    input.type = 'search';
    input.placeholder = 'Search';

    // Coming back from a result should restore what was typed
    input.value = saved.query || '';
    let searching=!!saved.query;

    // Use our recent searches rather than unrelated browser form suggestions
    input.autocomplete = 'off';
    input.maxLength = 80;
    const searchBox = node('div', 'panel-search-box');
    const clear = node('button', 'panel-search-clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Clear search');
    clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    clear.hidden = true;

    // Keep focus in search after clearing so typing can continue straight away
    clear.onclick = () => { input.value = ''; render(); input.focus(); };
    const searchIcon=node('span','search-field-icon');searchIcon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>';
    searchBox.append(searchIcon,input, clear);
    const tabs = node('div', 'panel-search-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Search categories');
    const results = node('div', 'panel-search-results');
    results.id = 'collection-results';
    results.setAttribute('role', 'tabpanel');

    // Old saved state might name a category that no longer exists
    let selected = categories.includes(saved.category) ? saved.category : 'Top';
    const tabButtons = categories.map(category => {
      const button = node('button', 'panel-search-tab', category);
      button.id = 'search-tab-' + category.toLowerCase();
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', results.id);
      button.onclick = () => { selected = category; render(); };

      // Arrow keys should move focus with the selected tab and wrap at the ends
      button.onkeydown = event => {
        const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!direction) return;
        event.preventDefault();
        selected = categories[(categories.indexOf(selected) + direction + categories.length) % categories.length];
        render();
        tabButtons[categories.indexOf(selected)].focus();
      };
      tabs.append(button);
      return button;
    });
    $('#sheet .sheet-head').append(label, searchBox);
    $('#sheet-body').insertBefore(tabs,body);
    body.append(results);
    $('#close').onclick = () => { if(searching||input.value){input.value='';searching=false;input.blur();render();}else $('#sheet').close(); };
    input.addEventListener('focus',()=>{searching=true;render();});

    // Save a completed query rather than every partial word typed
    function recordQuery(){if(!rememberSearch(input.value))toast('Search history could not be saved.');}
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();recordQuery();render();}});
    results.addEventListener('click',event=>{if(event.target.closest('.list-button,.panel-user,.panel-sound-result'))recordQuery();},true);

    // Recent searches stay on this device rather than being shared account history
    function renderHistory(){
      const history=searchHistory();
      if(!history.length)return;
      const group=node('section','panel-section'),header=node('div','panel-history-head');
      const clearHistory=node('button','text-button','Clear history');
      clearHistory.onclick=()=>{try{localStorage.removeItem(historyKey);render();}catch{toast('Search history could not be cleared.');}};
      header.append(node('h3','panel-section-title','Recent searches'),clearHistory);group.append(header);
      history.forEach(term=>{const button=node('button','panel-history-item',term);button.onclick=()=>{input.value=term;rememberSearch(term);render();};group.append(button);});
      results.append(group);
    }

    // Match the hashtag text even when the user leaves out the hash
    function renderTags(posts, container, query) {
      const tags = [...new Set(posts.flatMap(hashtags))].filter(tag => normalize(tag).includes(normalize(query).replace(/^#/, '')));
      if (!tags.length) container.append(node('p', 'panel-empty', 'No hashtags found.'));
      tags.slice(0,60).forEach(tag => {
        const button = node('button', 'panel-hashtag');
        button.append(hashtag('panel-hashtag-icon'), node('span', '', tag));
        button.onclick = () => { input.value = '#' + tag; selected = 'Videos'; render(); };
        container.append(button);
      });
    }

    function renderUsers(posts, container) {

      // A creator can have lots of videos but should appear only once in Users
      const creators = [...new Map(posts.map(post => [post.creator, post])).values()];
      creators.slice(0,50).forEach(post => {
        const button = node('button', 'panel-user');
        const avatar = node('span', 'panel-user-avatar', post.initial || post.creator.slice(0, 1));
        avatar.setAttribute('aria-hidden', 'true');
        const text = node('span', 'panel-user-text');
        text.append(node('strong', '', post.name || post.creator), node('small', '', '@' + post.creator));
        button.append(avatar, text);
        button.onclick = () => creator(post, () => discover({query:input.value,category:selected}));
        container.append(button);
      });
    }

    // Leave unnamed audio out since unrelated videos can use the same label
    function renderSounds(posts, container) {

      // Use 1 representative video for each named sound result
      const sounds = [...new Map(posts.filter(post => !unnamedSound(post.sound)).map(post => [post.sound, post])).values()];
      if (!sounds.length) container.append(node('p', 'panel-empty', 'No named sounds found.'));
      sounds.slice(0,50).forEach(post => {
        const button = node('button', 'panel-sound-result');
        button.append(node('span', 'panel-sound-mark', '♫'), node('span', '', post.sound));
        button.onclick = () => sound(post, () => discover({query:input.value,category:selected}));
        container.append(button);
      });
    }

    // These groups describe our collection rather than live trend statistics
    function renderTrends() {
      const terms = ['dance','comedy','food','animals','creative'];
      const groups = terms.map(term => ({term, posts:matches(POSTS,term,'Hashtags')})).filter(group => group.posts.length);

      // Fill extra groups from featured videos without calling generic fyp tags trends
      const others = [...new Set(POSTS.filter(post=>post.featured).flatMap(hashtags))].filter(tag => !['fyp','foryou','everyday','music'].includes(tag));
      for(const term of others){if(groups.length>=10)break;const posts=matches(POSTS,term,'Hashtags');if(posts.length>=3&&!groups.some(group=>normalize(group.term)===normalize(term)))groups.push({term,posts});}
      groups.forEach(({term,posts}) => {
        posts.sort((a,b)=>Number(!!b.featured)-Number(!!a.featured));
        const group=node('section','discover-trend'),heading=node('button','trend-heading');
        const arrow=node('span','trend-chevron');arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg viewBox="0 0 20 20"><path d="m7.5 5 5 5-5 5"/></svg>';
        heading.append(hashtag('trend-hash'),node('span','trend-title',term),node('small','trend-count',posts.length+' in collection'),arrow);
        heading.onclick=()=>{input.value='#'+term;selected='Videos';render();};
        const strip=node('div','trend-videos');
        posts.slice(0,6).forEach(post=>listPost(post,strip));
        group.append(heading,strip);results.append(group);
      });
    }

    // Rebuild results from the input and selected tab so clearing search resets them too
    function render() {
      const query = input.value.trim();
      clear.hidden = !input.value;
      $('#sheet').classList.toggle('searching', searching||!!query);
      results.replaceChildren();

      // Category tabs aren't useful until there is something to search for
      tabs.hidden = !query;
      tabButtons.forEach((button, index) => {
        const active = categories[index] === selected;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      results.setAttribute('aria-labelledby', 'search-tab-' + selected.toLowerCase());
      if (!query) {

        // Empty focused search shows history while the idle page shows collections
        if(searching)renderHistory();else renderTrends();
        return;
      }
      const found = matches(POSTS, query, selected);
      if (!found.length) {
        results.append(node('p', 'panel-empty', 'No results in this collection.'));
      } else if (selected === 'Users') renderUsers(found, results);
      else if (selected === 'Sounds') renderSounds(found, results);
      else if (selected === 'Hashtags') renderTags(found, results, query);
      else if (selected === 'Videos') renderPosts(found, results);
      else {
        const users = matches(POSTS, query, 'Users');
        if (users.length) renderUsers(users, section(results, 'Users'));
        renderPosts(found, section(results, 'Videos'));
      }
    }
    input.addEventListener('input', render);
    render();
  }

  const actionPaths = {
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    share: '<path d="M12 16V2m-5 5 5-5 5 5M5 11H3v10h18V11h-2"/>',
    open: '<path d="M14 3h7v7m0-7L10 14M10 4H3v17h17v-7"/>'
  };

  function actionIcon(type) {
    const element = node('span', 'panel-share-icon');
    element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${actionPaths[type]}</svg>`;
    return element;
  }

  // Share the original video URL while keeping the archive video playing
  function share(post) {
    openSheet('Share to', '', true);
    const body = $('#sheet-body');
    const grid = node('div', 'panel-share-grid');
    const url = originalUrl(post);
    const copy = node('button', 'panel-share-action');
    copy.append(actionIcon('link'), node('span', '', 'Copy link'));
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); }
      catch {

        // The user might close the sheet while clipboard permission is pending
        if (!grid.isConnected) return;

        // Let the user copy manually when the clipboard API is unavailable
        const field = node('input', 'search-input');
        field.value = url;
        field.readOnly = true;
        field.setAttribute('aria-label', 'Original video link');
        body.append(field);
        field.focus();
        field.select();
        toast('Copy the selected link.');
      }
    };
    grid.append(copy);

    // Only show the native share action when the browser supports it
    if (navigator.share) {
      const native = node('button', 'panel-share-action');
      native.append(actionIcon('share'), node('span', '', 'More'));
      native.onclick = async () => {
        try { await navigator.share({ title: '@' + post.creator, url }); }

        // Closing the native share menu is normal so don't toast an error for that
        catch (error) { if (error.name !== 'AbortError') toast('Sharing is unavailable in this browser.'); }
      };
      grid.append(native);
    }
    const original = node('a', 'panel-share-action');
    original.href = url;
    original.target = '_blank';

    // Keep the external page from getting access to this tab
    original.rel = 'noopener noreferrer';
    original.append(actionIcon('open'), node('span', '', 'Watch on TikTok'));
    grid.append(original);
    body.append(grid);
  }

  function creator(post, back) {
    const body=page(post.name || post.creator, '', {back,reopen:()=>creator(post,back)});
    const header=node('section','creator-header'),avatar=node('div','profile-portrait',post.initial || post.creator.slice(0,1));
    avatar.setAttribute('aria-hidden','true');
    header.append(avatar,node('h3','profile-handle','@'+post.creator));
    const stats=node('div','profile-stats');

    // Don't substitute current counts for historical counts we haven't archived
    for(const label of ['Following','Followers','Likes']){const stat=node('div');stat.append(node('strong','','—'),node('span','',label));stats.append(stat);}
    const follow=node('button','profile-follow');follow.id='creator-follow';
    const refresh=()=>{follow.textContent=state.following.includes(post.creator)?'Following':'Follow';follow.classList.toggle('is-following',state.following.includes(post.creator));};refresh();

    // Following belongs to an account so guests need signup first
    follow.onclick=()=>{if(!Accounts.signedIn){signup(false,()=>creator(post,back));return;}state.following=state.following.includes(post.creator)?state.following.filter(id=>id!==post.creator):[...state.following,post.creator];save();refreshButtons();refresh();};
    header.append(stats,follow,node('p','profile-note','Counts unavailable'));
    body.append(header);
    const tabs=node('div','profile-grid-tabs');tabs.innerHTML='<span class="active" aria-label="Videos"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z"/></svg></span>';
    body.append(tabs);renderPosts(POSTS.filter(item=>item.creator===post.creator),body);
  }

  function sound(post, back) {
    const body = page('Sound', '', {back,reopen:()=>sound(post,back)});
    const heading = node('div', 'panel-sound-heading');
    const cover = node('span', 'panel-sound-cover');
    cover.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l11-2v12M9 9l11-2"/><ellipse cx="6" cy="17" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/></svg>';
    const title = node('div');
    const info=soundInfo(post);
    title.append(node('h3','',info.title));
    if(info.artist)title.append(node('p','sound-creator',info.artist));

    // Only show videos we can associate with this sound label
    const related=soundPosts(POSTS,post);
    title.append(node('p','panel-note',related.length+(related.length===1?' video in collection':' videos in collection')));
    heading.append(cover, title);
    body.append(heading);
    renderPosts(related,body);
    const create = node('button', 'primary panel-use-sound', 'Use this sound');

    // Keep the old layout without pretending video creation works
    create.disabled = true;
    create.setAttribute('aria-describedby', 'sound-disabled-reason');
    const note = node('p', 'panel-note sound-disabled-note', 'Video creation is disabled.');
    note.id = 'sound-disabled-reason';
    const bar=node('div','sound-use-bar');bar.append(create,note);
    $('#sheet-body').insertBefore(bar,$('#sheet .page-nav'));
  }

  function inbox(back) {
    const body=page('Inbox','',{tab:'inbox',back,reopen:()=>inbox(back)});
    const empty=node('div','inbox-empty');
    const mark=node('span','inbox-mark');mark.setAttribute('aria-hidden','true');
    mark.innerHTML='<svg viewBox="0 0 24 24"><path d="M3 3h18v15h-6l-3 4-3-4H3zM8 10h8"/></svg>';
    empty.append(mark,node('h3','','No messages'),node('p','','Messaging is unavailable.'));body.append(empty);
  }

  function details(post) {
    openSheet('Video details', '');
    const body = $('#sheet-body');
    body.append(node('h3', '', '@' + post.creator), node('p', '', post.caption));

    // Only render a date once it matches the format our catalog expects
    if (/^2020-\d{2}-\d{2}$/.test(post.date || '')) {
      const date = node('time', 'panel-post-date', post.date.replace(/-0/g, '-'));
      date.dateTime = post.date;
      body.append(date, node('p', 'panel-note', 'Date decoded from the original video ID, shown in UTC.'));
    }
    const original = node('a', 'panel-original', 'Open original video');
    original.href = originalUrl(post);
    original.target = '_blank';
    original.rel = 'noopener noreferrer';
    body.append(original);
  }

  function signup(login = false, back) {
    const body=authPage(login ? 'Log in' : 'Sign up','',back);
    $('#sheet').classList.add('signup-page');
    const title = node('h3', 'signup-title', login ? 'Log in to TikTok 2020' : 'Sign up for TikTok 2020');
    const phone = node('button', 'signup-phone', login ? 'Log in with email' : 'Sign up with email');

    // The red signup action uses email since phone signup isn't connected
    phone.onclick = () => Accounts.emailForm(login,back);
    phone.setAttribute('aria-describedby', 'signup-status');
    const divider = node('div', 'signup-divider', 'OR');
    const methods = node('div', 'signup-socials');

    // These stay disabled until their providers are actually connected
    ['facebook', 'google', 'twitter'].forEach(provider => {
      const button = node('button', 'signup-social signup-' + provider);
      const image = node('img');
      image.src = 'assets/' + provider + '.svg';
      image.alt = '';
      button.append(image);
      button.disabled = true;
      button.setAttribute('aria-label', 'Continue with ' + provider[0].toUpperCase() + provider.slice(1));
      button.setAttribute('aria-describedby', 'signup-status');
      methods.append(button);
    });
    const status = node('p', 'signup-status', 'Confirm your email to finish signing up. Other sign-in methods are unavailable.');
    status.id = 'signup-status';
    const footer = node('div', 'signup-footer');
    const switchMode = node('button', 'signup-switch', login ? 'Sign up' : 'Log in');
    switchMode.onclick = () => signup(!login,back);
    footer.append(document.createTextNode(login ? 'Don’t have an account? ' : 'Already have an account? '), switchMode);
    body.append(title, phone, divider, methods, status, footer);
  }
  root.Panels = { discover, share, sound, details, signup, page, authPage, creator, thumbnail, renderPosts, inbox };
  if (typeof module !== 'undefined') {
    module.exports = { matches, soundPosts, soundInfo, hashtags, searchHistory, rememberSearch };
    if (require.main === module) {
      const assert = require('node:assert/strict');
      const sample = [{ id: '1', creator: 'viewer', name: 'Viewer', caption: 'Food #pancake', tags: ['food'], sound: 'Original TikTok audio' }, { id: '2', creator: 'other', name: 'Other', caption: 'Dance', tags: ['dance'], sound: 'Original TikTok audio' }];
      assert.equal(matches(sample, '#pancake', 'Hashtags').length, 1);
      assert.equal(matches(sample, 'VIEWER', 'Users').length, 1);
      assert.equal(matches(sample, 'viewer', 'Videos').length, 0);
      assert.equal(soundPosts(sample, sample[0]).length, 1);
      console.log('Panel search and unknown-sound checks passed.');
    }
  }
})(typeof window === 'undefined' ? globalThis : window);
