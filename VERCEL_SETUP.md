# Vercel + GitHub Setup Guide

## Repository Info
- **GitHub**: https://github.com/NDCLI/chamcong
- **Main Branch**: `main`
- **Current Branch**: `agent/protect-account-sync`

## Vercel Build Settings

Framework detected: **Vite**

```
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

## Environment Variables

Add these in Vercel Dashboard → Settings → Environment Variables:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
```

**Important**: Set for all environments (Production, Preview, Development)

## Deploy Workflow

### 1. Check everything works locally
```bash
npm run build
npm run lint
npm test
```

### 2. Push to GitHub
```bash
git add .
git commit -m "feat: complete improvements"
git push origin agent/protect-account-sync
```

### 3. Merge to main (optional)
```bash
git checkout main
git merge agent/protect-account-sync
git push origin main
```

Vercel auto-deploys:
- `main` branch → Production
- Other branches → Preview URLs

## Firebase Setup

Add Vercel domain to Firebase Console → Authentication → Authorized domains:
- `your-project.vercel.app`
- Custom domain if configured

## Troubleshooting

### Build fails
- Check Vercel logs in Deployments tab
- Verify all env vars are set
- Ensure `.env` is in `.gitignore`

### 404 on refresh
- Already fixed with `vercel.json` rewrites
- Ensure `vercel.json` is committed

## Pre-Deploy Checklist

- [x] Tests pass
- [x] Build succeeds
- [x] Lint clean
- [x] `vercel.json` configured
- [ ] Env vars set in Vercel
- [ ] Firebase domains configured
- [ ] Code pushed to GitHub

## Files Ready

- ✅ `vercel.json` - Routing & caching
- ✅ `.env.example` - Env template
- ✅ `.gitignore` - Protects `.env`
- ✅ `package.json` - Scripts configured
