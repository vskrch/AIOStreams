# Heroku Deployment Guide for AIOStreams

This guide will help you deploy AIOStreams to Heroku after the configuration files have been added.

## Prerequisites

- A Heroku account
- Git installed and repository connected to Heroku
- Your code pushed to GitHub (if using GitHub integration)

## Step 1: Push Changes to GitHub

First, commit and push all the Heroku configuration files:

```bash
git add Procfile package.json .npmrc entrypoint.sh
git commit -m "Add Heroku deployment configuration"
git push origin main
```

## Step 2: Configure Heroku Buildpacks

Heroku needs to use the right buildpack for Node.js with pnpm support.

### Via Heroku Dashboard:
1. Go to your app in the Heroku Dashboard
2. Navigate to **Settings** → **Buildpacks**
3. Click **Add buildpack**
4. Add the official Node.js buildpack: `heroku/nodejs`

### Via Heroku CLI:
```bash
heroku buildpacks:set heroku/nodejs --app your-app-name
```

## Step 3: Set Environment Variables

AIOStreams requires several environment variables. Set them in your Heroku dashboard under **Settings** → **Config Vars**, or via CLI:

### Required Variables:

```bash
# Generate a 64-character hex SECRET_KEY
heroku config:set SECRET_KEY=$(openssl rand -hex 32) --app your-app-name

# Set your Heroku app URL as BASE_URL
heroku config:set BASE_URL=https://your-app-name.herokuapp.com --app your-app-name

# Database URI - Use Heroku Postgres or SQLite
# For Heroku Postgres (recommended):
heroku addons:create heroku-postgresql:essential-0 --app your-app-name
# This automatically sets DATABASE_URL, but AIOStreams uses DATABASE_URI
# You'll need to copy the DATABASE_URL value and set it as DATABASE_URI

# For SQLite (simple but not recommended for production):
heroku config:set DATABASE_URI=sqlite://./data/db.sqlite --app your-app-name

# Set addon name and ID
heroku config:set ADDON_NAME="AIOStreams" --app your-app-name
heroku config:set ADDON_ID="aiostreams.yourdomain.com" --app your-app-name
```

### Optional but Recommended Variables:

```bash
# API key protection (comma-separated for multiple passwords)
heroku config:set ADDON_PASSWORD=your-secure-password --app your-app-name

# Node environment
heroku config:set NODE_ENV=production --app your-app-name

# Log level
heroku config:set LOG_LEVEL=info --app your-app-name
```

### Get Database URI from Heroku Postgres:

If you added Heroku Postgres, get the DATABASE_URL and set it as DATABASE_URI:

```bash
# Get the DATABASE_URL
heroku config:get DATABASE_URL --app your-app-name

# Copy the output and set it as DATABASE_URI
heroku config:set DATABASE_URI="<paste-the-database-url-here>" --app your-app-name
```

> **Note:** Replace `postgresql://` with `postgres://` if needed (AIOStreams might expect the shorter format).

## Step 4: Deploy the Application

If you're using GitHub integration:
1. In Heroku Dashboard, go to **Deploy** tab
2. Ensure your GitHub repository is connected
3. Select the `main` branch
4. Click **Deploy Branch**

If using Heroku CLI:
```bash
git push heroku main
```

## Step 5: Monitor the Deployment

Watch the build logs to ensure everything installs correctly:

```bash
heroku logs --tail --app your-app-name
```

Look for:
- ✅ pnpm being detected and installed
- ✅ Dependencies installing successfully
- ✅ Build completing without errors
- ✅ Server starting on the assigned PORT

## Step 6: Verify Deployment

Once deployed, visit your app:

```
https://your-app-name.herokuapp.com/stremio/configure
```

You should see the AIOStreams configuration page.

## Troubleshooting

### Build Fails with "pnpm: command not found"

Make sure the `packageManager` field is set in `package.json`. Heroku should automatically enable Corepack for pnpm support with Node.js 16.9+.

### Application Crashes on Startup

Check the logs:
```bash
heroku logs --tail --app your-app-name
```

Common issues:
- Missing environment variables (SECRET_KEY, DATABASE_URI, BASE_URL)
- Database connection errors
- Port binding issues (Heroku sets PORT automatically)

### Database Connection Errors

If using Heroku Postgres:
1. Verify DATABASE_URI is set correctly
2. Ensure the format is `postgres://` or `postgresql://`
3. Check if the database addon is properly provisioned: `heroku addons --app your-app-name`

### Node.js Version Issues

The app requires Node.js 24+. If Heroku doesn't support Node 24 yet:
1. Check available versions: https://devcenter.heroku.com/articles/nodejs-support
2. Temporarily adjust `engines.node` in `package.json` to the highest available version (e.g., `>=20.0.0`)

## Environment Variables Reference

See `.env.sample` for all available configuration options. The most commonly used ones are:

- `SECRET_KEY` - Required, 64-char hex string for encryption
- `DATABASE_URI` - Required, database connection string
- `BASE_URL` - Required, your Heroku app URL
- `ADDON_NAME` - Display name for your addon
- `ADDON_ID` - Unique identifier for your addon
- `ADDON_PASSWORD` - Optional password protection
- `PORT` - Auto-set by Heroku, don't override

## Scaling

For better performance, you can scale your dyno:

```bash
# Upgrade to a better dyno type
heroku ps:scale web=1:standard-1x --app your-app-name
```

## Useful Commands

```bash
# View logs
heroku logs --tail --app your-app-name

# Restart the app
heroku restart --app your-app-name

# Check running processes
heroku ps --app your-app-name

# Open the app in browser
heroku open --app your-app-name

# Run a one-off command
heroku run bash --app your-app-name
```

## Need Help?

- Check the [AIOStreams Wiki](https://github.com/Viren070/AIOStreams/wiki)
- Join the [Discord Server](https://discord.viren070.me)
- Review logs: `heroku logs --tail --app your-app-name`
