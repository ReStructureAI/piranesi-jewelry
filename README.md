# piranesi-jewelry (Project Jewelry)

Extraction of https://piranesi.com/ (Shopify) into a JSON database + Cloudflare Vectorize index.

- Source pulled through the ReStructure swarm: POST https://swarm.restructure.cloud/extract/job (x-intake-key auth), worker in `worker/swarm-siteextract.js`, results in R2 bucket `swarm-siteextract`.
- `data/piranesi_db.json` - normalized DB: 465 products, 226 collections, 34 pages, 5 articles (2026-10-20).
- `data/vector_docs.json` - the 730 embedded documents (text + metadata, no vectors).
- Vectorize index: `piranesi-jewelry` (768 dims, cosine, bge-base-en-v1.5 embeddings, account marc-816).
- Extraction respected robots.txt (catalog-only; no checkout/account paths) with 2 rps politeness.

## Public mirror (2026-10-20)
- Live: https://jewelry.restructure.cloud/ (Cloudflare Pages project `jewelry`, deploy: `npx wrangler@3 pages deploy <dir> --project-name jewelry`)
- `site/index.html` - the mirror page (search, type filter, sort, collections, JSON download). Data files copied into the Pages dir at deploy time: `data.json` (slim browse dataset) + `piranesi_db.json` (full DB download).
- Repo is public per Marc: the data is piranesi.com's public catalog.
