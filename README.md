# COEQWAL AI-Enabled Threshold Analysis Dashboard

A web-based dashboard for comparing AI-generated vs. manually curated policy analysis across water resource outcome metrics.

## What It Does

This tool lets users select a water resource outcome (e.g., Agricultural Productivity, Salmon Abundance) and view side-by-side comparisons of policy analysis from two sources:

- **Manual Results** — human-curated policy lens responses
- **ChatGPT Results** — AI-generated responses using the same prompts

Analysis is organized into three views: **Legal Standards**, **Tiered Implications**, and **Governing Agencies**.

## Project Structure

```
dashboard/
├── index.html              # Main app entry point
├── scripts.js              # App logic, data loading, and rendering
├── styles.css              # Styling
├── chatgpt_responses/      # AI-generated analysis (JSON, per metric)
├── manual_responses/       # Human-curated analysis (JSON, per metric)
├── oldchatgpt_responses/   # Archived AI responses
└── references/             # Schema definitions and reference data
```

## Getting Started

Open `index.html` in a browser. No server or build step required — it runs entirely in the browser.

## Data Format

Response files follow the schema in `references/newschema.json`. Each file contains Legal Standards, Tiered policy implications, and Governing Agencies for a given outcome metric.
