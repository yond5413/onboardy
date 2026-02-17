# Supabase Setup Guide

This guide will walk you through setting up Supabase for the Onboardy production migration.

## Prerequisites

- Supabase account (free tier is sufficient to start)
- Access to Supabase Dashboard
- Node.js and npm installed locally

## Step 1: Create Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Enter project details:
   - **Name**: onboardy-production (or your preferred name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users (e.g., US East)
4. Wait for project provisioning (1-2 minutes)

## Step 2: Get API Credentials

1. In your Supabase project dashboard, go to **Project Settings** → **API**
2. Copy the following values:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon public** API key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role secret** API key (`SUPABASE_SERVICE_ROLE_KEY`)
3. Add these to your `.env.local` file

## Step 3: Configure GitHub OAuth

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **GitHub** and enable it
3. Get GitHub OAuth credentials:
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Click **New OAuth App**
   - Fill in:
     - **Application name**: Onboardy
     - **Homepage URL**: `http://localhost:3000` (for local dev)
     - **Authorization callback URL**: `http://localhost:3000/auth/callback`
   - For production: Use your production domain
4. Copy **Client ID** and **Client Secret** from GitHub to Supabase

## Step 4: Run Database Migrations

### Option A: Using Supabase SQL Editor (Recommended)

1. In Supabase Dashboard, go to **SQL Editor**
2. Click **New query**
3. Copy contents of `supabase/migrations/001_initial_schema.sql`
4. Paste and click **Run**
5. Repeat for `supabase/migrations/002_storage_policies.sql`

### Option B: Using Supabase CLI (Advanced)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

## Step 5: Create Storage Bucket

1. In Supabase Dashboard, go to **Storage**
2. Click **New bucket**
3. Enter:
   - **Name**: `podcast-audio`
   - **Public bucket**: ❌ Unchecked (keep private)
4. Click **Save**

## Step 6: Test Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:3000`

3. Try to create a job (should redirect to login if not authenticated)

4. Test authentication flow:
   - Go to `/login`
   - Click "Sign in with GitHub"
   - Complete OAuth flow
   - Should be redirected back to app

## Step 7: Verify Database

1. In Supabase Dashboard, go to **Table Editor**
2. You should see these tables:
   - `profiles`
   - `jobs`
   - `sandboxes`
   - `job_logs`
3. Create a test job and verify data appears

## Troubleshooting

### "Unauthorized" errors
- Check that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
- Verify middleware.ts is properly configured

### Database connection errors
- Ensure you're using the correct Project URL
- Check that migrations ran successfully

### Storage upload failures
- Verify bucket `podcast-audio` exists
- Check RLS policies are applied

### GitHub OAuth not working
- Verify callback URL matches exactly (including http/https)
- Check that Client ID and Secret are correct
- Ensure GitHub OAuth app is active (not suspended)

## Environment Variables Summary

Add these to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

## Next Steps

After setup is complete:
1. Test job creation with authentication
2. Verify job persistence across server restarts
3. Test sharing functionality
4. Deploy to staging environment
5. Monitor Supabase logs for errors

## Cost Monitoring

Track your usage in Supabase Dashboard:
- **Database**: 500MB free, then $0.125/GB/month
- **Storage**: 1GB free, then $0.021/GB/month
- **Bandwidth**: 2GB free, then $0.09/GB

Current usage estimate: ~2MB per job (well within free tier for 1000 jobs)

## Support

- Supabase Docs: https://supabase.com/docs
- Authentication: https://supabase.com/docs/guides/auth
- Storage: https://supabase.com/docs/guides/storage
