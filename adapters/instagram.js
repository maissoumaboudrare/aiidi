async function scanInstagramPost() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const profileLinks = [...dialog.querySelectorAll("a")];

  const possibleProfile = profileLinks.find((link) => {
    try {
      const url = new URL(link.href);
      const parts = url.pathname.split("/").filter(Boolean);

      return (
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

  let postUrl = window.location.href;

  const postLink = [...dialog.querySelectorAll("a")].find(
    (link) => link.href.includes("/p/") || link.href.includes("/reel/"),
  );

  if (postLink) {
    postUrl = postLink.href;
  }

  // --------------------------------------------------
  // MEDIA HELPERS
  // --------------------------------------------------

  const collected = [];

  function getMediaElements() {
    const images = [...dialog.querySelectorAll("img")].filter(
      (img) => img.naturalWidth >= 300 && img.naturalHeight >= 300,
    );

    const videos = [...dialog.querySelectorAll("video")].filter(
      (video) => video.videoWidth >= 300 && video.videoHeight >= 300,
    );

    return [...images, ...videos];
  }

  function getActiveMediaElement() {
    const elements = getMediaElements();

    if (!elements.length) {
      return null;
    }

    const viewportCenter = window.innerWidth / 2;

    const candidates = elements
      .map((element) => {
        const rect = element.getBoundingClientRect();

        return {
          element,
          rect,
          center: rect.left + rect.width / 2,
        };
      })
      .filter(({ rect }) => {
        return (
          rect.width >= 300 &&
          rect.height >= 300 &&
          rect.right > 0 &&
          rect.left < window.innerWidth
        );
      })
      .sort((a, b) => {
        const distanceA = Math.abs(a.center - viewportCenter);
        const distanceB = Math.abs(b.center - viewportCenter);

        return distanceA - distanceB;
      });

    return candidates[0]?.element || null;
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

      return encodeTag.includes("video_default_cover_frame");
    } catch {
      return false;
    }
  }

  // --------------------------------------------------
  // VIDEO RESOURCE DETECTION
  // --------------------------------------------------

  function getVideoResources() {
    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => ({
        url: entry.name,
        startTime: entry.startTime,
      }))
      .filter(({ url }) => url.includes(".mp4"));

    const variants = new Map();

    for (const resource of resources) {
      try {
        const url = new URL(resource.url);
        const efg = url.searchParams.get("efg");

        if (!efg) {
          continue;
        }

        let metadata;

        try {
          metadata = JSON.parse(atob(efg));
        } catch {
          continue;
        }

        const encodeTag = metadata.vencode_tag || "";

        if (encodeTag.includes("audio")) {
          continue;
        }

        if (!encodeTag.includes("dash")) {
          continue;
        }

        const assetId = metadata.xpv_asset_id || null;

        if (!assetId) {
          continue;
        }

        url.searchParams.delete("bytestart");
        url.searchParams.delete("byteend");

        const resolutionMatch = encodeTag.match(/(\d{3,4})p/i);

        const resolution = resolutionMatch ? Number(resolutionMatch[1]) : 0;

        const key = `${assetId}:${encodeTag}`;

        const variant = {
          assetId,

          duration:
            metadata.duration_s !== undefined
              ? Number(metadata.duration_s)
              : null,

          bitrate: Number(metadata.bitrate) || 0,

          resolution,

          quality: resolution ? `${resolution}p` : "video",

          encodeTag,

          url: url.href,

          startTime: resource.startTime,
        };

        const existing = variants.get(key);

        if (!existing || variant.startTime > existing.startTime) {
          variants.set(key, variant);
        }
      } catch {}
    }

    return [...variants.values()];
  }

  function findBestVideoVariant(video) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return null;
    }

    const resources = getVideoResources();

    const durationMatches = resources.filter((resource) => {
      if (resource.duration === null || !Number.isFinite(resource.duration)) {
        return false;
      }

      return Math.abs(resource.duration - video.duration) < 1.1;
    });

    if (!durationMatches.length) {
      return null;
    }

    /*
     * Prefer carousel-specific DASH resources when
     * they exist inside the valid duration window.
     *
     * This prevents an old generic "clips" resource
     * with a closer duration from stealing the match.
     */
    const carouselMatches = durationMatches.filter((resource) =>
      resource.encodeTag.toLowerCase().includes("carousel_item"),
    );

    const matching =
      carouselMatches.length > 0 ? carouselMatches : durationMatches;

    const groups = new Map();

    for (const resource of matching) {
      if (!groups.has(resource.assetId)) {
        groups.set(resource.assetId, []);
      }

      groups.get(resource.assetId).push(resource);
    }

    const assets = [...groups.entries()].map(([assetId, variants]) => ({
      assetId,
      variants,

      durationDifference: Math.min(
        ...variants.map((variant) =>
          Math.abs(variant.duration - video.duration),
        ),
      ),

      latestStartTime: Math.max(
        ...variants.map((variant) => variant.startTime || 0),
      ),
    }));

    assets.sort((a, b) => {
      if (a.durationDifference !== b.durationDifference) {
        return a.durationDifference - b.durationDifference;
      }

      if (b.variants.length !== a.variants.length) {
        return b.variants.length - a.variants.length;
      }

      return b.latestStartTime - a.latestStartTime;
    });

    const asset = assets[0];

    if (!asset) {
      return null;
    }

    return [...asset.variants].sort((a, b) => {
      if (b.resolution !== a.resolution) {
        return b.resolution - a.resolution;
      }

      return b.bitrate - a.bitrate;
    })[0];
  }

  // --------------------------------------------------
  // ACTIVE SLIDE COLLECTION
  // --------------------------------------------------

  async function collectVideo(video, poster = "") {
    for (let attempt = 0; attempt < 4; attempt++) {
      const variant = findBestVideoVariant(video);

      if (variant) {
        collected.push({
          type: "video",

          url: variant.url,

          assetId: variant.assetId,

          width: video.videoWidth || 0,
          height: video.videoHeight || 0,

          duration: video.duration,

          bitrate: variant.bitrate,

          quality: variant.quality,
          resolution: variant.resolution,

          encodeTag: variant.encodeTag,

          poster: poster || video.poster || "",
        });

        return true;
      }

      await sleep(200);
    }

    return false;
  }

  async function collectActiveSlide() {
    await sleep(100);

    let active = getActiveMediaElement();

    if (!active) {
      return false;
    }

    if (active.tagName === "VIDEO") {
      return collectVideo(active);
    }

    if (active.tagName === "IMG") {
      if (isVideoCoverImage(active)) {
        for (let attempt = 0; attempt < 4; attempt++) {
          await sleep(200);

          active = getActiveMediaElement();

          if (active?.tagName === "VIDEO") {
            return collectVideo(active, active.poster || "");
          }
        }

        return false;
      }

      const url = active.src || active.currentSrc;

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

  for (let step = 0; step < 25; step++) {
    await collectActiveSlide();

    const buttons = [...dialog.querySelectorAll("button")];

    const nextButton = buttons.find((button) => {
      const label = (
        button.getAttribute("aria-label") ||
        button.innerText ||
        ""
      )
        .trim()
        .toLowerCase();

      return label.includes("next") || label.includes("suivant");
    });

    if (!nextButton) {
      break;
    }

    nextButton.click();

    await sleep(550);
  }

  return {
    success: true,
    username,
    postUrl,
    media: collected,
  };
}
