import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    /** where the piece first appeared; the site republishes it with credit and a canonical link back */
    originalUrl: z.string().url().optional(),
    originalSite: z.string().optional(),
    draft: z.boolean().default(false),
    /** when the post last changed meaningfully; defaults to pubDate */
    updatedDate: z.coerce.date().optional(),
    /** Yakku on this post's share image: his pose and what he says */
    og: z
      .object({
        pose: z.enum(["idle", "walk", "wave", "sit", "read", "celebrate", "sleep"]).default("wave"),
        quip: z.string(),
      })
      .optional(),
  }),
});

export const collections = { blog };
