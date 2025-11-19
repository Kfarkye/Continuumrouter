# Image Vision Testing Guide

## 🧪 Quick Testing Checklist

This guide provides step-by-step testing procedures for the hardened multi-provider image vision implementation.

---

## 🎯 Pre-Flight Checks

### 1. Database Schema Verification

```sql
-- Check uploaded_images table structure
\d uploaded_images;

-- Should show:
-- - conversation_id UUID (nullable)
-- - file_size INTEGER
-- - Foreign key on conversation_id with CASCADE DELETE
```

### 2. Storage Bucket Verification

1. Go to Supabase Dashboard → Storage
2. Verify bucket named `chat-uploads` exists
3. Check it's set to **Private** (not public)
4. Verify RLS policies are enabled

### 3. Edge Function Configuration

```bash
# Check bucket name in Edge Function
grep "IMAGE_BUCKET_NAME" supabase/functions/ai-chat-router/index.ts

# Should output: IMAGE_BUCKET_NAME: 'chat-uploads'
```

---

## 🔬 Test Scenarios

### Test 1: Basic Image Upload and Display

**Steps:**
1. Start the application
2. Open chat interface
3. Click image upload button
4. Select a 3MB JPEG image
5. Observe compression progress
6. Verify preview appears in chat input area

**Expected Results:**
- ✅ Image is compressed (check file size < 1MB)
- ✅ Preview thumbnail displays correctly
- ✅ No console errors
- ✅ Upload completes in < 5 seconds

**Database Verification:**
```sql
SELECT id, file_size, mime_type, storage_path, conversation_id
FROM uploaded_images
ORDER BY created_at DESC
LIMIT 1;

-- Expected:
-- - file_size should be < 1MB (if original > 1MB)
-- - conversation_id should be NULL (not sent yet)
-- - storage_path format: {user_id}/{timestamp}_{random}.jpg
```

---

### Test 2: Anthropic Image Vision

**Steps:**
1. Upload a screenshot or diagram
2. Type: "What do you see in this image?"
3. Select provider: **Anthropic** (or let auto-route)
4. Send message

**Expected Results:**
- ✅ Router selects Claude Sonnet 3.5
- ✅ Response describes image accurately
- ✅ No "base64 encoding failed" errors
- ✅ Response time < 15 seconds

**Edge Function Logs to Check:**
```
[Router] Task Type: vision_analysis
[Router] Selected Provider: anthropic
[Images] Processing 1 images for provider: anthropic
[Images] ✅ Base64 encoded for {image-id}
[API CALL] Anthropic messages count: 3
```

**Database Verification:**
```sql
SELECT content, metadata
FROM ai_messages
WHERE role = 'user'
ORDER BY created_at DESC
LIMIT 1;

-- metadata should contain:
-- - "attached_image_ids": ["uuid-here"]
```

---

### Test 3: Gemini Flash Quick Vision

**Steps:**
1. Upload a simple image (logo, icon, etc.)
2. Type: "What is this?"
3. Let router auto-select (should choose Gemini Flash)
4. Send message

**Expected Results:**
- ✅ Router detects quick question pattern
- ✅ Routes to Gemini Flash (cost-effective)
- ✅ Fast response (< 5 seconds)
- ✅ Accurate identification

**Edge Function Logs to Check:**
```
[Router] Task Type: vision_quick
[Router] Selected Provider: gemini
[Router] Reasoning: Image detected (1). Using Gemini Flash...
[Images] ✅ Base64 encoded for {image-id}
[API CALL] Gemini contents count: 4
```

---

### Test 4: OpenAI GPT-4o with Signed URLs

**Steps:**
1. Upload a complex image (chart, multiple objects)
2. Type: "Analyze this image in detail"
3. Select provider: **OpenAI** or let auto-route
4. Send message

**Expected Results:**
- ✅ Router selects GPT-4o
- ✅ Uses signed URLs (NOT base64)
- ✅ Detailed analysis response
- ✅ Faster processing than Anthropic/Gemini

**Edge Function Logs to Check:**
```
[Router] Selected Provider: openai
[Images] ✅ Signed URL created for {image-id}
[API CALL] OpenAI messages count: 4
```

**Performance Verification:**
```bash
# Check Edge Function memory usage in Supabase logs
# OpenAI requests should use ~10MB vs ~50MB for others
```

