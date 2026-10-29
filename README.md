# ai-design-experiments
Small experiments exploring generative AI tools, prompts, and creative workflows.
# AI Design Experiments

A collection of small experiments exploring how generative AI tools can support creative workflows.

Focus areas:
- prompt interfaces
- generative media tools
- creative AI collaboration
- interaction models for AI systems

## Experiments

### Prompt-driven UI exploration
Testing how different prompt structures change output behavior.

### Creative AI workflows
Experiments combining generative tools with design workflows.

### Interface patterns for AI tools
Notes and prototypes exploring how users interact with generative systems.

## Portfolio site

The repo root is a static portfolio site (no build step).

```
index.html                    home: hero, work, lab, about, contact
projects/project-template.html case study template — duplicate per project
assets/css/styles.css          all styles; color tokens at the top
assets/js/main.js              flow-field hero, prompt, thumbnails, filters, theme
```

**Run locally:** open `index.html`, or `python3 -m http.server` and visit http://localhost:8000.

**Fill in your content:** search for `TODO` and for "Your Name". Project cards take
`data-tags` (drives the Design / Code / AI filters) and a generated thumbnail via
`data-seed` + `data-style` (`flow`, `grid`, `rings`, `waves`, `blobs`, `glitch`). Swap the
`<canvas>` for an `<img>` when you have real images.

**Deploy:** works as-is on GitHub Pages (Settings → Pages → deploy from branch, root) or Vercel.
