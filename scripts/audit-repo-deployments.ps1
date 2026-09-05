[CmdletBinding()]
param(
    [string]$Owner = 'JFeimster',
    [string[]]$Repository,
    [string]$OutFile
)

$ErrorActionPreference = 'Stop'

function Invoke-GhJson {
    param([string[]]$Arguments)
    $raw = & gh @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "gh $($Arguments -join ' ') failed."
    }
    return $raw | ConvertFrom-Json
}

function Get-RepositoryFileText {
    param([string]$RepositoryName, [string]$Path)
    try {
        $raw = & gh api "repos/$RepositoryName/contents/$Path" 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        $file = $raw | ConvertFrom-Json
        if ($file.type -ne 'file' -or -not $file.content) { return $null }
        return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($file.content -replace '\s', '')))
    } catch {
        return $null
    }
}

function Test-AnyPath {
    param([string[]]$Paths, [string[]]$Patterns)
    return @($Paths | Where-Object {
        $candidate = $_
        @($Patterns | Where-Object { $candidate -like $_ }).Count -gt 0
    }).Count -gt 0
}

if ($Repository.Count -gt 0) {
    $repos = foreach ($name in $Repository) {
        Invoke-GhJson @('repo', 'view', "$Owner/$name", '--json', 'name,nameWithOwner,url,visibility,isArchived,defaultBranchRef,pushedAt,description')
    }
} else {
    $repos = Invoke-GhJson @('repo', 'list', $Owner, '--limit', '500', '--json', 'name,nameWithOwner,url,visibility,isArchived,defaultBranchRef,pushedAt,description')
}

$results = foreach ($repo in $repos) {
    $branch = $repo.defaultBranchRef.name
    if (-not $branch) { $branch = 'HEAD' }
    $tree = Invoke-GhJson @('api', "repos/$($repo.nameWithOwner)/git/trees/$($branch)?recursive=1")
    $paths = @($tree.tree | Where-Object { $_.type -eq 'blob' } | ForEach-Object path)
    $packageText = Get-RepositoryFileText -RepositoryName $repo.nameWithOwner -Path 'package.json'
    $package = $null
    if ($packageText) { try { $package = $packageText | ConvertFrom-Json } catch {} }
    $dependencies = @{}
    if ($package) {
        foreach ($group in @($package.dependencies, $package.devDependencies)) {
            if ($group) {
                foreach ($property in $group.PSObject.Properties) { $dependencies[$property.Name] = $property.Value }
            }
        }
    }

    [pscustomobject]@{
        repository = [pscustomobject]@{
            name = $repo.nameWithOwner
            url = $repo.url
            visibility = $repo.visibility
            archived = $repo.isArchived
            pushed_at = $repo.pushedAt
            description = $repo.description
        }
        detected = [pscustomobject]@{
            package_json = [bool]$packageText
            framework = if ($dependencies.ContainsKey('next')) { 'Next.js' } elseif ($dependencies.ContainsKey('vite')) { 'Vite' } elseif ($dependencies.ContainsKey('astro')) { 'Astro' } elseif ($dependencies.ContainsKey('express')) { 'Express' } elseif ($dependencies.ContainsKey('fastify')) { 'Fastify' } elseif ($dependencies.ContainsKey('hono')) { 'Hono' } else { $null }
            dependencies = @($dependencies.Keys | Sort-Object)
            api_routes = Test-AnyPath $paths @('app/api/*', 'pages/api/*', 'api/*')
            middleware = Test-AnyPath $paths @('middleware.*')
            auth_dependencies = @($dependencies.Keys | Where-Object { $_ -match 'auth|clerk|supabase|firebase|passport' } | Sort-Object)
            worker_or_cron = (Test-AnyPath $paths @('*worker*', '*cron*', '*job*', 'Procfile'))
            server_or_container = (Test-AnyPath $paths @('Dockerfile', 'server.*', 'render.yaml', 'railway.json', 'fly.toml', 'Procfile'))
            embed_signals = (Test-AnyPath $paths @('*widget*', '*embed*'))
            static_html = (Test-AnyPath $paths @('index.html', 'public/*.html', 'static/*.html'))
            deployment_configs = @($paths | Where-Object { $_ -match '(^|/)(vercel\.json|netlify\.toml|wrangler\.(toml|json)|firebase\.json|render\.yaml|railway\.json|fly\.toml)$' })
            evidence_files = @($paths | Where-Object { $_ -match '^(package\.json|next\.config\.(js|mjs|ts)|vercel\.json|netlify\.toml|wrangler\.(toml|json)|firebase\.json|render\.yaml|railway\.json|fly\.toml|Dockerfile|Procfile|middleware\.|app/api/|pages/api/|api/)' } | Select-Object -First 25)
        }
    }
}

$output = [pscustomobject]@{
    generated_at = (Get-Date).ToUniversalTime().ToString('o')
    owner = $Owner
    repository_count = @($results).Count
    repositories = @($results)
}

if ($OutFile) {
    $output | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutFile -Encoding utf8
} else {
    $output | ConvertTo-Json -Depth 8
}
