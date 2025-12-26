# Push to New GitHub Repository

## Repository URL
https://github.com/ManvithMadhuvarsu/dc_test_new

## Step-by-Step Commands

### Step 1: Update/Add Remote Repository

```bash
# Check current remote
git remote -v

# Update existing remote
git remote set-url origin https://github.com/ManvithMadhuvarsu/dc_test_new.git

# OR if remote doesn't exist, add it
git remote add origin https://github.com/ManvithMadhuvarsu/dc_test_new.git
```

### Step 2: Verify Remote

```bash
git remote -v
```

Should show:
```
origin  https://github.com/ManvithMadhuvarsu/dc_test_new.git (fetch)
origin  https://github.com/ManvithMadhuvarsu/dc_test_new.git (push)
```

### Step 3: Add All Files (Excluding node_modules)

```bash
# Add all files
git add -A

# Remove node_modules from staging
git reset server/node_modules/ client/node_modules/
```

### Step 4: Review Changes

```bash
git status
```

### Step 5: Commit Changes

```bash
git commit -m "Initial commit: Exam UI with student data and question groups"
```

### Step 6: Push to New Repository

```bash
# Push to main branch (first time)
git push -u origin main
```

If the branch doesn't exist on remote or you need to force push:

```bash
# Force push (use with caution)
git push -u origin main --force
```

## Complete Command Sequence

```bash
# Navigate to deployment directory
cd deployment

# Update remote
git remote set-url origin https://github.com/ManvithMadhuvarsu/dc_test_new.git

# Verify remote
git remote -v

# Add files (excluding node_modules)
git add -A
git reset server/node_modules/ client/node_modules/

# Review
git status

# Commit
git commit -m "Initial commit: Exam UI with student data and question groups"

# Push
git push -u origin main
```

## Troubleshooting

### If you get "repository not found" error:
- Make sure the repository exists on GitHub
- Check that you have access to the repository
- Verify the repository URL is correct

### If you get "branch main does not exist" error:
- Create the repository on GitHub first
- Or use: `git push -u origin main --force`

### If you get authentication errors:
- Use GitHub Personal Access Token instead of password
- Or set up SSH keys for authentication

