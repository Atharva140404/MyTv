# MyTV Content Manager

## Database Error Fix Guide

If you're seeing errors like:

```
Failed to load resource: the server responded with a status of 404 ()
Error deleting category videos from Supabase: 
Object
    code: "42P01"
    details: null
    hint: null
    message: "relation \"public.video\" does not exist"
```

Follow these steps to fix the database structure:

1. Open the `database-fix.html` file in your browser
2. Follow the step-by-step instructions to fix your Supabase database structure
3. After running the SQL script in your Supabase project, refresh your MyTV application

## What's Happening?

The error occurs because the application is trying to use tables in your Supabase database that don't exist or have an incorrect structure. The SQL script creates the necessary tables with the proper structure for your MyTV application.

## Manual Fix

If you prefer to fix the issue manually, you can:

1. Log into your Supabase dashboard at https://app.supabase.io
2. Navigate to your project
3. Go to the SQL Editor
4. Create a new query
5. Copy and paste the SQL from the `fix-database.sql` file
6. Run the query

After completing these steps, refresh your MyTV application and the errors should be resolved. 

## YouTube API Setup

If you're seeing YouTube API errors (403 Forbidden) in the console, you need to set up your own YouTube API key:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3:
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click on it and press "Enable"
4. Create API credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy your new API key
5. Replace the API key in the code:
   - Open `script.js`
   - Find the line with `const apiKey = "AIzaSyDG2YAMhtF_hoP8InW6sqt78juj6CgvEK4";`
   - Replace it with your new API key: `const apiKey = "YOUR_NEW_API_KEY";`

### API Key Security

For security, you should restrict your API key:
1. Go back to the Google Cloud Console > Credentials
2. Find your API key and click "Edit"
3. Under "Application restrictions", choose "HTTP referrers"
4. Add the domains where your app will run (e.g., `localhost/*`, `your-website.com/*`)
5. Under "API restrictions", select "Restrict key" and choose "YouTube Data API v3"
6. Click "Save"

The application has fallback mechanisms for when the API is unavailable, but having a valid API key will provide the best experience. 