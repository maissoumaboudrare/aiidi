const scanButton = document.querySelector("#scanButton");
const downloadButton = document.querySelector("#downloadButton");
const downloadButtonText = document.querySelector("#downloadButtonText");
const statusElement = document.querySelector("#status");
const countElement = document.querySelector("#count");
const galleryElement = document.querySelector("#gallery");
const controlsElement = document.querySelector("#controls");
const downloadArea = document.querySelector("#downloadArea");
const downloadStatus = document.querySelector("#downloadStatus");
const selectAll = document.querySelector("#selectAll");
const selectedCount = document.querySelector("#selectedCount");

let mediaItems = [];
let sourceInfo = null;

scanButton.addEventListener("click", scanPost);
downloadButton.addEventListener("click", downloadSelected);

selectAll.addEventListener("change", () => {
  mediaItems.forEach((item) => {
    item.selected = selectAll.checked;
  });

  renderMedia();
});

async function scanPost() {
  scanButton.disabled = true;

  statusElement.textContent = "Scanning post…";
  countElement.textContent = "0";
  galleryElement.innerHTML = "";
  controlsElement.style.display = "none";
  downloadArea.style.display = "none";
  downloadStatus.textContent = "";

  downloadButton.classList.remove("complete");
  downloadButton.style.setProperty("--progress", "0%");
  downloadButtonText.textContent = "Download Selected";

  mediaItems = [];

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const results = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
      },

      func: async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        const dialog = document.querySelector('div[role="dialog"]');

        if (!dialog) {
          return {
            success: false,
            error: "No Instagram post is currently open.",
          };
        }

        /*
         * -------------------------------------------------------
         * SOURCE INFORMATION
         * -------------------------------------------------------
         */

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
          } catch {
            // Keep fallback username.
          }
        }

        let postUrl = window.location.href;

        const postLink = [...dialog.querySelectorAll("a")].find(
          (link) => link.href.includes("/p/") || link.href.includes("/reel/"),
        );

        if (postLink) {
          postUrl = postLink.href;
        }

        /*
         * -------------------------------------------------------
         * MEDIA COLLECTION
         * -------------------------------------------------------
         */

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

          /*
           * Instagram keeps previous and next carousel slides
           * mounted outside the visible media area.
           *
           * The active slide is the large media element whose
           * horizontal center is closest to the viewport center
           * among the currently visible candidates.
           */

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

              const resolution = resolutionMatch
                ? Number(resolutionMatch[1])
                : 0;

              const key = `${assetId}:${encodeTag}`;

              if (!variants.has(key)) {
                variants.set(key, {
                  assetId,
                  duration: metadata.duration_s || null,

                  bitrate: metadata.bitrate || 0,

                  resolution,

                  quality: resolution ? `${resolution}p` : "video",

                  encodeTag,

                  url: url.href,

                  startTime: resource.startTime,
                });
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

          const matching = resources.filter(
            (resource) =>
              resource.duration !== null &&
              Math.abs(resource.duration - video.duration) < 1,
          );

          if (!matching.length) {
            return null;
          }

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
            latestStartTime: Math.max(
              ...variants.map((variant) => variant.startTime || 0),
            ),
          }));

          /*
           * Prefer the asset with the greatest number
           * of available representations.
           *
           * If two assets have the same number of
           * variants, prefer the most recently loaded.
           */

          assets.sort((a, b) => {
            if (b.variants.length !== a.variants.length) {
              return b.variants.length - a.variants.length;
            }

            return b.latestStartTime - a.latestStartTime;
          });

          const asset = assets[0];

          if (!asset) {
            return null;
          }

          /*
           * Resolution is more important than bitrate.
           * Bitrate is only the tie-breaker.
           */

          return [...asset.variants].sort((a, b) => {
            if (b.resolution !== a.resolution) {
              return b.resolution - a.resolution;
            }

            return b.bitrate - a.bitrate;
          })[0];
        }

        async function collectActiveSlide() {
          /*
           * Give Instagram a moment to finish replacing
           * the currently active slide after navigation.
           */

          await sleep(150);

          const active = getActiveMediaElement();

          if (!active) {
            return false;
          }

          if (active.tagName === "VIDEO") {
            /*
             * A video may need a little extra time before
             * duration and network representations become
             * available.
             */

            for (let attempt = 0; attempt < 6; attempt++) {
              const variant = findBestVideoVariant(active);

              if (variant) {
                collected.push({
                  type: "video",

                  url: variant.url,

                  assetId: variant.assetId,

                  width: active.videoWidth || 0,

                  height: active.videoHeight || 0,

                  duration: active.duration,

                  bitrate: variant.bitrate,

                  quality: variant.quality,

                  resolution: variant.resolution,

                  encodeTag: variant.encodeTag,

                  poster: active.poster || "",
                });

                return true;
              }

              await sleep(350);
            }

            return false;
          }

          if (active.tagName === "IMG") {
            /*
             * A video cover is not a carousel image.
             * If Instagram temporarily exposes the cover
             * before the <video> becomes ready, wait for it.
             */

            if (isVideoCoverImage(active)) {
              for (let attempt = 0; attempt < 6; attempt++) {
                await sleep(350);

                const retry = getActiveMediaElement();

                if (retry?.tagName === "VIDEO") {
                  const variant = findBestVideoVariant(retry);

                  if (variant) {
                    collected.push({
                      type: "video",

                      url: variant.url,

                      assetId: variant.assetId,

                      width: retry.videoWidth || 0,

                      height: retry.videoHeight || 0,

                      duration: retry.duration,

                      bitrate: variant.bitrate,

                      quality: variant.quality,

                      resolution: variant.resolution,

                      encodeTag: variant.encodeTag,

                      poster: active.src || active.currentSrc || "",
                    });

                    return true;
                  }
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

        /*
         * Capture exactly one media item per active slide,
         * then advance the Instagram carousel.
         */

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

          await sleep(900);
        }

        return {
          success: true,
          username,
          postUrl,
          media: collected,
        };
      },
    });

    const result = results?.[0]?.result;

    if (!result) {
      throw new Error("No response received from page.");
    }

    if (!result.success) {
      statusElement.textContent = result.error;
      return;
    }

    sourceInfo = {
      username: sanitizeFilename(result.username || "instagram"),

      postUrl: result.postUrl,
    };

    mediaItems = result.media.map((item, index) => ({
      ...item,
      index,
      selected: true,
    }));

    countElement.textContent = mediaItems.length;

    statusElement.textContent = "Scan complete";

    controlsElement.style.display = mediaItems.length ? "flex" : "none";

    downloadArea.style.display = mediaItems.length ? "block" : "none";

    selectAll.checked = true;

    renderMedia();
  } catch (error) {
    console.error(error);

    statusElement.textContent = "Scan failed";
  } finally {
    scanButton.disabled = false;
  }
}

