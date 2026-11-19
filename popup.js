
const scanButton = document.querySelector("#scanButton");
const scanProfileButton = document.querySelector("#scanProfileButton");
const profileScanStatus = document.querySelector("#profileScanStatus");

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
let discoveredProfile = null;
let activeProfileJobId = null;
let profileTabId = null;
let refreshTimer = null;
let lastJobSignature = "";
let lastJobStatus = "";
let currentView = "profile";

// --------------------------------------------------
// EVENTS
// --------------------------------------------------

scanButton.addEventListener("click", scanPost);
scanProfileButton.addEventListener("click", scanProfile);
downloadButton.addEventListener("click", downloadSelected);

selectAll.addEventListener("change", () => {
  const visibleMedia = getVisibleMedia();

  visibleMedia.forEach((item) => {
    item.selected = selectAll.checked;
  });

  renderMedia();
  void persistSelection();
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

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

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

function resetMediaUI() {
  mediaItems = [];
  sourceInfo = null;

  countElement.textContent = "0";
  countLabel.textContent = "media detected";

  galleryElement.innerHTML = "";
  controlsElement.style.display = "none";
  mediaFilter.style.display = "none";
  downloadArea.style.display = "none";

  resetDownloadUI();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id || !tab?.url) {
    throw new Error("Unable to access the current tab.");
  }

  return tab;
}

// --------------------------------------------------
// SCAN POST
// --------------------------------------------------

async function scanPost() {
  const activeJob = await getJob();
  if (activeJob && ["running", "discovering", "starting", "cancel_requested"].includes(activeJob.status) &&
      Date.now() - activeJob.updatedAt < 30000) {
    statusElement.textContent = "Stop the profile scan before scanning one post";
    return;
  }
  currentView = "post";
  activeProfileJobId = null;
  lastJobSignature = "";
  scanButton.disabled = true;
  scanProfileButton.disabled = true;

  statusElement.textContent = "Scanning post…";

  resetMediaUI();

  profileScanStatus.style.display = "none";

  try {
    const tab = await getActiveTab();

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
      index: item.index ?? index,
      selected: true,
    }));

    currentFilter = "both";

    filterButtons.forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.filter === "both",
      );
    });

    const missing = result.diagnostics?.unresolvedSlides || [];
    statusElement.textContent = missing.length ? "Scan partially complete" : "Scan complete";
    if (missing.length) {
      profileScanStatus.style.display = "block";
      profileScanStatus.textContent = missing.map(item => `Slide ${item.step}: ${item.reason}`).join("; ");
    }

    mediaFilter.style.display = mediaItems.length ? "grid" : "none";
    controlsElement.style.display = mediaItems.length ? "flex" : "none";
    downloadArea.style.display = mediaItems.length ? "block" : "none";

    selectAll.checked = true;

    renderMedia();
  } catch (error) {
    console.error("Post scan failed:", error);
    statusElement.textContent = "Scan failed";
  } finally {
    scanButton.disabled = false;
    scanProfileButton.disabled = false;
  }
}

// --------------------------------------------------
// FULL PROFILE — tab-based worker with persisted progress
// --------------------------------------------------
const JOB_KEY = "aiidiProfileJob";
const selectionKey = id => `aiidiSelections_${id}`;
const terminal = new Set(["complete", "failed", "paused"]);

async function getJob() {
  return (await chrome.storage.local.get(JOB_KEY))[JOB_KEY] || null;
}

async function startRunner(tab) {
  // A file-injected runner continues in the Instagram tab after the popup closes.
  // Each function runs in the same isolated world and can call the others.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      "adapters/instagram-profile.js",
      "adapters/instagram.js",
      "adapters/instagram-batch.js",
      "adapters/profile-runner.js"
    ]
  });
}

