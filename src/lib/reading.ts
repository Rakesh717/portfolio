/** How long a post is to read. */
export function trailStats(body = "") {
  // prose only: drop the MDX imports and component tags before counting
  const prose = body.replace(/^import .*$/gm, "").replace(/<[^>]+>/g, " ").replace(/```[\s\S]*?```/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return { words, minutes };
}
