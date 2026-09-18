# local-repo-finder

## Purpose

Provide a reusable global PowerShell helper for locating the best local folder associated with a GitHub repository.

## Command

`Find-LocalRepo <repository> [-All] [-Exact] [-Open] [-CopyPath] [-OpenWith Explorer|Code]`

Accepted repository identifiers:

- `https://github.com/OWNER/REPO`
- `git@github.com:OWNER/REPO.git`
- `OWNER/REPO`
- `REPO`

## Source of truth

- Implementation: `scripts/Find-LocalRepo.ps1`
- Search roots/exclusions: `config/LocalRepoFinder.psd1`
- Profile example: `profile/PowerShell-Profile-Snippet.ps1`
- Local validation: `tests/Test-LocalRepoFinder.ps1`

## Safety / scope

- Search only configured project roots.
- Never recurse through all of `C:\`.
- Prune dependency, Git-internal, cache, and output folders.
- Use read-only Git commands (`git remote get-url origin`) for verification.
- Do not modify located repositories.
- Profile installation is marker-based and preserves unrelated profile content.