async function scanProfile() {
  currentView = "profile";
  try {
    const tab = await getActiveTab();
    const adapter = getAdapterForUrl(tab.url);
    const path = new URL(tab.url).pathname.split("/").filter(Boolean);
    if (!adapter || path.length !== 1 ||
        ["p", "reel", "reels", "explore", "accounts", "direct", "stories"].includes(path[0].toLowerCase())) {
      statusElement.textContent = "Open an Instagram profile first";
      return;
    }
    const existing = await getJob();
    if (existing && existing.tabId === tab.id &&
        ["running", "discovering", "starting", "cancel_requested"].includes(existing.status) &&
        Date.now() - existing.updatedAt < 30000) {
      statusElement.textContent = "A profile scan is already running";
      return;
    }
    // Resume only if the same profile and there are saved posts remaining.
    const resume = existing && existing.username?.toLowerCase() === path[0].toLowerCase() &&
      existing.tabId === tab.id && existing.posts?.length &&
      existing.nextIndex < existing.posts.length && existing.status !== "complete";
    const job = resume ? {
      ...existing, status: "starting", updatedAt: Date.now(), fatalError: null
    } : {
      id: `${Date.now()}_${tab.id}`, tabId: tab.id, username: path[0],
      status: "starting", posts: [], total: 0, nextIndex: 0,
      currentIndex: 0, media: [], errors: [], updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [JOB_KEY]: job });
    activeProfileJobId = job.id;
    profileTabId = tab.id;
    resetMediaUI();
    profileScanStatus.style.display = "block";
    statusElement.textContent = resume ? "Resuming profile scan…" : "Scanning full profile…";
    await startRunner(tab);
    await refreshProfileJob();
  } catch (error) {
    console.error("Profile scan failed:", error);
    statusElement.textContent = "Profile scan could not start";
    profileScanStatus.style.display = "block";
    profileScanStatus.textContent = String(error.message || error);
  }
}

async function stopProfileScan() {
  const job = await getJob();
  if (!job || !["running", "discovering", "starting"].includes(job.status)) return;
  job.status = "cancel_requested";
  await chrome.storage.local.set({ [JOB_KEY]: job });
  statusElement.textContent = "Stopping after current publication…";
}

async function refreshProfileJob() {
  if (currentView === "post") return;
  const job = await getJob();
  if (!job) return;
  let tab;
  try { tab = await getActiveTab(); } catch { return; }
  if (job.tabId !== tab.id) return;

  activeProfileJobId = job.id;
  profileTabId = job.tabId;
  profileScanStatus.style.display = "block";
  const running = ["running", "discovering", "starting", "cancel_requested"].includes(job.status);
  const stale = running && Date.now() - job.updatedAt > 30000;
  scanProfileButton.textContent = running && !stale ? "Scan running…" :
    (job.status !== "complete" && job.posts?.length ? "Resume Full Profile" : "Scan Full Profile");
  scanProfileButton.disabled = running && !stale;
  scanButton.disabled = running && !stale;
  if (typeof stopProfileButton !== "undefined" && stopProfileButton) {
    stopProfileButton.style.display = running && !stale ? "block" : "none";
  }
  const images = (job.media || []).filter(m => m.type === "image").length;
  const videos = (job.media || []).filter(m => m.type === "video").length;
  const progress = job.total ? Math.round((job.nextIndex || 0) / job.total * 100) : 0;
  const phase = stale ? "Interrupted — click Resume Full Profile" :
    ({ starting: "Starting", discovering: "Discovering publications", running: "Extracting",
       cancel_requested: "Stopping", paused: "Paused", complete: "Complete", failed: "Failed" }[job.status] || job.status);
  statusElement.textContent = `@${job.username} — ${phase}`;
  profileScanStatus.textContent =
    `${job.nextIndex || 0} / ${job.total || "?"} posts (${progress}%) · ${images} images · ${videos} videos · ${(job.errors || []).length} errors` +
    (job.completeDiscovery === false ? " · Discovery may be incomplete" : "") +
    (job.fatalError ? ` · ${job.fatalError}` : "") +
    (job.errors?.length && terminal.has(job.status) ?
      ` · Errors: ${job.errors.map(error => `${error.url || `Post ${error.postIndex + 1}`}: ${error.message}`).join(" | ")}` : "");
  const signature = `${job.id}:${job.media?.length || 0}:${job.status}`;
  if (signature !== lastJobSignature) {
    const previous = mediaItems;
    const selections = (await chrome.storage.local.get(selectionKey(job.id)))[selectionKey(job.id)] || {};
    mediaItems = (job.media || []).map(item => ({
      ...item, selected: selections[`${item.postIndex}:${item.index}`] ??
        previous.find(m => m.postIndex === item.postIndex && m.index === item.index)?.selected ?? true
    }));
    sourceInfo = { username: sanitizeFilename(job.username), batch: true };
    mediaFilter.style.display = mediaItems.length ? "grid" : "none";
    controlsElement.style.display = mediaItems.length ? "flex" : "none";
    downloadArea.style.display = mediaItems.length ? "block" : "none";
    renderMedia();
    lastJobSignature = signature;
  }
}