---

### Test 5: Multiple Images (Router Intelligence)

**Steps:**
1. Upload 3+ images
2. Type: "Compare these images"
3. Let router auto-select
4. Send message

**Expected Results:**
- ✅ Router detects imageCount >= 3
- ✅ Routes to GPT-4o (best for multimodal)
- ✅ Reasoning mentions "Images detected (3)"
- ✅ All images processed successfully

**Edge Function Logs to Check:**
```
[Router] Task Type: multimodal_heavy
[Router] Reasoning: Images detected (3). Using GPT-4o...
[Images] Processing 3 images for provider: openai
[Images] Successfully processed 3/3 images
```

---

### Test 6: Single Image Failure (Graceful Degradation)

**Steps:**
1. Manually corrupt one image record in database:
   ```sql
   UPDATE uploaded_images
   SET storage_path = 'invalid/path.jpg'
   WHERE id = '{some-image-id}';
   ```
2. Upload 2 more valid images
3. Send message with all 3 image IDs
4. Observe response

**Expected Results:**
- ✅ Error logged for corrupted image
- ✅ Other 2 images process successfully
- ✅ Request doesn't fail completely
- ✅ Response includes content from valid images

**Edge Function Logs to Check:**
```
[Images] Error processing image {corrupted-id}: ...
[Images] ✅ Signed URL created for {valid-id-1}
[Images] ✅ Signed URL created for {valid-id-2}
[Images] Successfully processed 2/3 images
```

---

### Test 7: Orphan Cleanup System

**Steps:**
1. Upload 3 images without sending message
2. Close browser tab (images orphaned)
3. Manually advance time by 25 hours (or wait):
   ```sql
   UPDATE uploaded_images
   SET created_at = NOW() - INTERVAL '25 hours'
   WHERE conversation_id IS NULL;
   ```
4. Run cleanup function:
   ```sql
   SELECT * FROM cleanup_orphaned_images();
   ```

**Expected Results:**
- ✅ Function returns deleted_count = 3
- ✅ storage_paths array contains 3 paths
- ✅ Images removed from database
- ✅ Entry created in `uploaded_images_cleanup_log`

**Verification:**
```sql
-- Check cleanup log
SELECT * FROM uploaded_images_cleanup_log
ORDER BY executed_at DESC
LIMIT 1;

-- Verify orphans deleted
SELECT COUNT(*) FROM uploaded_images
WHERE conversation_id IS NULL
AND created_at < NOW() - INTERVAL '24 hours';
-- Should return: 0
```

---

### Test 8: Compression Effectiveness

**Steps:**
1. Prepare test images:
   - 5MB JPEG (should compress)
   - 800KB PNG (should NOT compress)
   - 10MB TIFF (should reject)
2. Upload each one sequentially
3. Check file sizes in database

**Expected Results:**

| Original Size | Expected Behavior | Final Size |
|---------------|-------------------|------------|
| 5MB JPEG | Compress | < 1MB |
| 800KB PNG | No compression | ~800KB |
| 10MB TIFF | Reject | N/A |

**Verification:**
```sql
SELECT
  original_filename,
  file_size,
  mime_type,
  CASE
    WHEN file_size < 1024 * 1024 THEN '✅ Optimized'
    ELSE '⚠️ Large'
  END as status
FROM uploaded_images
ORDER BY created_at DESC
LIMIT 3;
```

---

### Test 9: Security - Cross-User Access

**Setup:**
1. Create two user accounts (User A, User B)
2. User A uploads image and notes the image ID
3. Log in as User B

**Steps:**
1. Try to query User A's image:
   ```typescript
   const { data } = await supabase
     .from('uploaded_images')
     .select('*')
     .eq('id', userA_imageId);
   // Should return empty array
   ```

2. Try to download from storage:
   ```typescript
   const { data } = await supabase.storage
     .from('chat-uploads')
     .download(userA_storagePath);
   // Should fail with permission error
   ```

**Expected Results:**
- ✅ User B cannot see User A's image in database
- ✅ User B cannot download User A's image from storage
- ✅ Signed URLs from User A fail when accessed by User B
- ✅ RLS policies block all unauthorized access

---

### Test 10: Provider-Specific Message Format

