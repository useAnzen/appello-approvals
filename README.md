# Appello Approval Documents

Public-facing approval documents and canvases for Appello customers, hosted via GitHub Pages.

## Usage

### Adding a new document

1. Place your canvas HTML file in the `docs/` folder
2. Add a card entry to `index.html` inside the `doc-grid` div (and hide the empty state)
3. Commit and push — GitHub Pages deploys automatically

### Structure

```
appello-approvals/
├── index.html          # Landing page listing all documents
├── docs/               # Individual document HTML files
│   └── example.html
└── README.md
```

### URL format

Once deployed, documents are accessible at:

```
https://useanzen.github.io/appello-approvals/              → Index
https://useanzen.github.io/appello-approvals/docs/xyz.html → Individual document
```

### Custom domain (optional)

To use a custom domain like `approvals.useappello.com`:

1. Add a `CNAME` file to the repo root with the domain name
2. Configure a CNAME DNS record pointing to `useanzen.github.io`
3. Enable "Enforce HTTPS" in the repo's GitHub Pages settings

