/**
 * Single source of truth for all site copy.
 * When copy changes, update this file so the site renders it.
 */

export const site = {
  name: "Rakesh Thapa",
  title: "AI Native Product Engineer",
  location: "Kathmandu, Nepal",
  email: "hello@rakeshthapa.dev",
  role: "CTO at Binary Digits",
  description:
    "AI Native Product Engineer building thoughtful, reliable products. Nepal based product engineer with seven years of experience, from backend APIs to polished interfaces.",
} as const;

export const links = [
  { label: "GitHub", href: "https://github.com/rakesh717", icon: "github" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/rakesh717", icon: "linkedin" },
  { label: "X", href: "https://x.com/rakeshthapa717", icon: "x" },
  { label: "Email", href: "mailto:hello@rakeshthapa.dev", icon: "mail" },
] as const;

export const hero = {
  headlineStart: "AI Native Product Engineer",
  headlineEmphasis: ["thoughtful", "reliable"],
  headlineEnd: "products.",
  intro: [
    "I'm Rakesh, a Nepal based product engineer with over seven years of experience. I build web products end to end, from backend APIs to polished interfaces, with TypeScript (React, Hono), PHP (Laravel), Postgres and Tailwind CSS, and I use AI as a daily part of how I design, build and ship.",
    "Currently CTO at Binary Digits, leading a six person engineering team. Before that I helped build mltiple products across SaaS, Fintech and E-commerce.",
  ],
} as const;

export const stack = [
  "TypeScript",
  "React",
  "Hono",
  "Laravel",
  "Postgres",
  "Tailwind CSS",
] as const;

export type Camp = {
  company: string;
  role: string;
  period: string;
  url: string;
  camp: string;
  altitude: string;
  description: string;
};

export const experience: Camp[] = [
  {
    company: "Binary Digits",
    role: "CTO",
    period: "2025 – Present",
    url: "https://bdpl.com.np",
    camp: "High Camp",
    altitude: "6,100 m",
    description:
      "Leading a six person engineering team building custom software and AI products for clients in fintech, healthcare and government. Took releases from weekly to daily by rebuilding the CI/CD pipeline, cut project kickoffs from weeks to days with shared architecture standards, and kept 90% of clients coming back across 20+ shipped projects.",
  },
  {
    company: "Artifact Analyst",
    role: "Full-Stack Engineer",
    period: "2024 – 2025",
    url: "https://artifactanalyst.com",
    camp: "Camp III",
    altitude: "5,300 m",
    description:
      "Built most of an AI equity research platform that helps funds and analysts research stocks in minutes instead of hours. Turned thousands of SEC filings into searchable data with interactive charts and AI answers that always cite their sources, with data pages loading in under a second.",
  },
  {
    company: "Feedbucket",
    role: "Full-Stack Engineer",
    period: "2022 – 2024",
    url: "https://feedbucket.app",
    camp: "Camp II",
    altitude: "4,100 m",
    description:
      "Improved the feedback widget and built a dozen two-way integrations (Jira, Asana, Trello, Linear and more) for a SaaS trusted by 500+ web design agencies. Teams could resolve client feedback without ever leaving their project tool, and integrations became the top reason customers chose Feedbucket over competitors.",
  },
  {
    company: "Kotuko × Zenlab",
    role: "Full-Stack Engineer",
    period: "2019 – 2022",
    url: "https://kotuko.it",
    camp: "Camp I",
    altitude: "3,200 m",
    description:
      "Started my career building backend APIs and back office tools for enterprise clients in Italy (pharma, healthcare, retail and radio) as part of a distributed team between Milan and Kathmandu. Shipped 10+ production apps serving hundreds of thousands of end users.",
  },
];

export const testimonials = [
  {
    quote:
      "Rakesh is a really fast learner. He got up to speed with my project quickly and understood the requirements right away. A very good communicator as well.",
    name: "Marcus Gullberg",
    role: "Founder, Feedbucket & cousab (cousab.se)",
  },
  {
    quote:
      "Rakesh is a fast and efficient developer who writes clean code, continuously polishes his work, and leverages AI effectively to improve quality and productivity.",
    name: "Antoine Vulcain",
    role: "CTO @ Artifact Analyst · Founder, Financial Modeling Prep",
  },
  {
    quote:
      "He always makes things right. The code quality is very good — he keeps the code tidy and easy to maintain. Great English, always on schedule.",
    name: "Mickeel Pramono",
    role: "Founder, Lezenda",
  },
  {
    quote:
      "Rakesh is a clear communicator and an effective programmer who executes fast and contributes his own ideas. Everything he shipped just worked — highly recommend!",
    name: "Lino Grubben",
    role: "Designer & Entrepreneur",
  },
];

export const contact = {
  heading: "Let's build something thoughtful.",
  subcopy: "The fastest way to reach me is email. I read everything myself.",
  email: "Email me",
  linkedin: "Connect on LinkedIn",
  linkedinHref: "https://www.linkedin.com/in/rakesh717",
};

/* --------------------------------------------------------------- */
/* The trek — every stop on the trail, left to right                */
/* --------------------------------------------------------------- */

export type Biome = "forest" | "meadow" | "rock" | "snow";
export type Pose = "idle" | "wave" | "sit" | "read" | "celebrate" | "sleep";

export type Stop = {
  id: string;
  name: string;
  altitude: number;
  biome: Biome;
  pose: Pose;
  color: string;
};

export const stops: Stop[] = [
  { id: "basecamp", name: "Basecamp", altitude: 1400, biome: "forest", pose: "wave", color: "#EF476F" },
  { id: "trailhead", name: "Trailhead", altitude: 2100, biome: "forest", pose: "idle", color: "#FFD166" },
  { id: "climb", name: "Camp I", altitude: 3200, biome: "forest", pose: "idle", color: "#06D6A0" },
  { id: "camp-2", name: "Camp II", altitude: 4100, biome: "meadow", pose: "idle", color: "#4CC9F0" },
  { id: "camp-3", name: "Camp III", altitude: 5300, biome: "rock", pose: "idle", color: "#FFD166" },
  { id: "camp-4", name: "High Camp", altitude: 6100, biome: "snow", pose: "idle", color: "#EF476F" },
  { id: "hikers", name: "Fireside", altitude: 6500, biome: "snow", pose: "sit", color: "#E85D2F" },
  { id: "notes", name: "Field Notes", altitude: 7300, biome: "snow", pose: "read", color: "#4CC9F0" },
  { id: "summit", name: "Summit", altitude: 8848, biome: "snow", pose: "celebrate", color: "#EF476F" },
  { id: "night", name: "Night camp", altitude: 8200, biome: "snow", pose: "sleep", color: "#06D6A0" },
];

/** Things Yakku says when he arrives at a stop */
export const quips: Record<string, string[]> = {
  basecamp: ["Namaste! I'm Yakku. Scroll and I'll walk.", "Snacks packed. Boots on. Let's go!"],
  trailhead: ["Read the board. There's a quiz later.", "Packing list checks out."],
  climb: ["Camp I. Where it all started.", "Milan to Kathmandu. Long commute."],
  "camp-2": ["A dozen integrations. My hooves hurt.", "Two-way syncs, two-way trails."],
  "camp-3": ["Thin air, thick SEC filings.", "Every answer cites its source. Even mine."],
  "camp-4": ["High Camp. He lives here now.", "Daily deploys at 6,100 m. Show-off."],
  hikers: ["Pull up a log. Read the register.", "Kind words keep the fire going."],
  notes: ["Snack break. Field notes!", "I can't read. I just like the pictures."],
  summit: ["WE MADE IT! Send him a note!", "8,848 m. He replies within a day."],
  night: ["zzz… dreaming of grass…", "Wake me if you send an email."],
};

/**
 * What Yakku says on the guided tour, stop by stop, in order. On phones,
 * stops wider than the screen are read a page at a time and these lines
 * are spread across the pages (except Field Notes: one stop, halfway along).
 */
export const tour: Record<string, string[]> = {
  basecamp: ["Namaste! I'm Yakku. I'll walk you up Rakesh's mountain.", "He builds AI native products, from Kathmandu. Let's climb!"],
  trailhead: ["The trailhead board: who he is and how he works.", "TypeScript, React, Hono, Laravel, Postgres. And AI, every day."],
  climb: ["Camp I, 2019. Backend APIs for enterprise clients in Italy.", "One team, split between Milan and Kathmandu. 10+ apps shipped."],
  "camp-2": ["Camp II: Feedbucket, a feedback tool for 500+ web agencies.", "He built a dozen two-way integrations. Jira, Asana, Linear…"],
  "camp-3": ["Camp III: an AI equity research platform.", "Thousands of SEC filings. Every AI answer cites its source."],
  "camp-4": ["High Camp: CTO at Binary Digits since 2025.", "Six engineers, daily releases, 20+ projects shipped."],
  hikers: ["The trail register. People he's worked with left notes.", "They shuffle on their own. Take your time."],
  notes: ["Field notes: things he's written along the way.", "Tap any note to read the whole thing."],
  summit: ["8,848 m. The summit!", "Want to build something together? His email's right here."],
  night: ["That's the whole trek. Thanks for walking with me.", "zzz…"],
};

/** Random chatter when you poke the yak */
export const pokes = [
  "Mehhh-velous!",
  "Fun fact: yaks can't read code. Rakesh reads all of it.",
  "I was told there would be grass.",
  "Altitude? I'm built for it.",
  "Every yak needs a CI/CD pipeline.",
  "Boop registered. Deploying good vibes.",
  "Careful, I shed on production.",
  "Hooves off the merchandise.",
];
