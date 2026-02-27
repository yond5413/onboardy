# Podcast Audio & Management Features - Implementation Summary

## Overview

This document summarizes the implementation of podcast audio playback, export, version history, and regeneration features for Onboardy.

## What Was Implemented

### 1. Database Schema (Migration 007)
- **New `podcasts` table** for version history
  - Stores multiple podcast versions per job
  - Includes script content, audio file path, settings, and version number
  - Unique constraint on (job_id, version)
- **Helper function** `get_next_podcast_version()` for automatic version numbering
- **RLS policies** for secure access control

**File**: `supabase/migrations/007_podcasts_table.sql`

### 2. Backend API Endpoints

#### Updated POST `/api/jobs/[id]/podcast`
- Creates new podcast versions instead of overwriting
- Automatically increments version number
- Saves to `podcasts` table
- Maintains backward compatibility by updating `jobs` table with latest version
- Returns version number and podcast ID in response

#### New GET `/api/jobs/[id]/podcast`
- Fetches all podcast versions for a job (without `?version` param)
- Fetches specific version (with `?version=N` param)
- Returns metadata: id, version, settings, created_at

#### New GET `/api/jobs/[id]/podcast/export`
- **Query params**: `type` (script|audio|both), `version` (optional)
- **type=script**: Downloads text file
- **type=audio**: Downloads MP3 file
- **type=both**: Downloads ZIP package with script, audio, and metadata.json
- Proper Content-Disposition headers for downloads

**Files**: 
- `app/api/jobs/[id]/podcast/route.ts`
- `app/api/jobs/[id]/podcast/export/route.ts`

### 3. Frontend UI Enhancements

#### Enhanced Audio Player Section
- **Version selector dropdown** (when multiple versions exist)
- **Export dropdown menu** with 3 options:
  - Download Script
  - Download Audio
  - Download Both (ZIP)
- **"Generate New" button** opens settings modal
- **Version info display**: "Version X • Created Date"
- Audio player updates when version is switched

#### Enhanced Script Tab
- **Version selector** (synced with audio player)
- **Export dropdown** (same as audio player)
- **Settings display**: Shows style, tone, duration, audience for selected version
- Script content updates when version is switched

#### Updated Settings Modal
- **Regeneration mode**: Shows different title and description
- **Version warning**: Alert explaining that previous versions remain accessible
- **Pre-populated settings**: Uses latest version's settings as defaults
- **Button text**: Changes to "Generate New Version" when regenerating

**Files**:
- `app/(app)/jobs/[id]/page.tsx`
- `components/podcast-settings-modal.tsx`

### 4. State Management
- **New state variables**:
  - `podcastVersions`: Array of version metadata
  - `selectedPodcastVersion`: Currently selected version number
  - `currentPodcast`: Current version's script and audio
- **Fetch functions**:
  - `fetchPodcastVersions()`: Gets all versions
  - `fetchPodcastVersion(version)`: Gets specific version data
- **Export handlers**:
  - `handleExportScript()`
  - `handleExportAudio()`
  - `handleExportBoth()`
- **Auto-refresh**: Fetches versions when job has podcast content
- **Auto-select**: Selects latest version by default

### 5. Dependencies
- Added `jszip` (^3.10.1) for ZIP file creation
- Added `@types/jszip` (^3.4.1) for TypeScript support

**File**: `package.json`

## User Flow

1. **Initial Generation**
   - User completes analysis
   - Clicks "Generate Podcast" button
   - Settings modal opens
   - Selects preferences (style, tone, duration, audience)
   - Generates → **Version 1** created
   - Audio player appears with download options

2. **Regeneration**
   - User clicks "Generate New" button
   - Settings modal opens with previous settings pre-filled
   - Shows warning about creating new version
   - Adjusts settings if desired
   - Generates → **Version 2** created
   - Version selector appears showing both versions

3. **Version Switching**
   - User selects different version from dropdown
   - Audio player updates to play selected version
   - Script tab updates to show selected version's content
   - Settings info updates to show selected version's configuration

