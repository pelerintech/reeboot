---
name: github
description: GitHub operations via gh CLI — issues, PRs, releases, code search, GitHub Actions workflows. Use when working with GitHub repositories, managing issues, reviewing pull requests, or automating GitHub tasks.
---

# GitHub

Wraps the `gh` CLI for GitHub operations — issues, pull requests, releases, code search, and GitHub Actions.

## Setup

1. Install the GitHub CLI:
   ```
   brew install gh           # macOS
   # or: https://cli.github.com/
   ```

2. Authenticate:
   ```
   gh auth login
   ```
   Follow the prompts to authenticate via browser or token.

3. Verify:
   ```
   gh auth status
   ```

## Usage

### Issues

```bash
gh issue list --repo owner/repo --state open --limit 20
gh issue view 123 --repo owner/repo
gh issue create --title "Bug: ..." --body "..." --label bug
gh issue close 123
```

### Pull Requests

```bash
gh pr list --repo owner/repo --state open
gh pr view 456 --repo owner/repo
gh pr create --title "Feature: ..." --body "..." --base main
gh pr merge 456 --squash
gh pr review 456 --approve
```

### Releases

```bash
gh release list --repo owner/repo
gh release create v1.2.3 --title "v1.2.3" --notes "Changelog..."
gh release view v1.2.3
```

### Code Search

```bash
gh search code "function authenticate" --repo owner/repo
gh search issues "memory leak" --repo owner/repo
```

### GitHub Actions

```bash
gh run list --repo owner/repo --limit 10
gh run view 789 --repo owner/repo
gh run watch 789
gh workflow run deploy.yml --ref main
```

### Repos

```bash
gh repo list --limit 20
gh repo clone owner/repo
gh repo view owner/repo
```