/*
 * -------------------------------------------------------
 * GALLERY
 * -------------------------------------------------------
 */

function renderMedia() {
  galleryElement.innerHTML = "";

  mediaItems.forEach((item, index) => {
    const container = document.createElement("div");

    container.className = item.selected ? "media selected" : "media";

    /*
     * IMAGE / VIDEO PREVIEW
     */

    const image = document.createElement("img");

    if (item.type === "video") {
      image.src = item.poster || createVideoPlaceholder();

      image.title =
        `${item.width} × ${item.height}` + ` · ${item.quality}` + ` · no audio`;
    } else {
      image.src = item.url;

      image.title = `${item.width} × ${item.height}`;
    }

    const check = document.createElement("div");

    check.className = "check";
    check.textContent = "✓";

    const number = document.createElement("div");

    number.className = "media-number";

    if (item.type === "video") {
      number.textContent = `${index + 1} · ${item.quality}`;
    } else {
      number.textContent = index + 1;
    }

    container.appendChild(image);
    container.appendChild(check);
    container.appendChild(number);

    /*
     * Video badge.
     */

    if (item.type === "video") {
      const badge = document.createElement("div");

      badge.className = "video-badge";
      badge.textContent = "VIDEO";

      container.appendChild(badge);
    }

    container.addEventListener("click", () => {
      item.selected = !item.selected;
      renderMedia();
    });

    galleryElement.appendChild(container);
  });

  updateSelectionUI();
}

function updateSelectionUI() {
  const selected = mediaItems.filter((item) => item.selected);

  selectedCount.textContent = `${selected.length} selected`;

  selectAll.checked =
    mediaItems.length > 0 && selected.length === mediaItems.length;

  downloadButton.disabled = selected.length === 0;
}

/*
 * -------------------------------------------------------
 * DOWNLOAD
 * -------------------------------------------------------
 */

async function downloadSelected() {
  const selected = mediaItems.filter((item) => item.selected);

  if (!selected.length) {
    return;
  }

  downloadButton.disabled = true;

  downloadButton.classList.remove("complete");

  downloadButton.style.setProperty("--progress", "0%");

  downloadButtonText.textContent = `Downloading… 0 / ${selected.length}`;

  downloadStatus.textContent = "";

  let completed = 0;

  for (let i = 0; i < selected.length; i++) {
    const item = selected[i];

    const extension = item.type === "video" ? "mp4" : getExtension(item.url);

    /*
     * Preserve original media position
     * rather than renumbering the selected subset.
     */

    const number = String(item.index + 1).padStart(2, "0");

    const filename =
      "MediaCollector/" + `${sourceInfo.username}_` + `${number}.${extension}`;

    try {
      await chrome.downloads.download({
        url: item.url,
        filename,
        conflictAction: "uniquify",
        saveAs: false,
      });

      completed++;

      const progress = Math.round((completed / selected.length) * 100);

      downloadButton.style.setProperty("--progress", `${progress}%`);

      downloadButtonText.textContent = `Downloading… ${completed} / ${selected.length}`;

      await sleep(150);
    } catch (error) {
      console.error("Download failed:", item.url, error);
    }
  }

  if (completed === selected.length) {
    downloadButton.style.setProperty("--progress", "100%");

    downloadButton.classList.add("complete");

    downloadButtonText.textContent = "✓ Download complete";

    downloadStatus.textContent = `${completed} files sent to Downloads`;
  } else {
    downloadButtonText.textContent = "Download incomplete";

    downloadStatus.textContent = `${completed} / ${selected.length} files sent to Downloads`;
  }

  downloadButton.disabled = false;
}

/*
 * -------------------------------------------------------
 * HELPERS
 * -------------------------------------------------------
 */

function getExtension(url) {
  try {
    const pathname = new URL(url).pathname;

    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);

    if (match) {
      const ext = match[1].toLowerCase();

      if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
        return ext === "jpeg" ? "jpg" : ext;
      }
    }
  } catch {
    // Ignore.
  }

  return "jpg";
}

function sanitizeFilename(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createVideoPlaceholder() {
  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="400"
        height="400"
        viewBox="0 0 400 400"
      >
        <rect
          width="400"
          height="400"
          fill="#222"
        />

        <polygon
          points="165,125 165,275 285,200"
          fill="#fff"
        />
      </svg>
    `)
  );
}
