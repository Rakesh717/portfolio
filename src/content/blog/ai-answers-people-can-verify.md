---
title: "AI answers people can verify"
description: "At Artifact Analyst every AI insight cites its sources. Verifiability, not model quality, decided whether analysts trusted the product."
pubDate: 2026-02-19
tags: ["AI", "Product"]
---

Equity analysts are professional skeptics. Their job is to not take a claim at face value, so a black box that speaks confidently is worthless to them.

At Artifact Analyst we treated citations as the product, not a feature. Every AI generated answer links to the exact page of the filing or transcript it came from. Analysts click, verify, then decide whether to trust the next answer.

The engineering was mostly plumbing with care: clean pipelines over SEC filings, stable document IDs, and charting that never rounded a number the source did not round.

If you are building on AI, the trust bar is not "sounds right". It is "show me". Design for the click.
