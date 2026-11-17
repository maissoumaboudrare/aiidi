// Injected in the Instagram tab, independent of the popup lifetime.
// A tab reload/navigation stops the runner; the popup offers Resume.
(() => {
  if (globalThis.__aiidiProfileRunnerActive) return;
  globalThis.__aiidiProfileRunnerActive = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = 'aiidiProfileJob';
  const read = async () => (await chrome.storage.local.get(key))[key];
  const write = async job => chrome.storage.local.set({ [key]: job });
  const timeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ]);
  const run = async () => {
    let job = await read();
    if (!job || job.status !== 'starting') {
      globalThis.__aiidiProfileRunnerActive = false;
      return;
    }
    const heartbeat = setInterval(async () => {
      try {
        const current = await read();
        if (current?.id === job.id && ["discovering", "starting"].includes(current.status)) {
          current.updatedAt = Date.now();
          await write(current);
        }
      } catch (error) { console.warn("AIIDI heartbeat failed", error); }
    }, 5000);
    try {
      if (!job.posts?.length) {
        job.status = 'discovering';
        job.updatedAt = Date.now();
        await write(job);
        const result = await scanInstagramProfile();
        if (!result.success) throw new Error(result.error || 'Profile discovery failed');
        job.posts = result.posts;
        job.username = result.username;
        job.total = result.posts.length;
        job.nextIndex = 0;
        job.media = [];
        job.errors = [];
        job.completeDiscovery = result.complete;
      }
      job.status = 'running';
      job.updatedAt = Date.now();
      await write(job);
      for (let i = job.nextIndex || 0; i < job.posts.length; i++) {
        const latest = await read();
        if (!latest || latest.id !== job.id) return;
        if (latest.status === 'cancel_requested') {
          job.status = 'paused';
          job.updatedAt = Date.now();
          await write(job);
          return;
        }
        job.currentIndex = i + 1;
        job.updatedAt = Date.now();
        await write(job);
        const post = job.posts[i];
        const shortcode = post.url.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1];
        let opened = false;
        let stop = false;
        try {
          if (!shortcode) throw new Error('Invalid post URL');
          const result = await timeout(openInstagramProfilePost(shortcode), 180000, 'Open post');
          if (!result.success) throw new Error(result.error || 'Open post failed');
          opened = true;
          // Give media resources time to populate before collecting.
          await sleep(900);
          const scanned = await timeout(scanInstagramPost(job.username), 90000, 'Scan post');
          if (!scanned.success) throw new Error(scanned.error || 'Scan failed');
          if (!scanned.media?.length && !scanned.diagnostics?.unresolvedSlides?.length) throw new Error('No media found (no scanner diagnostic)');
          for (const missing of scanned.diagnostics?.unresolvedSlides || []) {
            job.errors.push({ postIndex: i, url: post.url,
              message: `Slide ${missing.step}: ${missing.reason}` });
          }
          (scanned.media || []).forEach((item, index) => job.media.push({
            ...item, index: item.index ?? index, postIndex: i, shortcode, selected: true
          }));
        } catch (error) {
          job.errors.push({ postIndex: i, url: post.url, message: String(error.message || error) });
        } finally {
          if (opened || document.querySelector('div[role="dialog"]')) {
            try {
              const closed = await timeout(closeInstagramProfilePost(), 6000, 'Close post');
              if (!closed) throw new Error('Dialog remains open');
            } catch (error) {
              job.errors.push({ postIndex: i, url: post.url, message: 'Unable to close dialog; scan paused' });
              stop = true;
            }
          }
        }
        job.nextIndex = i + 1;
        job.updatedAt = Date.now();
        job.status = stop ? 'paused' : 'running';
        await write(job);
        if (stop) return;
        await sleep(250);
      }
      job.status = 'complete';
      job.updatedAt = Date.now();
      await write(job);
    } catch (error) {
      job.status = 'failed';
      job.fatalError = String(error.message || error);
      job.updatedAt = Date.now();
      await write(job);
    } finally {
      clearInterval(heartbeat);
      globalThis.__aiidiProfileRunnerActive = false;
    }
  };
  void run();
})();
