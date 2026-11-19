// Runs at document_start in MAIN. Observe Instagram's own responses; never
// issue requests, read credentials, or expose complete response bodies.
(() => {
  const posts = new Map();
  const imiximikMediaUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' &&
      /(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com)$/.test(url.hostname) ? url.href : ''; }
    catch { return ''; }
  };
  function children(post) {
    return post.carousel_media || post.edge_sidecar_to_children?.edges?.map(edge => edge.node) || [post];
  }
  function capture(payload) {
    const stack = [payload];
    for (let count = 0; stack.length && count < 100000; count++) {
      const value = stack.pop();
      if (!value || typeof value !== 'object') continue;
      const code = value.code || value.shortcode;
      const username = value.user?.username || value.owner?.username;
      if (typeof code === 'string' && /^[\w-]+$/.test(code) && typeof username === 'string') {
        const media = children(value).map(child => ({
          id: String(child.pk || child.id || ''),
          media_type: child.media_type || (child.is_video ? 2 : 1),
          video_duration: child.video_duration,
          video_versions: [...(child.video_versions || []), ...(child.video_url ? [{
            url: child.video_url, width: child.dimensions?.width, height: child.dimensions?.height
          }] : [])].map(v => ({url: imiximikMediaUrl(v.url), width: v.width, height: v.height})).filter(v => v.url),
          display_url: imiximikMediaUrl(child.image_versions2?.candidates?.[0]?.url || child.display_url)
        }));
        const key = `${username.toLowerCase()}:${code}`;
        const previous = posts.get(key);
        const score = list => list.reduce((sum, child) => sum + (child.video_versions.length ? 1 : 0), 0);
        if (!previous || (media.length >= previous.carousel_media.length && score(media) >= score(previous.carousel_media))) {
          posts.delete(key);
          posts.set(key, {code, user: {username}, carousel_media: media});
          if (posts.size > 300) posts.delete(posts.keys().next().value);
        }
      }
      for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
    }
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > 20000000) return;
    // Preserve media IDs beyond Number.MAX_SAFE_INTEGER before JSON.parse.
    const clean = text.replace(/^for\s*\(;;\);\s*/, '').replace(/("(?:pk|id)"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"');
    try { capture(JSON.parse(clean)); }
    catch { for (const line of clean.split('\n')) { try { capture(JSON.parse(line)); } catch {} } }
  }
  function relevant(value) {
    try { const url = new URL(value, location.href); return url.origin === location.origin &&
      (/^\/(?:api\/)?graphql(?:\/|$)/.test(url.pathname) || url.pathname.startsWith('/api/v1/')); }
    catch { return false; }
  }
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const pending = Reflect.apply(originalFetch, this, args);
    // Observe a clone without consuming or delaying the site's response.
    pending.then(response => {
      if (relevant(response.url)) response.clone().text().then(parse).catch(() => {});
    }).catch(() => {});
    return pending;
  };
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', () => {
      try {
        if (!relevant(this.responseURL)) return;
        if (this.responseType === 'json') capture(this.response);
        else if (!this.responseType || this.responseType === 'text') parse(this.responseText);
      } catch {}
    }, {once: true});
    return Reflect.apply(originalSend, this, args);
  };
  document.addEventListener('aiidi:request-post', event => {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches('script[data-aiidi-post]')) return;
    // Also cover initial HTML hydration; it may contain the only copy of a post.
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      if (!script.hasAttribute('data-aiidi-post')) parse(script.textContent);
    }
    const key = `${(target.getAttribute('data-owner') || '').toLowerCase()}:${target.getAttribute('data-aiidi-post')}`;
    target.textContent = JSON.stringify({ready: true, post: posts.get(key) || null});
  });
})();
