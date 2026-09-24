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
        const sleep = (ms) =>
          new Promise((resolve) => setTimeout(resolve, ms));

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
          (link) =>
            link.href.includes("/p/") ||
            link.href.includes("/reel/"),
        );

        if (postLink) {
          postUrl = postLink.href;
        }

        /*
         * -------------------------------------------------------
         * MEDIA COLLECTION
         * -------------------------------------------------------
         */

        const collected = new Map();

        function collectImages() {
          const images = [...dialog.querySelectorAll("img")];

          for (const img of images) {
            const url = img.currentSrc || img.src;

            if (!url) continue;

            if (
              img.naturalWidth < 300 ||
              img.naturalHeight < 300
            ) {
              continue;
            }

            const alt = (img.alt || "").toLowerCase();

            if (alt.includes("profile picture")) {
              continue;
            }

            /*
             * A video poster/cover can appear as an <img>.
             * We currently keep normal image behaviour.
             * Video duplicates will be handled later.
             */

            collected.set(`image:${url}`, {
              type: "image",
              url,
              width: img.naturalWidth,
              height: img.naturalHeight,
              alt: img.alt || "",
            });
          }
        }

        /*
         * -------------------------------------------------------
         * VIDEO RESOURCE PARSER
         * -------------------------------------------------------
         */

        function getVideoResources() {
          const resources = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => url.includes(".mp4"));

          const variants = new Map();

          for (const resourceUrl of resources) {
            try {
              const url = new URL(resourceUrl);
              const efg = url.searchParams.get("efg");

              if (!efg) continue;

              let metadata;

              try {
                metadata = JSON.parse(
                  atob(decodeURIComponent(efg)),
                );
              } catch {
                continue;
              }

              const encodeTag =
                metadata.vencode_tag || "";

              /*
               * Ignore the separate audio stream.
               */

              if (encodeTag.includes("audio")) {
                continue;
              }

              /*
               * We only want video representations.
               */

              if (!encodeTag.includes("dash")) {
                continue;
              }

              url.searchParams.delete("bytestart");
              url.searchParams.delete("byteend");

              const assetId =
                metadata.xpv_asset_id || null;

              if (!assetId) continue;

              /*
               * Deduplicate Instagram byte-range requests.
               */

              const key = `${assetId}:${encodeTag}`;

              if (!variants.has(key)) {
                variants.set(key, {
                  assetId,
                  duration:
                    metadata.duration_s || null,
                  bitrate:
                    metadata.bitrate || 0,
                  encodeTag,
                  url: url.href,
                });
              }
            } catch {
              // Ignore malformed resource.
            }
          }

          return [...variants.values()];
        }

        /*
         * -------------------------------------------------------
         * ACTIVE VIDEO DETECTION
         * -------------------------------------------------------
         */

        function collectVideos() {
          const videos = [
            ...dialog.querySelectorAll("video"),
          ];

          if (!videos.length) {
            return;
          }

          const resources = getVideoResources();

          for (const video of videos) {
            if (
              !Number.isFinite(video.duration) ||
              video.duration <= 0
            ) {
              continue;
            }

            /*
             * Instagram metadata currently stores duration
             * as an integer.
             *
             * Example:
             * DOM      -> 82.548 seconds
             * metadata -> 82 seconds
             */

            const matchingAssets = resources.filter(
              (resource) =>
                resource.duration !== null &&
                Math.abs(
                  resource.duration - video.duration,
                ) < 1,
            );

            if (!matchingAssets.length) {
              continue;
            }

            /*
             * Group matches by asset ID.
             */

            const groups = new Map();

            for (const resource of matchingAssets) {
              if (!groups.has(resource.assetId)) {
                groups.set(resource.assetId, []);
              }

              groups
                .get(resource.assetId)
                .push(resource);
            }

            /*
             * Prefer the asset with the greatest number
             * of available video representations.
             */

            const candidates = [...groups.entries()]
              .map(([assetId, variants]) => ({
                assetId,
                variants,
              }))
              .sort(
                (a, b) =>
                  b.variants.length -
                  a.variants.length,
              );

            if (!candidates.length) {
              continue;
            }

            const asset = candidates[0];

            /*
             * Best quality = highest bitrate.
             */

            const bestVariant = [...asset.variants].sort(
              (a, b) => b.bitrate - a.bitrate,
            )[0];

            if (!bestVariant) {
              continue;
            }

            /*
             * Extract resolution label from Instagram tag.
             */

            const resolutionMatch =
              bestVariant.encodeTag.match(
                /(\d{3,4})p/i,
              );

            const quality = resolutionMatch
              ? `${resolutionMatch[1]}p`
              : "video";

            /*
             * Try to find a useful visual preview.
             */

            let poster = video.poster || "";

            if (!poster) {
              const nearbyImages = [
                ...dialog.querySelectorAll("img"),
              ].filter(
                (img) =>
                  img.naturalWidth >= 300 &&
                  img.naturalHeight >= 300,
              );

              if (nearbyImages.length) {
                poster =
                  nearbyImages[0].currentSrc ||
                  nearbyImages[0].src ||
                  "";
              }
            }

            collected.set(
              `video:${bestVariant.assetId}`,
              {
                type: "video",

                url: bestVariant.url,

                assetId:
                  bestVariant.assetId,

                width:
                  video.videoWidth || 0,

                height:
                  video.videoHeight || 0,

                duration:
                  video.duration,

                bitrate:
                  bestVariant.bitrate,

                quality,

                poster,

                encodeTag:
                  bestVariant.encodeTag,
              },
            );
          }
        }

        /*
         * -------------------------------------------------------
         * WALK THROUGH CAROUSEL
         * -------------------------------------------------------
         */

        for (let step = 0; step < 25; step++) {
          collectImages();
          collectVideos();

          const buttons = [
            ...dialog.querySelectorAll("button"),
          ];

          const nextButton = buttons.find(
            (button) => {
              const label = (
                button.getAttribute("aria-label") ||
                button.innerText ||
                ""
              )
                .trim()
                .toLowerCase();

              return (
                label.includes("next") ||
                label.includes("suivant")
              );
            },
          );

          if (!nextButton) {
            break;
          }

          nextButton.click();

          /*
           * Give Instagram enough time to:
           * - change carousel item
           * - initialize video
           * - populate PerformanceResourceTiming
           */

          await sleep(900);
        }

        collectImages();
        collectVideos();

        return {
          success: true,
          username,
          postUrl,
          media: [...collected.values()],
        };
      },
    });

    const result = results?.[0]?.result;

    if (!result) {
      throw new Error(
        "No response received from page.",
      );
    }

    if (!result.success) {
      statusElement.textContent = result.error;
      return;
    }

    sourceInfo = {
      username: sanitizeFilename(
        result.username || "instagram",
      ),

      postUrl: result.postUrl,
    };

    mediaItems = result.media.map(
      (item, index) => ({
        ...item,
        index,
        selected: true,
      }),
    );

    countElement.textContent =
      mediaItems.length;

    statusElement.textContent =
      "Scan complete";

    controlsElement.style.display =
      mediaItems.length ? "flex" : "none";

    downloadArea.style.display =
      mediaItems.length ? "block" : "none";

    selectAll.checked = true;

    renderMedia();
  } catch (error) {
    console.error(error);

    statusElement.textContent =
      "Scan failed";
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
    const container =
      document.createElement("div");

    container.className = item.selected
      ? "media selected"
      : "media";

    /*
     * IMAGE / VIDEO PREVIEW
     */

    const image =
      document.createElement("img");

    if (item.type === "video") {
      image.src =
        item.poster ||
        createVideoPlaceholder();

      image.title =
        `${item.width} × ${item.height}` +
        ` · ${item.quality}` +
        ` · no audio`;
    } else {
      image.src = item.url;

      image.title =
        `${item.width} × ${item.height}`;
    }

    const check =
      document.createElement("div");

    check.className = "check";
    check.textContent = "✓";

    const number =
      document.createElement("div");

    number.className = "media-number";

    if (item.type === "video") {
      number.textContent =
        `${index + 1} · ${item.quality}`;
    } else {
      number.textContent =
        index + 1;
    }

    container.appendChild(image);
    container.appendChild(check);
    container.appendChild(number);

    /*
     * Video badge.
     */

    if (item.type === "video") {
      const badge =
        document.createElement("div");

      badge.className = "video-badge";
      badge.textContent = "VIDEO";

      container.appendChild(badge);
    }

    container.addEventListener(
      "click",
      () => {
        item.selected = !item.selected;
        renderMedia();
      },
    );

    galleryElement.appendChild(
      container,
    );
  });

  updateSelectionUI();
}

