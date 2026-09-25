function getAdapterForUrl(url) {
  try {
    const hostname = new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    if (
      hostname === "instagram.com" ||
      hostname.endsWith(".instagram.com")
    ) {
      return {
        id: "instagram",
        name: "Instagram",
        scan: scanInstagramPost,
      };
    }

    return null;
  } catch {
    return null;
  }
}