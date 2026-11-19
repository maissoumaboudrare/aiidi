# AIIDI — Media Collector

Collect images and videos from Instagram, choose which media to keep, and download them into folders organized by profile.

**Validated version — [v0.12.3](https://github.com/maissoumaboudrare/aiidi/tree/v0.12.3).**

AIIDI is a Chromium Manifest V3 extension for desktop computers. It appears in your browser as **Media Collector**. Its interface uses English button labels, reproduced throughout this guide.

**Video audio** — Audio retrieval is not supported in v0.12.3. Downloaded videos may have no sound. AIIDI keeps the video file supplied by Instagram without retrieving or merging a separate audio track. If the source file already contains sound, it is preserved.

## Features

- **Scan Post** extracts media from a post opened from a profile.
- **Scan Full Profile** browses a profile grid and scans the posts it discovers, including links to reels present in that grid.
- **Mixed carousels** include images and videos, with their original positions preserved.
- **Profile verification** excludes posts whose identified author does not match the profile being scanned during a full-profile scan.
- **Preview gallery** displays thumbnails, media positions, and video badges. Videos are represented by a preview image.
- **Filters and selection** show images, videos, or both, and let you select files individually or as a group.
- **Full-profile progress** displays progress, image and video counts, and errors for each post.
- **Stop and resume** lets you request a stop after the current post and resume an incomplete scan in the same tab.
- **Manual downloads** save only the selected media in the current filter.
- **Automatic organization** saves files in `MediaCollector/nomduprofil/`, with the post code and media position in each filename.

## Install the extension

### Requirements

- A computer with a recent version of Google Chrome. The extension targets Chromium browsers. Compatibility with each other browser remains to be verified.
- An Internet connection and an Instagram session signed in through that browser.
- Access to the posts you want to collect.

The installation below uses the project files. You do not need VS Code, Node.js, or Git to use the extension.

### Install the validated version

1. [Download the v0.12.3 ZIP](https://github.com/maissoumaboudrare/aiidi/archive/refs/tags/v0.12.3.zip).
2. Extract the archive into a folder you will keep on your computer.
3. In Chrome, open `chrome://extensions`.
4. Enable **Developer mode** at the top of the page.
5. Click **Load unpacked**.
6. Select the extracted folder that directly contains `manifest.json`, rather than the ZIP file.
7. Check that **Media Collector**, version **0.12.3**, appears and is enabled.
8. Pin Media Collector from your browser's Extensions menu so its button is easy to find.
9. Open Instagram, sign in if necessary, and reload the page if it was already open before installation.

Keep the extension folder in its original location and leave Developer mode enabled. This procedure follows the [official Chrome guide to loading an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Use AIIDI

[Illustrated quick guide in French (PDF)](docs/aiidi-guide-rapide.pdf) for downloading media from a post or profile.

[English version (PDF)](docs/aiidi-quick-guide.pdf).

### Collect a single post

1. Open the relevant Instagram profile.
2. Click a post in its grid to open it in an overlay above the profile page.
3. Open Media Collector and click **Scan Post**.
4. Keep both the post and the extension popup open during the scan, then wait for the result.
5. Review the gallery, adjust your selection, and click **Download Selected**.

For a carousel, the extension returns to the beginning before going through the media. You do not need to move to its first image yourself.

In this version, **Scan Post expects a post opened in Instagram's overlay**. If you open a post URL directly and no overlay is present, return to the profile and open the post from its grid.

### Collect a profile

1. Open the profile page, such as `https://www.instagram.com/nomduprofil/`, and go to the top of its main grid.
2. Close any post open in an overlay.
3. Open Media Collector and click **Scan Full Profile**.
4. The extension scrolls through the profile to discover posts, then opens and scans them one at a time.
5. Wait for the scan to finish, review any errors, and choose which media to download.

The full-profile scan continues if you close the extension popup. Reopen Media Collector from the same Instagram tab to check its progress.

During the scan, keep that tab open and avoid navigating, scrolling, or switching posts manually. Run only one profile scan at a time.

**Scan Full Profile does not start downloads automatically.** Files are downloaded only after you click **Download Selected**.

### Stop and resume a full-profile scan

During extraction, **Stop after current post** requests a stop after the current post. Once the scan has stopped, **Resume Full Profile** lets you continue with the remaining posts.

To resume, return to the same profile page in the same tab, then open the extension. Full-profile progress and selections are saved locally. Resuming in a new tab or after closing the browser is not guaranteed.

Stopping is not immediate. During the initial discovery phase, wait for extraction to begin before requesting a stop.

### Filter and select

| Control | Action |
| --- | --- |
| **Both** | Show images and videos. |
| **Images** | Show images only. |
| **Videos** | Show videos only. |
| Click a thumbnail | Select or deselect that media item. |
| **Select all** | Select or deselect all media in the current filter. |
| **Download Selected** | Download selected media in the current filter. |

Media are selected by default. Switching filters preserves selections. With **Videos** active, images remain selected but will not be downloaded. Return to **Both** to download your entire selection.

## Find your downloads

Files are saved under the download folder configured in your browser, using this structure. In the examples, `nomduprofil` represents the profile's username.

```text
MediaCollector/
└── nomduprofil/
    ├── DXm0XJGCpt4_01.jpg
    ├── DXm0XJGCpt4_02.mp4
    └── DXm0XJGCpt4_06.jpg
```

The prefix is the post code. The number indicates the media item's position in the carousel, starting at `01`. If you select only part of a carousel, the original numbers are preserved.

Videos use the `.mp4` extension. Images use the extension detected in their URL, among JPG, PNG, and WebP, with JPG as the default. Files are downloaded from the collected URLs. This version does not resize images to 1080 pixels or convert them.

If a filename already exists, the browser creates a distinct name instead of replacing the existing file.

**Downloads queued** means the requests have been handed to the browser. Check its download manager for completion and any failures. Keep the extension popup open until all requests have been queued.

## Understand results and troubleshoot

A scan at **100%** means all discovered posts have been processed. Also check the error count, since this percentage does not guarantee that every media item was retrieved.

| Message or situation | What to do |
| --- | --- |
| **Open an Instagram profile first** | Open a profile page before starting a full-profile scan. |
| **No Instagram post is currently open** | Open a post from its profile grid, then retry Scan Post. |
| **Reload Media Collector…** | Reload the extension in `chrome://extensions`, then reload the Instagram page. |
| **No video identity received…** | Return to the profile, reopen the post, and retry the scan. |
| **Scan partially complete** or errors for individual posts | Note the URL and message, then retry that post with Scan Post. |
| **Discovery may be incomplete** | Loading the entire grid could not be confirmed. Check your connection and retry from the top of the profile. |
| **Interrupted** or **Paused** | Return to the same profile in the same tab and use Resume Full Profile if offered. |
| **Downloads queued**, but a file is missing | Check the browser's download manager. If the link no longer works, rescan the post to obtain a fresh link. |

Instagram may change its pages or how media are loaded. Collection depends on content accessible and loaded in your session. Stories, live streams, and other websites are outside the feature set of v0.12.3.

## Data and permissions

AIIDI uses your existing Instagram session. The extension does not ask for your Instagram password or send media to an AIIDI server.

Analysis runs in the browser. The extension reads post data loaded by Instagram to associate videos with the correct post and carousel item. Images and videos are downloaded from the servers hosting them.

| Permission | Purpose |
| --- | --- |
| `activeTab` and `scripting` | Run the scanning tools in the Instagram tab being used. |
| Access to `instagram.com` and `www.instagram.com` | Read data loaded by Instagram that are needed for extraction. |
| `storage` | Save full-profile progress, results, errors, and selections locally. |
| `downloads` | Save selected media through the browser's download manager. |

## Update the extension

1. Finish or stop the current scan.
2. Replace the files in your installation folder with those from the desired version.
3. In `chrome://extensions`, click **Reload** on the Media Collector card.
4. Reload any open Instagram pages before starting a new scan.

This local installation requires manual file updates.

## Help with testing

To report an issue or suggest an improvement, open an [issue on GitHub](https://github.com/maissoumaboudrare/aiidi/issues).

For a bug report, include the following information.

- The extension version, your browser, and your operating system.
- The mode used, either Scan Post or Scan Full Profile.
- Steps to reproduce the issue.
- The expected and actual results.
- The exact error message and the affected URL if it can be shared publicly.

You may attach a screenshot of the gallery or error. Do not post passwords, session cookies, or private content in an issue.

Version v0.12.3 passed **26 automated tests**. Scans and downloads were also manually validated by the project owner on the posts and profile used for testing. This does not constitute validation across all profiles or all Chromium browsers.

## For developers

No build step is required to load the extension. The main files are listed below.

```text
manifest.json                   Extension configuration
popup.html                      Interface
popup.js                        Gallery, selection, and downloads
adapters/instagram.js           Single-post extraction
adapters/instagram-network.js   Reading responses loaded by Instagram
adapters/instagram-profile.js   Profile post discovery
adapters/instagram-batch.js     Opening and closing posts
adapters/profile-runner.js      Full-profile execution and progress
adapters/router.js              Choosing the adapter for the website
tests/                          Automated tests
```

With a version of Node.js supporting `node:test`, run the tests from the project root.

```bash
node --test tests/*.test.cjs
```

The [`v0.12.3`](https://github.com/maissoumaboudrare/aiidi/tree/v0.12.3) tag identifies the validated version. The working branch is `feature/batch-media-extraction`.

## License and personal modifications

Copyright © 2026 Maïssoum Aboudrare — imiximik. The [personal use license](LICENSE.md) allows the purchaser to use and modify their copy for their own personal needs. Redistribution and resale of the Product or a modified version require the author's written permission, subject to mandatory legal rights. Delivery of the source code does not transfer intellectual property rights in the pre-existing code.

You may propose an improvement to the author without any obligation to share your modifications. Incorporation into a distributed version requires an explicit agreement.

## Maintenance and dependence on Instagram

The [maintenance and compatibility terms](MAINTENANCE.md) describe how the Product is maintained. While AIIDI is being sold, imiximik checks its operation at least once a month and seeks feasible fixes when an issue is identified.

Changes to Instagram may interrupt operation temporarily or permanently. A fix may prove impossible, potentially leading to the suspension or discontinuation of sales. Purchasers' applicable statutory warranties and remedies remain preserved. Read these terms and the license before purchasing.
