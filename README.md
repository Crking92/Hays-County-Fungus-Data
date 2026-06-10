# Hays County / Central Texas Fungi Evidence Atlas

A static, GitHub Pages-ready public dashboard for a merged Hays County / Central Texas fungi and fungus-like organism evidence dataset.

## What this project does

This dashboard separates two different questions:

1. **Where has this taxon been documented?**  
   Occurrence evidence comes from source layers such as MyCoPortal, GBIF, iNaturalist checklist data, and USDA/BPI records.

2. **What ecological role might it perform?**  
   Functional interpretation comes from FUNGuild, host/interaction records, and the merged interaction layer.

The dashboard avoids a simple **native / not native** field because fungi are not tracked like vascular plants. Most fungi do not have a BONAP-style county nativity table. Instead, the site uses evidence labels such as **Strong local evidence**, **Good local candidate**, **Regional candidate**, and **Relationship known only**.

## Files

- `index.html` — the public dashboard.
- `assets/styles.css` — styling.
- `assets/app.js` — dashboard filtering, cards, table, scorecards, downloads, and live iNaturalist photo lookup.
- `data/dashboard-data.json` — the full merged dashboard data.
- `data/taxa-public.csv` — exportable public taxon table.
- `DATA_NOTES.md` — source and interpretation notes.
- `.nojekyll` — helps GitHub Pages serve files as-is.

## Deploy on GitHub Pages

1. Create a new GitHub repository.
2. Upload all files in this folder.
3. Go to **Settings → Pages**.
4. Set source to **Deploy from a branch**.
5. Select branch `main` and folder `/root`.
6. Save. GitHub will publish the dashboard as a static site.

## Important public caveats

- This is **not an edible mushroom guide**.
- iNaturalist photos are loaded live as display aids and do not change evidence scores.
- GBIF records in this version are a Hays County bounding-box first pass; exact county polygon review is still needed before final Hays-confirmed claims.
- Functional guilds and interactions help explain what fungi may do, but they do not prove local occurrence by themselves.

## Suggested public citation statement

> This dashboard compiles fungal occurrence, host, interaction, and functional-guild records from MyCoPortal, GBIF, iNaturalist Hays County checklist data, USDA/BPI fungal records, FUNGuild, and Central Texas interaction data. Records are interpreted with evidence-strength labels rather than a simple native/not-native field because most fungi lack county-level nativity status systems comparable to vascular plant databases.

Generated: 2026-06-10

## Latest UI fixes

- The Explore section now has an explicit card/table view switch that works both locally and on GitHub Pages.
- The interaction filter now separates taxa with actual merged interaction-source evidence from taxa with no merged interaction record.
- Interaction summaries are populated from the row-level interaction pair summary where available. If a taxon has an interaction source flag but no public host/partner pair, the dashboard says that directly rather than showing it as a missing interaction.

