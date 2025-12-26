# Git Push Commands

## Quick Push (All Changes)

```bash
# Navigate to deployment directory
cd deployment

# Add all files except node_modules
git add -A
git reset server/node_modules/ client/node_modules/

# Review changes
git status

# Commit
git commit -m "Add student data, question groups, multiple answers label, and UI improvements"

# Push to GitHub
git push origin main
```

## Selective Push (Only New SQL Files)

```bash
# Navigate to deployment directory
cd deployment

# Add only new SQL files
git add insert-students.sql
git add insert-classification-scores-group.sql
git add add-multiple-answers-label.sql

# Add modified source files
git add client/src/App.css
git add client/src/App.jsx
git add server/src/
git add supabase-schema.sql
git add server/env.*.example
git add server/package.json server/package-lock.json

# Review changes
git status

# Commit
git commit -m "Add student data, question groups, multiple answers label, and UI improvements"

# Push to GitHub
git push origin main
```

## Important Notes

⚠️ **DO NOT commit:**
- `node_modules/` folders
- `.env` files (they contain sensitive data)
- Only commit `.env.example` files

✅ **DO commit:**
- SQL files (`.sql`)
- Source code (`.js`, `.jsx`, `.css`)
- Configuration examples (`.example` files)
- `package.json` and `package-lock.json`

## If You Get Errors

### If "origin/main" is behind:
```bash
git pull origin main --rebase
git push origin main
```

### If you need to force push (⚠️ Use with caution):
```bash
git push origin main --force
```

### To check remote URL:
```bash
git remote -v
```