**Setup:**
Use browser DevTools Network tab to inspect Edge Function requests

**Anthropic Format Check:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "..." },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "iVBORw0KG..."
          }
        }
      ]
    }
  ]
}
```

**Gemini Format Check:**
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "..." },
        {
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "iVBORw0KG..."
          }
        }
      ]
    }
  ]
}
```

**OpenAI Format Check:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "..." },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://xxx.supabase.co/storage/v1/object/sign/..."
          }
        }
      ]
    }
  ]
}
```

---

## 🎭 Performance Benchmarks

### Baseline Measurements

Run these tests with DevTools Performance tab open:

| Scenario | Metric | Target | Test Result |
|----------|--------|--------|-------------|
| Upload 2MB image | Time to compress | < 3s | ___ |
| Send to Anthropic | Edge Function time | < 10s | ___ |
| Send to Gemini | Edge Function time | < 8s | ___ |
| Send to OpenAI | Edge Function time | < 5s | ___ |
| 3 images to GPT-4o | Total processing | < 15s | ___ |

### Memory Benchmarks

Check Edge Function logs for memory usage:

| Provider | Expected Memory | Actual Memory |
|----------|----------------|---------------|
| Anthropic | ~40-50MB | ___ |
| Gemini | ~40-50MB | ___ |
| OpenAI | ~10-15MB | ___ |

**Why OpenAI is lower:**
- Uses signed URLs (no download)
- No base64 encoding in Edge Function
- Direct download by OpenAI's servers

---

## 🐛 Common Issues & Solutions

### Issue: "Failed to create signed URL"

**Symptoms:**
- Error in Edge Function logs
- Images work with Anthropic but not OpenAI

**Solution:**
```sql
-- Check service role policy exists
SELECT * FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname LIKE '%service%';

-- If missing, add policy:
CREATE POLICY "Service role can access all images"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'chat-uploads');
```

---

### Issue: Images not compressing

**Symptoms:**
- File sizes remain large (> 2MB)
- No compression logs in console

**Solution:**
1. Check COMPRESSION_THRESHOLD in imageStorageService.ts
2. Verify it's set to `1 * 1024 * 1024` (1MB)
3. Clear browser cache
4. Test with fresh image upload

---

### Issue: Router not selecting vision models

**Symptoms:**
- Claude Sonnet selected even with images
- Vision analysis fails

**Solution:**
1. Check router logic at line ~127 in Edge Function
2. Verify imageCount is being passed correctly
3. Check logs for: `[Router] Task Type: vision_analysis`
4. Ensure `imageIds?.length` is not undefined

---

### Issue: Orphaned images accumulating

**Symptoms:**
- Storage usage growing
- Many images with NULL conversation_id

**Solution:**
```sql
-- Manual cleanup
SELECT * FROM cleanup_orphaned_images();

-- Check results
SELECT deleted_count, executed_at
FROM uploaded_images_cleanup_log
ORDER BY executed_at DESC
LIMIT 1;

-- Enable cron job
SELECT cron.schedule(
  'cleanup-orphaned-images',
  '0 3 * * *',
  $$SELECT cleanup_orphaned_images();$$
);
```

---

## ✅ Final Verification Checklist

Before marking implementation complete, verify:

- [ ] All 3 providers (Anthropic, Gemini, OpenAI) handle images correctly
- [ ] Compression reduces files to < 1MB when needed
- [ ] Router intelligently selects vision models when images present
- [ ] OpenAI uses signed URLs (check Edge Function logs)
- [ ] Anthropic/Gemini use base64 (check Edge Function logs)
- [ ] Single image failure doesn't break entire request
- [ ] Orphan cleanup function works correctly
- [ ] RLS prevents cross-user image access
- [ ] Database foreign key cascade deletes work
- [ ] Performance meets benchmarks (OpenAI < 5s)

---

## 📊 Success Metrics

Track these metrics in production:

1. **Image Processing Success Rate**: Target > 98%
2. **Average Response Time (with images)**: Target < 10s
3. **Compression Effectiveness**: Average 70% size reduction
4. **Vision Model Routing Accuracy**: Target > 95%
5. **Orphan Image Rate**: Target < 5% of total uploads

---

**Testing Guide Version**: 1.0.0
**Last Updated**: 2025-11-18
**Status**: Ready for QA
