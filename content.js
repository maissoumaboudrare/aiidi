function collectImages() {
  const images = [...document.images];

  const urls = images
    .map(img => img.currentSrc || img.src)
    .filter(Boolean);

  return [...new Set(urls)];
}