# 🚨 CRITICAL: Edge Function Deployment Required

## The Problem

Your Edge Function is running **OLD CODE**. The fixes we made are in your local files but **NOT deployed to Supabase**.

Evidence from your console logs:
- Still shows `gemini-3-pro-preview` (we changed this)
- Missing new debug logs like `[IMAGES] Image IDs received:`
- Missing `[IMAGES] Query result - records found:`

## Solution: Deploy the Updated Edge Function

### Option 1: Supabase Dashboard (RECOMMENDED)

1. **Go to:** https://supabase.com/dashboard/project/YOUR_PROJECT/functions

2. **Click** on `ai-chat-router` function

3. **Copy the ENTIRE contents** of `/supabase/functions/ai-chat-router/index.ts`

4. **Paste** into the editor in Supabase Dashboard

5. **Click "Deploy"**

6. **Wait** for deployment to complete (usually 30-60 seconds)

7. **Test** by sending a message with an image

### Option 2: Using Supabase CLI

If you have Supabase CLI configured with auth:

```bash
# Make sure you're in the project directory
cd /tmp/cc-agent/60279620/project

# Deploy the function
npx supabase functions deploy ai-chat-router --no-verify-jwt

# Or if you have supabase installed globally
supabase functions deploy ai-chat-router --no-verify-jwt
```

### Option 3: Manual File Upload

1. Go to Supabase Dashboard → Edge Functions
2. Delete the existing `ai-chat-router` function
3. Create new function named `ai-chat-router`
4. Paste the contents of `/supabase/functions/ai-chat-router/index.ts`
5. Set `--no-verify-jwt` flag in settings
6. Deploy

## How to Verify Deployment Worked

After deploying, send a test message with an image. Check the logs for these NEW lines:

```
[IMAGES] Image IDs received: ["abc-123-def"]
[IMAGES] Query result - records found: 1
[IMAGES] Processed images array: [{"type":"base64","mimeType":"image/jpeg","contentLength":45678}]
```

If you see these logs, the deployment was successful!

## Model Name Clarification

I noticed you specified `gemini-3-pro-preview` but this may not be a valid Gemini model ID.

**Valid Gemini Model IDs:**
- `gemini-2.0-flash-exp` (newest, experimental, fast)
- `gemini-1.5-pro` (production-ready, best quality)
- `gemini-1.5-flash` (production-ready, fast)

Which model do you want to use? I can update the code once you confirm.

## API Key Check

Also verify your API keys are set in Supabase:

1. Go to Supabase Dashboard → Edge Functions → Settings
2. Check that these secrets exist:
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
   - `OPENAI_API_KEY`

## Next Steps

1. ✅ Deploy the Edge Function using one of the methods above
2. ✅ Confirm which Gemini model ID you want to use
3. ✅ Test with images and check the new debug logs
4. ✅ Share the console logs so we can see the detailed image processing

---

**IMPORTANT:** All the fixes are already in your code, they just need to be deployed to Supabase!
