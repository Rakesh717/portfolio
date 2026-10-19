# Site Content — Rakesh Thapa

All copy on the site in one place, for redesigns.

Live data source: `src/data/content.ts` (site) and `src/content/blog/*.md` (posts).
When copy changes, update those files so the site renders it.

---

## Profile

- **Name:** Rakesh Thapa
- **Title:** AI Native Product Engineer
- **Location:** Kathmandu, Nepal
- **Email:** rakeshthapac@proton.me
- **Stack:** TypeScript, React, Hono, Laravel, Postgres, Tailwind CSS
- **Current role:** CTO at Binary Digits

## Hero

### Headline

AI Native Product Engineer building thoughtful, reliable products.

### Intro

I'm Rakesh, a Nepal based product engineer with over seven years of experience. I build web products end to end, from backend APIs to polished interfaces, with TypeScript (React, Hono), PHP (Laravel), Postgres and Tailwind CSS, and I use AI as a daily part of how I design, build and ship.

Currently CTO at Binary Digits, leading a six person engineering team. Before that I helped build three products across SaaS and fintech.

## Experience

### Binary Digits · CTO (2025 – Present)

https://bdpl.com.np

Leading a six person engineering team building custom software and AI products for clients in fintech, healthcare and government. Took releases from weekly to daily by rebuilding the CI/CD pipeline, cut project kickoffs from weeks to days with shared architecture standards, and kept 90% of clients coming back across 20+ shipped projects.

### Artifact Analyst · Full-Stack Engineer (2024 – 2025)

https://artifactanalyst.com

Built most of an AI equity research platform that helps funds and analysts research stocks in minutes instead of hours. Turned thousands of SEC filings into searchable data with interactive charts and AI answers that always cite their sources, with data pages loading in under a second.

### Feedbucket · Full-Stack Engineer (2022 – 2024)

https://feedbucket.app

Improved the feedback widget and built a dozen two-way integrations (Jira, Asana, Trello, Linear and more) for a SaaS trusted by 500+ web design agencies. Teams could resolve client feedback without ever leaving their project tool, and integrations became the top reason customers chose Feedbucket over competitors.

### Kotuko × Zenlab · Full-Stack Engineer (2019 – 2022)

https://kotuko.it

Started my career building backend APIs and back office tools for enterprise clients in Italy (pharma, healthcare, retail and radio) as part of a distributed team between Milan and Kathmandu. Shipped 10+ production apps serving hundreds of thousands of end users.

## Testimonials

> Placeholder quotes for layout. Replace with genuine testimonials before launch.

**Aryan Shrestha · CEO, Binary Digits**
"Rakesh took our release process from a weekly ritual to a daily non-event. The team ships faster and sleeps better."

**Daniel Reyes · Founder, Artifact Analyst**
"He owned most of our platform as an early engineer. Data pipelines, charts, the AI answer experience: all of it fast and dependable."

**Sofia Lindqvist · Product Lead, Feedbucket**
"The two-way integrations Rakesh built are the reason agencies choose us. Customers resolve feedback without ever opening our app."

**Marco Ricci · Engineering Manager, Kotuko**
"One of those engineers you hand a vague problem and get back a shipped solution. Our back office tools just worked."

**James Carter · Agency Owner, Web design**
"Clear communication, honest estimates, zero surprises. I would hire his team again for any serious build."

## Links

- GitHub: https://github.com/rakesh717
- LinkedIn: https://www.linkedin.com/in/rakesh717
- X: https://x.com/rakeshthapa717
- Email: rakeshthapac@proton.me

## Blog posts

Three sample drafts (full bodies below). Replace freely.

### 1. Two-way integrations are a product moat

- Date: Aug 12, 2026
- Tags: SaaS, Integrations
- Description: What shipping a dozen two-way integrations at Feedbucket taught me about retention, partnerships and when to say no to one-way syncs.

When I joined Feedbucket, the feedback widget was solid but the integration story was thin. Teams loved collecting feedback, then lost hours copying it into Jira or Asana by hand.

We rebuilt our integrations as true two-way syncs: resolve a ticket in Jira and the feedback closes in Feedbucket, comment in either tool and both stay current. Adoption told the story. Teams who connected a tool resolved feedback far faster, and integrations became the reason agencies picked us over tools with longer feature lists.

Three things I would tell anyone building integrations:

- Sync state, not just data. One-way pushes create silent divergence that customers discover at the worst moment.
- Treat each integration as a product with its own onboarding, docs and error surface.
- Say no to shallow integrations. A deep one that never breaks beats five that half work.

Two-way sync is hard, invisible work. That is exactly why it compounds into a moat.

### 2. What rebuilding our CI/CD pipeline taught me about leading engineers

- Date: Jun 3, 2026
- Tags: Leadership, DevOps
- Description: Taking Binary Digits from weekly releases to daily deploys. The pipeline was the easy part, the habits around it were the real work.

When I became CTO at Binary Digits I inherited a talented team and a release process nobody enjoyed. Deploys happened weekly, in batches, with a cleanup ritual afterwards.

Rebuilding the pipeline itself took a few weeks: shared architecture standards, automated checks, and a path to production that did not depend on one person's laptop. The pipeline was the easy part.

What actually moved us to daily releases was habit work. Making reviews fast enough that nobody queued changes. Making rollbacks boring. Celebrating the first on-call week where nothing caught fire.

A year in, releases are a non-event, and new project kickoffs that used to take weeks now take days because the defaults are already right. The lesson I keep relearning: engineers do not need pep talks, they need a floor that never collapses under them.

### 3. AI answers people can verify

- Date: Feb 19, 2026
- Tags: AI, Product
- Description: At Artifact Analyst every AI insight cites its sources. Verifiability, not model quality, decided whether analysts trusted the product.

Equity analysts are professional skeptics. Their job is to not take a claim at face value, so a black box that speaks confidently is worthless to them.

At Artifact Analyst we treated citations as the product, not a feature. Every AI generated answer links to the exact page of the filing or transcript it came from. Analysts click, verify, then decide whether to trust the next answer.

The engineering was mostly plumbing with care: clean pipelines over SEC filings, stable document IDs, and charting that never rounded a number the source did not round.

If you are building on AI, the trust bar is not "sounds right". It is "show me". Design for the click.

## Contact CTA

- Heading: Let's build something thoughtful.
- Subcopy: The fastest way to reach me is email. I read everything myself.
- Buttons: Email me · Connect on LinkedIn