function updateSelectionUI() {
  const selected = mediaItems.filter(
    (item) => item.selected,
  );

  selectedCount.textContent =
    `${selected.length} selected`;

  selectAll.checked =
    mediaItems.length > 0 &&
    selected.length === mediaItems.length;

  downloadButton.disabled =
    selected.length === 0;
}

/*
 * -------------------------------------------------------
 * DOWNLOAD
 * -------------------------------------------------------
 */

async function downloadSelected() {
  const selected = mediaItems.filter(
    (item) => item.selected,
  );

  if (!selected.length) {
    return;
  }

  downloadButton.disabled = true;

  downloadButton.classList.remove(
    "complete",
  );

  downloadButton.style.setProperty(
    "--progress",
    "0%",
  );

  downloadButtonText.textContent =
    `Downloading… 0 / ${selected.length}`;

  downloadStatus.textContent = "";

  let completed = 0;

  for (
    let i = 0;
    i < selected.length;
    i++
  ) {
    const item = selected[i];

    const extension =
      item.type === "video"
        ? "mp4"
        : getExtension(item.url);

    /*
     * Preserve original media position
     * rather than renumbering the selected subset.
     */

    const number = String(
      item.index + 1,
    ).padStart(2, "0");

    const filename =
      "MediaCollector/" +
      `${sourceInfo.username}_` +
      `${number}.${extension}`;

    try {
      await chrome.downloads.download({
        url: item.url,
        filename,
        conflictAction: "uniquify",
        saveAs: false,
      });

      completed++;

      const progress = Math.round(
        (completed / selected.length) *
          100,
      );

      downloadButton.style.setProperty(
        "--progress",
        `${progress}%`,
      );

      downloadButtonText.textContent =
        `Downloading… ${completed} / ${selected.length}`;

      await sleep(150);
    } catch (error) {
      console.error(
        "Download failed:",
        item.url,
        error,
      );
    }
  }

  if (completed === selected.length) {
    downloadButton.style.setProperty(
      "--progress",
      "100%",
    );

    downloadButton.classList.add(
      "complete",
    );

    downloadButtonText.textContent =
      "✓ Download complete";

    downloadStatus.textContent =
      `${completed} files sent to Downloads`;
  } else {
    downloadButtonText.textContent =
      "Download incomplete";

    downloadStatus.textContent =
      `${completed} / ${selected.length} files sent to Downloads`;
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
    const pathname =
      new URL(url).pathname;

    const match =
      pathname.match(
        /\.([a-zA-Z0-9]+)$/,
      );

    if (match) {
      const ext =
        match[1].toLowerCase();

      if (
        [
          "jpg",
          "jpeg",
          "png",
          "webp",
        ].includes(ext)
      ) {
        return ext === "jpeg"
          ? "jpg"
          : ext;
      }
    }
  } catch {
    // Ignore.
  }

  return "jpg";
}

function sanitizeFilename(value) {
  return value
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    )
    .replace(/_+/g, "_");
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
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