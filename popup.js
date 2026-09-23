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

        const collected = new Map();

        /*
         * Try to determine the Instagram
         * username from the opened post.
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

        /*
         * Find the URL of the opened post.
         */

        let postUrl = window.location.href;

        const postLink = [...dialog.querySelectorAll("a")].find(
          (link) => link.href.includes("/p/") || link.href.includes("/reel/"),
        );

        if (postLink) {
          postUrl = postLink.href;
        }

        function collectImages() {
          const images = [...dialog.querySelectorAll("img")];

          for (const img of images) {
            const url = img.currentSrc || img.src;

            if (!url) {
              continue;
            }

            if (img.naturalWidth < 300 || img.naturalHeight < 300) {
              continue;
            }

            const alt = (img.alt || "").toLowerCase();

            if (alt.includes("profile picture")) {
              continue;
            }

            collected.set(url, {
              type: "image",
              url,
              width: img.naturalWidth,
              height: img.naturalHeight,
              alt: img.alt || "",
            });
          }
        }

        /*
         * Walk through the carousel.
         */

        for (let step = 0; step < 25; step++) {
          collectImages();

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

          await sleep(700);
        }

        collectImages();

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

    controlsElement.style.display = "flex";

    downloadArea.style.display = "block";

    selectAll.checked = true;

    renderMedia();
  } catch (error) {
    console.error(error);

    statusElement.textContent = "Scan failed";
  } finally {
    scanButton.disabled = false;
  }
}

function renderMedia() {
  galleryElement.innerHTML = "";

  mediaItems.forEach((item, index) => {
    const container = document.createElement("div");

    container.className = item.selected ? "media selected" : "media";

    const image = document.createElement("img");

    image.src = item.url;

    image.title = `${item.width} × ${item.height}`;

    const check = document.createElement("div");

    check.className = "check";

    check.textContent = "✓";

    const number = document.createElement("div");

    number.className = "media-number";

    number.textContent = index + 1;

    container.appendChild(image);

    container.appendChild(check);

    container.appendChild(number);

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

    const extension = getExtension(item.url);

    const number = String(i + 1).padStart(2, "0");

    const filename =
      `MediaCollector/` + `${sourceInfo.username}_` + `${number}.${extension}`;

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

  /*
   * Final success state
   */

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
