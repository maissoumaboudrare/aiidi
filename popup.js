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

// --------------------------------------------------
// SCAN
// --------------------------------------------------

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

    if (!tab?.url) {
      throw new Error("Unable to read the current tab URL.");
    }

    const adapter = getAdapterForUrl(tab.url);

    if (!adapter) {
      statusElement.textContent = "Unsupported site";
      return;
    }

    statusElement.textContent = `Scanning ${adapter.name}…`;

    const results = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
      },

      func: adapter.scan,
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
    countLabel.textContent = "media detected";
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

    // Keep original post/carousel position while filtering.
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