async function persistSelection() {
  if (!activeProfileJobId || !sourceInfo?.batch) return;
  const selected = {};
  for (const item of mediaItems) selected[`${item.postIndex}:${item.index}`] = item.selected;
  await chrome.storage.local.set({ [selectionKey(activeProfileJobId)]: selected });
}

const stopProfileButton = document.querySelector("#stopProfileButton");
stopProfileButton?.addEventListener("click", stopProfileScan);
refreshTimer = setInterval(() => void refreshProfileJob().catch(console.error), 1200);
void refreshProfileJob().catch(console.error);

// --------------------------------------------------
// GALLERY
// --------------------------------------------------

function renderMedia() {
  galleryElement.innerHTML = "";

  const visibleMedia = getVisibleMedia();

  countElement.textContent = visibleMedia.length;

  if (currentFilter === "image") {
    countLabel.textContent =
      visibleMedia.length === 1
        ? "image detected"
        : "images detected";
  } else if (currentFilter === "video") {
    countLabel.textContent =
      visibleMedia.length === 1
        ? "video detected"
        : "videos detected";
  } else {
    countLabel.textContent = "media detected";
  }

  visibleMedia.forEach((item) => {
    const container = document.createElement("div");

    container.className = item.selected
      ? "media selected"
      : "media";

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

    // Preserve original carousel position.
    number.textContent = item.index + 1;

    container.appendChild(image);
    container.appendChild(check);
    container.appendChild(number);

    if (item.type === "video") {
      const badge = document.createElement("div");

      badge.className = "video-badge";

      badge.textContent = item.quality
        ? `VIDEO · ${item.quality}`
        : "VIDEO";

      container.appendChild(badge);
    }

    container.addEventListener("click", () => {
      item.selected = !item.selected;
      renderMedia();
      void persistSelection();
    });

    galleryElement.appendChild(container);
  });

  updateSelectionUI();
}

function updateSelectionUI() {
  const visibleMedia = getVisibleMedia();

  const selectedVisible = visibleMedia.filter(
    (item) => item.selected,
  );

  selectedCount.textContent =
    `${selectedVisible.length} selected`;

  selectAll.checked =
    visibleMedia.length > 0 &&
    selectedVisible.length === visibleMedia.length;

  selectAll.disabled = visibleMedia.length === 0;

  downloadButton.disabled = selectedVisible.length === 0;
}

// --------------------------------------------------
// DOWNLOAD
// --------------------------------------------------

async function downloadSelected() {
  const selected = getVisibleMedia().filter(
    (item) => item.selected,
  );

  if (!selected.length || !sourceInfo) {
    return;
  }

  downloadButton.disabled = true;

  downloadButton.classList.remove("complete");
  downloadButton.style.setProperty("--progress", "0%");

  downloadButtonText.textContent =
    `Downloading… 0 / ${selected.length}`;

  downloadStatus.textContent = "";

  let completed = 0;

  for (const item of selected) {
    const extension =
      item.type === "video"
        ? "mp4"
        : getExtension(item.url);

    const number = String(item.index + 1).padStart(2, "0");

    const filename =
      "MediaCollector/" +
      `${sourceInfo.username}/` +
      `${item.shortcode || new URL(sourceInfo.postUrl).pathname.split("/").filter(Boolean).pop()}_${number}.${extension}`;

    try {
      await chrome.downloads.download({
        url: item.url,
        filename,
        conflictAction: "uniquify",
        saveAs: false,
      });

      completed++;

      const progress = Math.round(
        (completed / selected.length) * 100,
      );

      downloadButton.style.setProperty(
        "--progress",
        `${progress}%`,
      );

      downloadButtonText.textContent =
        `Downloading… ${completed} / ${selected.length}`;

      await imiximikPause(150);
    } catch (error) {
      console.error("Download failed:", item.url, error);
    }
  }

  if (completed === selected.length) {
    downloadButton.style.setProperty("--progress", "100%");
    downloadButton.classList.add("complete");

    downloadButtonText.textContent = "✓ Downloads queued";

    downloadStatus.textContent =
      `${completed} files queued in Downloads`;
  } else {
    downloadButtonText.textContent = "Download incomplete";

    downloadStatus.textContent =
      `${completed} / ${selected.length} files queued in Downloads`;
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
  return value
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function imiximikPause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
