async function scanInstagramPost(expectedUsername = null) {
  const deadline = Date.now() + 80000;
  const imiximikPause = async (ms) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (Date.now() > deadline) throw new Error("Post scan time limit reached");
  };

  const dialog = document.querySelector('div[role="dialog"]');

  if (!dialog) {
    return {
      success: false,
      error: "No Instagram post is currently open.",
    };
  }

  // --------------------------------------------------
  // SOURCE INFORMATION
  // --------------------------------------------------

  let username = "instagram";

  const profileLinks = [...(dialog.querySelector("header") || dialog).querySelectorAll("a")];

  const possibleProfile = profileLinks.find((link) => {
    try {
      const url = new URL(link.href);
      const parts = url.pathname.split("/").filter(Boolean);

      return (
        ["instagram.com", "www.instagram.com"].includes(url.hostname) &&
        parts.length === 1 &&
        !["explore", "accounts", "direct", "reels"].includes(parts[0])
      );
    } catch {
      return false;
    }
  });

  if (possibleProfile) {
    try {
      username = new URL(possibleProfile.href).pathname
        .split("/")
        .filter(Boolean)[0];
    } catch {}
  }

  if (expectedUsername && username.toLowerCase() !== expectedUsername.toLowerCase()) {
    return { success: false, error: `Post owner @${username} does not match @${expectedUsername}.` };
  }

  const postMatch = new URL(window.location.href).pathname.match(
    /^\/(?:[A-Za-z0-9._]+\/)?(p|reel)\/([A-Za-z0-9_-]+)\/?$/);
  if (!postMatch) return { success: false, error: "Unable to identify the current publication." };
  const postUrl = `https://www.instagram.com/${postMatch[1]}/${postMatch[2]}/`;

  // --------------------------------------------------
  // MEDIA HELPERS
  // --------------------------------------------------

  const collected = [];
  const diagnostics = { slidesVisited: 0, unresolvedSlides: [], repeatedSlides: 0 };
  let collectionFailure = "Media URL unresolved";

  // Resolve the post once, then use its ordered child IDs. A video duration
  // and an encoding asset ID are not identities of an Instagram publication.
  function postChildren(post) {
    if (Array.isArray(post.carousel_media)) return post.carousel_media;
    if (Array.isArray(post.edge_sidecar_to_children?.edges)) {
      return post.edge_sidecar_to_children.edges.map(edge => edge.node);
    }
    return [post];
  }
  function findPostMetadata(payload) {
    const stack = [payload];
    let best = null, bestScore = -1;
    for (let visited = 0; stack.length && visited < 100000; visited++) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if ((node.code || node.shortcode) === postMatch[2]) {
        const owner = node.user?.username || node.owner?.username;
        if (owner?.toLowerCase() === (expectedUsername || username).toLowerCase()) {
          const children = postChildren(node);
          const score = children.reduce((sum, child) => sum +
            (child?.video_url || child?.video_versions?.length ? 1 : 0), 0);
          if (score > bestScore) { best = node; bestScore = score; }
        }
      }
      stack.push(...Object.values(node).filter(value => value && typeof value === "object"));
    }
    return bestScore > 0 ? best : null;
  }
  function loadPostMetadata() {
    // A transient DOM node bridges MAIN and the isolated scanner without
    // exposing extension APIs or retaining page response bodies in the DOM.
    const request = document.createElement("script");
    request.type = "application/json";
    request.setAttribute("data-aiidi-post", postMatch[2]);
    request.setAttribute("data-owner", expectedUsername || username);
    document.documentElement.appendChild(request);
    try {
      request.dispatchEvent(new Event("aiidi:request-post", {bubbles: true}));
      const reply = request.textContent ? JSON.parse(request.textContent) : null;
      const post = reply?.post && findPostMetadata(reply.post);
      if (post) return post;
      collectionFailure = reply?.ready
        ? "No video identity received for this post; reopen it from the profile and retry"
        : "Reload Media Collector, then reload the Instagram profile before scanning";
    } finally { request.remove(); }
    return null;
  }
  async function identifiedVideo(slideIndex) {
    // Recheck on each retry: Instagram's response can arrive after the player.
    const post = loadPostMetadata();
    if (!post) return null;
    const child = postChildren(post)[slideIndex];
    if (!child) return null;
    const versions = [...(child.video_versions || []),
      ...(child.video_url ? [{ url: child.video_url,
        width: child.dimensions?.width, height: child.dimensions?.height }] : [])];
    const version = versions.filter(item => {
      try { return new URL(item.url).protocol === "https:"; } catch { return false; }
    }).sort((a, b) => (Number(b.width) || 0) * (Number(b.height) || 0) -
      (Number(a.width) || 0) * (Number(a.height) || 0))[0];
    if (!version) return null;
    const resolution = Number(version.height) || 0;
    return { url: version.url, assetId: String(child.pk || child.id || child.code || `${postMatch[2]}:${slideIndex}`),
      width: Number(version.width) || 0, height: resolution,
      duration: child.video_duration, resolution, quality: resolution ? `${resolution}p` : "video",
      bitrate: 0, encodeTag: "post-media-identity",
      poster: child.image_versions2?.candidates?.[0]?.url || child.display_url || "" };
  }

  // Intersect with every clipping ancestor, not the dialog centre (which
  // includes comments). Instagram keeps neighbouring slides mounted offscreen.
  function visibleRect(element) {
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    let right = Math.min(window.innerWidth, rect.right);
    let bottom = Math.min(window.innerHeight, rect.bottom);
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return null;
      const bounds = node.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
        left = Math.max(left, bounds.left);
        right = Math.min(right, bounds.right);
      }
      if (/hidden|clip|auto|scroll/.test(style.overflowY)) {
        top = Math.max(top, bounds.top);
        bottom = Math.min(bottom, bounds.bottom);
      }
    }
    if (right <= left || bottom <= top) return null;
    return { left, right, top, bottom, area: (right - left) * (bottom - top), rect };
  }

  function getActiveMediaElement() {
    const candidates = [...dialog.querySelectorAll("img, video")].map(element => {
      const view = visibleRect(element);
      const width = element.naturalWidth || element.videoWidth || 0;
      const height = element.naturalHeight || element.videoHeight || 0;
      const style = getComputedStyle(element);
      if (!view || !width || !height || Math.max(width, height) < 250 ||
          style.display === "none" || style.visibility === "hidden" ||
          view.rect.width < 100 || view.rect.height < 100) return null;
      // During a horizontal transition, neither slide is ready to collect.
      if ((view.right - view.left) / view.rect.width < 0.98) return null;
      return { element, view };
    }).filter(Boolean).sort((a, b) => b.view.area - a.view.area);
    const first = candidates[0];
    if (!first) return null;
    // Prefer a player to its cover only when their rectangles overlap.
    // Equal distances to the dialog centre do NOT mean the same slide.
    const player = candidates.find(({ element, view }) => {
      if (element.tagName !== "VIDEO") return false;
      const overlap = Math.max(0, Math.min(view.right, first.view.right) -
        Math.max(view.left, first.view.left)) * Math.max(0,
        Math.min(view.bottom, first.view.bottom) - Math.max(view.top, first.view.top));
      return overlap >= Math.min(view.area, first.view.area) * 0.9;
    });
    return player?.element || first.element;
  }

  function slideSignature() {
    const active = getActiveMediaElement();
    if (!active) return null;
    const slide = active.closest("li");
    // translateX belongs to the carousel slot and remains fixed while the
    // strip scrolls. A cover becoming a video is still the same slot.
    if (slide?.style.transform && slide.style.transform !== "none") {
      return `slot:${slide.style.transform}`;
    }
    return `${active.tagName}:${active.currentSrc || active.src || active.poster || "pending"}`;
  }

  async function waitForSlide(previousSignature = null) {
    let last = null, stable = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      await imiximikPause(150);
      const signature = slideSignature();
      if (signature && signature !== previousSignature) {
        stable = signature === last ? stable + 1 : 1;
        if (stable >= 3) return signature;
      } else stable = 0;
      last = signature;
    }
    return null;
  }

  function carouselButton(direction) {
    const active = getActiveMediaElement();
    if (!active) return null;
    // Stop at the nearest media container with carousel controls. This
    // excludes the outer Next/Previous publication arrows.
    for (let node = active.parentElement; node && node !== dialog; node = node.parentElement) {
      const buttons = [...node.querySelectorAll("button")].filter(button => {
        const label = (button.getAttribute("aria-label") || "").trim();
        return /^(next|suivant|previous|précédent|go back|retour)$/i.test(label) &&
          !button.disabled && visibleRect(button);
      });
      if (buttons.length) return buttons.find(button => direction === "next"
        ? /^(next|suivant)$/i.test(button.getAttribute("aria-label"))
        : /^(previous|précédent|go back|retour)$/i.test(button.getAttribute("aria-label"))) || null;
    }
    return null;
  }

  function isVideoCoverImage(img) {
    try {
      const url = new URL(img.currentSrc || img.src);
      const efg = url.searchParams.get("efg");

      if (!efg) {
        return false;
      }

      const metadata = JSON.parse(atob(efg));
      const encodeTag = metadata.vencode_tag || "";

      return /video.*(?:cover|thumbnail)/i.test(encodeTag);
    } catch {
      return false;
    }
  }

  // --------------------------------------------------
  // VIDEO RESOURCE DETECTION
  // --------------------------------------------------

  function findBestVideoVariant(video) {
    // A progressive MP4 is already bound to this player. It need not have
    // DASH/efg metadata or still be present in the resource timing buffer.
    try {
      const direct = new URL(video.currentSrc || video.src);
      if (direct.protocol === "https:" && /\.mp4$/i.test(direct.pathname)) {
        direct.searchParams.delete("bytestart");
        direct.searchParams.delete("byteend");
        return { url: direct.href, assetId: direct.pathname,
          resolution: video.videoHeight || 0,
          quality: video.videoHeight ? `${video.videoHeight}p` : "video",
          bitrate: 0, encodeTag: "direct-player-source" };
      }
    } catch {}
    // Durations in efg are rounded and resources include neighbouring posts.
    // They cannot establish the identity of the visible carousel child.
    return null;
  }

  // --------------------------------------------------
  // ACTIVE SLIDE COLLECTION
  // --------------------------------------------------

  async function collectVideo(video, poster = "", slideIndex = 0) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const player = video.tagName === "IMG" ? getActiveMediaElement() || video : video;
      const variant = findBestVideoVariant(player) || await identifiedVideo(slideIndex);

      if (variant) {
        collected.push({
          type: "video",

          url: variant.url,

          assetId: variant.assetId,

          width: variant.width || video.videoWidth || 0,
          height: variant.height || video.videoHeight || 0,

          duration: variant.duration ?? video.duration,

          bitrate: variant.bitrate,

          quality: variant.quality,
          resolution: variant.resolution,

          encodeTag: variant.encodeTag,

          poster: poster || variant.poster || video.poster || "",
        });

        return true;
      }

      await imiximikPause(200);
    }

    return false;
  }

  async function collectActiveSlide(slideIndex) {
    await imiximikPause(100);

    let active = getActiveMediaElement();

    if (!active) {
      return false;
    }

    if (active.tagName === "VIDEO") {
      return collectVideo(active, "", slideIndex);
    }

    if (active.tagName === "IMG") {
      if (isVideoCoverImage(active)) {
        // The post response identifies the video even if playback never starts.
        return collectVideo(active, active.currentSrc || active.src || "", slideIndex);
      }

      const url = active.currentSrc || active.src;

      if (!url) {
        return false;
      }

      collected.push({
        type: "image",

        url,

        width: active.naturalWidth,
        height: active.naturalHeight,

        alt: active.alt || "",
      });

      return true;
    }

    return false;
  }

  // --------------------------------------------------
  // CAROUSEL WALK
  // --------------------------------------------------

  // Start from the first slide even when Scan Post is invoked midway.
  let signature = await waitForSlide();
  for (let rewind = 0; rewind < 25 && signature; rewind++) {
    const previous = carouselButton("previous");
    if (!previous) break;
    previous.click();
    const moved = await waitForSlide(signature);
    if (!moved) {
      return { success: false, error: "Unable to return to the first carousel slide." };
    }
    signature = moved;
    if (rewind === 24) return { success: false, error: "Carousel rewind limit reached." };
  }

  const seenSlideSignatures = new Set();
  for (let step = 0; step < 25; step++) {
    if (!signature) {
      diagnostics.unresolvedSlides.push({ step: step + 1, reason: "No stable visible media" });
      break;
    }
    if (seenSlideSignatures.has(signature)) {
      diagnostics.repeatedSlides++;
      diagnostics.unresolvedSlides.push({ step: step + 1, reason: "Slide did not advance" });
      break;
    }
    seenSlideSignatures.add(signature);
    diagnostics.slidesVisited++;
    collectionFailure = "Media URL unresolved";
    const before = collected.length;
    const ok = await collectActiveSlide(step);
    if (!ok) diagnostics.unresolvedSlides.push({ step: step + 1,
      reason: collectionFailure });
    for (let i = before; i < collected.length; i++) collected[i].index = step;

    const next = carouselButton("next");
    if (!next) break;
    if (step === 24) {
      diagnostics.unresolvedSlides.push({ step: step + 2, reason: "Carousel limit reached" });
      break;
    }
    next.click();
    signature = await waitForSlide(signature);
    if (!signature) {
      diagnostics.unresolvedSlides.push({ step: step + 2, reason: "Next slide timeout" });
      break;
    }
  }

  return {
    success: true,
    username,
    postUrl,
    media: collected,
    diagnostics,
  };
}
