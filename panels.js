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

})(typeof window === 'undefined' ? globalThis : window);
