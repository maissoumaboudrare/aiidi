const scanButton = document.querySelector("#scanButton");
const downloadButton = document.querySelector("#downloadButton");
const downloadButtonText = document.querySelector("#downloadButtonText");
const statusElement = document.querySelector("#status");
const countElement = document.querySelector("#count");
const countLabel = document.querySelector("#countLabel");
const galleryElement = document.querySelector("#gallery");
const controlsElement = document.querySelector("#controls");
const downloadArea = document.querySelector("#downloadArea");
const downloadStatus = document.querySelector("#downloadStatus");
const selectAll = document.querySelector("#selectAll");
const selectedCount = document.querySelector("#selectedCount");
const mediaFilter = document.querySelector("#mediaFilter");
const filterButtons = [...document.querySelectorAll(".filter-button")];

let mediaItems = [];
let sourceInfo = null;
let currentFilter = "both";

scanButton.addEventListener("click", scanPost);
downloadButton.addEventListener("click", downloadSelected);

selectAll.addEventListener("change", () => {
  const visibleMedia = getVisibleMedia();

  visibleMedia.forEach((item) => {
    item.selected = selectAll.checked;
  });

  renderMedia();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;

    filterButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    resetDownloadUI();
    renderMedia();
  });
});

function getVisibleMedia() {
  if (currentFilter === "both") {
    return mediaItems;
  }

  return mediaItems.filter((item) => item.type === currentFilter);
}

function resetDownloadUI() {
  downloadButton.classList.remove("complete");
  downloadButton.style.setProperty("--progress", "0%");
  downloadButtonText.textContent = "Download Selected";
  downloadStatus.textContent = "";
}

async function scanPost() {
  scanButton.disabled = true;

  statusElement.textContent = "Scanning post…";
  countElement.textContent = "0";
  countLabel.textContent = "media detected";

  galleryElement.innerHTML = "";
  controlsElement.style.display = "none";
  mediaFilter.style.display = "none";
  downloadArea.style.display = "none";

  resetDownloadUI();

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

              const resolution = resolutionMatch
                ? Number(resolutionMatch[1])
                : 0;

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
            if (
              resource.duration === null ||
              !Number.isFinite(resource.duration)
            ) {
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

    currentFilter = "both";

    filterButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === "both");
    });

    statusElement.textContent = "Scan complete";

    mediaFilter.style.display = mediaItems.length ? "grid" : "none";
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

// --------------------------------------------------
// GALLERY
// --------------------------------------------------

function renderMedia() {
  galleryElement.innerHTML = "";

  const visibleMedia = getVisibleMedia();

  countElement.textContent = visibleMedia.length;

  if (currentFilter === "image") {
    countLabel.textContent =
      visibleMedia.length === 1 ? "image detected" : "images detected";
  } else if (currentFilter === "video") {
    countLabel.textContent =
      visibleMedia.length === 1 ? "video detected" : "videos detected";
  } else {
    countLabel.textContent =
      visibleMedia.length === 1 ? "media detected" : "media detected";
  }

  visibleMedia.forEach((item) => {
    const container = document.createElement("div");

    container.className = item.selected ? "media selected" : "media";

    const image = document.createElement("img");

    if (item.type === "video") {
      if (item.poster) {
        image.src = item.poster;
      } else {
        image.src =
          "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      }

      image.title =
        `${item.width} × ${item.height}` +
        (item.quality ? ` · ${item.quality}` : "");
    } else {
      image.src = item.url;
      image.title = `${item.width} × ${item.height}`;
    }

    const check = document.createElement("div");

    check.className = "check";
    check.textContent = "✓";

    const number = document.createElement("div");

    number.className = "media-number";

    /*
     * Keep the original post/carousel position
     * even while filtering.
     */
    number.textContent = item.index + 1;

    container.appendChild(image);
    container.appendChild(check);
    container.appendChild(number);

    if (item.type === "video") {
      const badge = document.createElement("div");

      badge.className = "video-badge";

      badge.textContent = item.quality ? `VIDEO · ${item.quality}` : "VIDEO";

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
  const visibleMedia = getVisibleMedia();

  const selectedVisible = visibleMedia.filter((item) => item.selected);

  selectedCount.textContent = `${selectedVisible.length} selected`;

  selectAll.checked =
    visibleMedia.length > 0 && selectedVisible.length === visibleMedia.length;

  selectAll.disabled = visibleMedia.length === 0;

  downloadButton.disabled = selectedVisible.length === 0;
}

// --------------------------------------------------
// DOWNLOAD
// --------------------------------------------------

async function downloadSelected() {
  /*
   * Download only selected media currently visible
   * through the active filter.
   */
  const selected = getVisibleMedia().filter((item) => item.selected);

  if (!selected.length) {
    return;
  }

  downloadButton.disabled = true;

  downloadButton.classList.remove("complete");
  downloadButton.style.setProperty("--progress", "0%");

  downloadButtonText.textContent = `Downloading… 0 / ${selected.length}`;

  downloadStatus.textContent = "";

  let completed = 0;

  for (const item of selected) {
    const extension = item.type === "video" ? "mp4" : getExtension(item.url);

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

// --------------------------------------------------
// UTILITIES
// --------------------------------------------------

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
  } catch {}

  return "jpg";
}

function sanitizeFilename(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
