import { getCollection } from "astro:content";

/** Published posts, newest first. */
export async function publishedPosts() {
  return (await getCollection("blog"))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
