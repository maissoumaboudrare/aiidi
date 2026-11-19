// Functions executed in the Instagram tab's isolated world.
async function openInstagramProfilePost(shortcode) {
  const imiximikPause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`/(?:p|reel)/${escapeRe(shortcode)}/?(?:\\?|$)`);
  // A full-profile scan may have left the viewport at the bottom.
  window.scrollTo({ top: 0, behavior: 'instant' });
  await imiximikPause(350);
  let anchor = null;
  let stagnant = 0;
  let previousY = -1;
  for (let attempt = 0; attempt < 650; attempt++) {
    anchor = [...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')]
      .find(a => pattern.test(a.getAttribute('href') || ''));
    if (anchor) break;
    window.scrollBy({ top: Math.max(400, window.innerHeight * 0.7), behavior: 'instant' });
    await imiximikPause(220);
    if (window.scrollY === previousY) stagnant++;
    else stagnant = 0;
    previousY = window.scrollY;
    if (stagnant >= 12) break;
  }
  if (!anchor) return { success: false, error: 'Publication not found in profile grid' };
  anchor.scrollIntoView({ block: 'center', behavior: 'instant' });
  await imiximikPause(300);
  anchor.click();
  for (let attempt = 0; attempt < 36; attempt++) {
    await imiximikPause(250);
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog && (window.location.pathname.includes(shortcode) ||
      [...dialog.querySelectorAll('a[href]')].some(a => a.href.includes(shortcode)))) {
      return { success: true };
    }
  }
  return { success: false, error: 'Expected Instagram dialog did not open' };
}

async function closeInstagramProfilePost() {
  const imiximikPause = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (!document.querySelector('div[role="dialog"]')) return true;
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true
  }));
  await imiximikPause(450);
  if (document.querySelector('div[role="dialog"]')) {
    const close = [...document.querySelectorAll('div[role="dialog"] button')]
      .find(b => /close|fermer/i.test(b.getAttribute('aria-label') || ''));
    close?.click();
  }
  await imiximikPause(400);
  return !document.querySelector('div[role="dialog"]');
}
