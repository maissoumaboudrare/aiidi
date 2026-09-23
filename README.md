# AIIDI

> A lightweight media collector for Instagram.

AIIDI is a small browser extension designed to detect, collect and download media from Instagram profiles.

The project focuses on keeping the workflow simple: browse Instagram, collect the available media, select what you want, and download cleanly processed files.

## Current Version

**v0.5.0**

V05 establishes the first stable media collection workflow.

### Current capabilities

- Detect media from Instagram content
- Collect images from a profile
- Display collected media in the extension popup
- Select individual or multiple media files
- Download selected files
- Preserve the correct media order
- Generate consistent filenames
- Process images with a maximum width of 1080 px
- Handle multiple downloads in a single operation

## Project Structure

```text
media-collector/
├── content.js
├── manifest.json
├── popup.html
├── popup.js
├── .gitignore
└── README.md