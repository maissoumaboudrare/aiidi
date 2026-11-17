// Runs inside the Instagram profile tab. Open one grid publication as a dialog.
async function openInstagramProfilePost(shortcode) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`/(?:p|reel)/${escapeRe(shortcode)}/?(?:\\?|$)`);
  window.scrollTo({ top: 0, behavior: "instant" });
  await sleep(350);
  let anchor = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    anchor = [...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')]
      .find(a => pattern.test(a.getAttribute("href") || ""));
    if (anchor) break;
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: "instant" });
    await sleep(300);
  }
  if (!anchor) return { success: false, error: "Publication not found in the visible grid" };
  anchor.scrollIntoView({ block: "center", behavior: "instant" });
  await sleep(250);
  anchor.click();
  for (let attempt = 0; attempt < 24; attempt++) {
    await sleep(250);
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog && (window.location.href.includes(shortcode) ||
      [...dialog.querySelectorAll('a[href]')].some(a => a.href.includes(shortcode)))) {
      return { success: true };
    }
  }
  return { success: false, error: "Instagram did not open the expected post dialog" };
}

async function closeInstagramProfilePost() {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  if (!document.querySelector('div[role="dialog"]')) return true;
  document.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true
  }));
  await sleep(400);
  if (document.querySelector('div[role="dialog"]')) {
    const close = [...document.querySelectorAll('div[role="dialog"] button')]
      .find(b => /close|fermer/i.test(b.getAttribute("aria-label") || ""));
    close?.click();
  }
  await sleep(350);
  return !document.querySelector('div[role="dialog"]');
}
