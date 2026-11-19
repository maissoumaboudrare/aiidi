
async function scanInstagramProfile() {
  const imiximikPause = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const parts = window.location.pathname
    .split("/")
    .filter(Boolean);

  const reserved = new Set([
    "p", "reel", "reels", "explore",
    "direct", "accounts", "stories",
    "about", "developer"
  ]);

  if (
    parts.length !== 1 ||
    reserved.has(parts[0].toLowerCase())
  ) {
    return {
      success: false,
      error: "Open an Instagram profile first."
    };
  }

  const username = parts[0];
  const posts = new Map();

  let unchangedCycles = 0;
  let previousCount = 0;
  let reachedBottom = false;

  const maxCycles = 500;
  const maxUnchangedCycles = 8;

  function collectPosts() {
    const links = document.querySelectorAll(
      'a[href*="/p/"], a[href*="/reel/"]'
    );

    for (const link of links) {
      try {
        const url = new URL(link.href);

        if (
          url.hostname !== "instagram.com" &&
          url.hostname !== "www.instagram.com"
        ) {
          continue;
        }

        const match = url.pathname.match(
          /^\/(?:([A-Za-z0-9._]+)\/)?(p|reel)\/([A-Za-z0-9_-]+)\/?$/
        );

        if (!match) continue;

        const linkUsername = match[1];
        const type = match[2];
        const shortcode = match[3];

        // Ignore links explicitly belonging to other accounts.
        if (
          linkUsername &&
          linkUsername.toLowerCase() !== username.toLowerCase()
        ) {
          continue;
        }

        const canonical =
          `https://www.instagram.com/${type}/${shortcode}/`;

        if (!posts.has(canonical)) {
          posts.set(canonical, {
            url: canonical,
            type,
            index: posts.size
          });
        }
      } catch (error) {
        console.warn("Invalid Instagram link:", error);
      }
    }
  }

  collectPosts();

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    window.scrollBy({
      top: Math.max(window.innerHeight * 0.85, 500),
      behavior: "instant"
    });

    await imiximikPause(900);

    collectPosts();

    const currentCount = posts.size;

    if (currentCount === previousCount) {
      unchangedCycles++;
    } else {
      unchangedCycles = 0;
    }

    previousCount = currentCount;

    reachedBottom =
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - 100;

    if (
      reachedBottom &&
      unchangedCycles >= maxUnchangedCycles
    ) {
      break;
    }
  }

  return {
    success: true,
    username,
    total: posts.size,
    posts: [...posts.values()],
    reachedBottom,
    complete: reachedBottom && unchangedCycles >= maxUnchangedCycles
  };
}