4. **Exporting**
   - User clicks "Export" dropdown
   - Selects desired format (script, audio, or both)
   - File downloads with version number in filename
   - ZIP package includes metadata.json with version info

## Files Modified/Created

### Created
1. `supabase/migrations/007_podcasts_table.sql`
2. `app/api/jobs/[id]/podcast/export/route.ts`
3. `PODCAST_FEATURES_IMPLEMENTATION.md` (this file)

### Modified
1. `app/api/jobs/[id]/podcast/route.ts` - Added GET endpoint, updated POST
2. `app/(app)/jobs/[id]/page.tsx` - Added version management UI and state
3. `components/podcast-settings-modal.tsx` - Added regeneration mode
4. `package.json` - Added jszip dependencies

## Testing Checklist

### Database Migration
- [ ] Run migration 007 in Supabase SQL Editor
- [ ] Verify `podcasts` table exists
- [ ] Verify indexes are created
- [ ] Test `get_next_podcast_version()` function

### Backend API
- [ ] Test POST creates version 1 for new podcast
- [ ] Test POST creates version 2 for existing podcast
- [ ] Test GET returns all versions
- [ ] Test GET with ?version=N returns specific version
- [ ] Test export with type=script
- [ ] Test export with type=audio
- [ ] Test export with type=both (ZIP)
- [ ] Test export with specific version parameter

### Frontend UI
- [ ] Test initial podcast generation
- [ ] Verify audio player appears with version info
- [ ] Test "Generate New" button opens modal with previous settings
- [ ] Test regeneration creates new version
- [ ] Test version selector appears when multiple versions exist
- [ ] Test switching between versions updates audio and script
- [ ] Test export script download
- [ ] Test export audio download
- [ ] Test export both (ZIP) download
- [ ] Verify ZIP contains script, audio, and metadata.json
- [ ] Test version selector in script tab
- [ ] Verify settings display shows correct info for selected version

### Edge Cases
- [ ] Test with no audio (script only)
- [ ] Test with very long script
- [ ] Test with many versions (10+)
- [ ] Test concurrent version generation
- [ ] Test unauthorized access to other user's podcasts
- [ ] Test export of non-existent version

## Migration Instructions

### For Development
1. Install dependencies:
   ```bash
   npm install
   ```

2. Run migration in Supabase SQL Editor:
   - Go to Supabase Dashboard → SQL Editor
   - Copy contents of `supabase/migrations/007_podcasts_table.sql`
   - Paste and click "Run"

3. Restart development server:
   ```bash
   npm run dev
   ```

### For Production
1. Deploy code changes
2. Run migration in production Supabase project
3. Test with a non-critical job first
4. Monitor logs for any errors

## Backward Compatibility

- ✅ Existing jobs with podcasts continue to work
- ✅ Jobs table still stores latest version for compatibility
- ✅ Old podcast generation flow works (creates version 1)
- ✅ No breaking changes to existing API contracts

## Performance Considerations

- Version metadata is lightweight (only fetches id, version, settings, created_at)
- Full podcast data (script + audio) only fetched when version is selected
- Audio files stored as base64 data URIs (consider moving to Supabase Storage for large scale)
- ZIP generation happens on-demand, not stored

## Future Enhancements

1. **Supabase Storage Migration**: Move audio files from base64 to Supabase Storage
2. **Version Comparison**: Side-by-side comparison of different versions
3. **Version Naming**: Allow users to name versions (e.g., "Technical Deep Dive", "Executive Summary")
4. **Version Deletion**: Allow users to delete old versions
5. **Sharing Specific Versions**: Share links to specific podcast versions
6. **Batch Export**: Export all versions at once
7. **Playback Speed Control**: Add speed controls to audio player
8. **Transcript Sync**: Highlight script text as audio plays

## Support

For issues or questions:
- Check Supabase logs for backend errors
- Check browser console for frontend errors
- Verify migration ran successfully
- Ensure jszip is installed correctly
