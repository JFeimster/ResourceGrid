---
name: local-site-preview
description: Start a local web server for a local website or static HTML site so it can be previewed in a browser. Use when the user wants to preview, host, serve, or open a local site on localhost.
---

# Local Site Preview

Use this skill when a local website needs to be served through localhost.

## Primary use: static HTML

For a static HTML site, use the included PowerShell script:

`./scripts/Start-LocalSite.ps1`

The script accepts:

- a folder containing `index.html`
- a direct path to `index.html`
- an optional port

Default port: `8000`.

### Start a site

```powershell
.\scripts\Start-LocalSite.ps1 -Path "C:\path\to\site"
```

### Use a custom port

```powershell
.\scripts\Start-LocalSite.ps1 -Path "C:\path\to\site" -Port 8001
```

## Required behavior

The script must:

1. Resolve the supplied path.
2. If the path points to a file such as `index.html`, use its parent directory.
3. Confirm that the target directory exists.
4. Change to the website directory.
5. Print the localhost URL.
6. Never automatically open a browser.
7. Start Python's local HTTP server.
8. Leave the server running until the user presses `Ctrl+C`.
9. Do not deploy the site or modify any external service.

Expected output:

```text
Serving: C:\path\to\site
Open: http://localhost:8000
Stop: Ctrl+C
```

## Usage from PowerShell or VS Code Terminal

Run the script directly:

```powershell
& "C:\path\to\local-site-preview\scripts\Start-LocalSite.ps1" -Path "C:\path\to\website"
```

Or add a wrapper function to the user's PowerShell profile:

```powershell
function Start-LocalSite {
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        [string]$Path,

        [Parameter(Position = 1)]
        [int]$Port = 8000
    )

    & "C:\path\to\local-site-preview\scripts\Start-LocalSite.ps1" `
        -Path $Path `
        -Port $Port
}
```

Then use:

```powershell
Start-LocalSite "C:\path\to\website"
```

or:

```powershell
Start-LocalSite "C:\path\to\website" 8003
```

## Agent behavior

When this skill is invoked by an AI coding agent:

- Do not deploy anything.
- Do not push or commit code.
- Do not modify hosted services.
- Do not open the browser automatically.
- Prefer the bundled script for static HTML.
- If Python is unavailable, report that clearly instead of silently installing software.
- If the selected port is already occupied, tell the user and suggest another port.
