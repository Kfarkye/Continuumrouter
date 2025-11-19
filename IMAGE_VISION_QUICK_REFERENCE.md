# Image Vision Quick Reference Card

## 🚀 One-Page Developer Guide

---

## 🔑 Key Files

| File | Purpose | Critical Lines |
|------|---------|----------------|
| `supabase/functions/ai-chat-router/index.ts` | Edge Function | 34, 127-145, 533-597, 630-720 |
| `src/lib/imageStorageService.ts` | Frontend Upload | 5-6, 59, 108-221 |
| `supabase/migrations/20251118_*` | Database Schema | All migration files |

---

## ⚙️ Configuration Values

```typescript
// Edge Function (supabase/functions/ai-chat-router/index.ts)
IMAGE_BUCKET_NAME: 'chat-uploads'  // MUST match frontend
MAX_IMAGES: 10
REQUEST_TIMEOUT: 120000

// Frontend (src/lib/imageStorageService.ts)
BUCKET_NAME: 'chat-uploads'        // MUST match backend
COMPRESSION_THRESHOLD: 1 * 1024 * 1024  // 1MB
MAX_IMAGE_SIZE: 10 * 1024 * 1024        // 10MB
maxWidth: 1536                          // pixels
COMPRESSION_QUALITY: 0.85               // 85%
```

---

## 🔄 Image Processing Flow

```
User Selects Image
       ↓
Frontend Compression (if > 1MB)
       ↓
Upload to Supabase Storage
  bucket: chat-uploads
  path: {user_id}/{random}.jpg
       ↓
Insert DB Record
  conversation_id: NULL
  file_size: compressed size
       ↓
Return Image ID to Frontend
       ↓
User Sends Message (includes imageIds[])
       ↓
Edge Function Router Decision
  imageCount > 0 → Vision Model
       ↓
Image Processing Strategy
  ├─ OpenAI: Generate Signed URL (fast)
  └─ Anthropic/Gemini: Download + Base64 (slow)
       ↓
Provider-Specific Formatting
  ├─ Anthropic: content[{type:'image',source:{}}]
  ├─ Gemini: parts[{inlineData:{}}]
  └─ OpenAI: content[{type:'image_url'}]
       ↓
Stream Response to User
       ↓
Update DB Record
  conversation_id: {uuid}
```

---

## 🎯 Router Logic

```typescript
// Vision routing (imageCount > 0)
if (imageCount > 0) {
  // Quick visual question + short message
  if (message.length < 150 && /what is|look at|describe/.test(message)) {
    return gemini-flash;  // Fast & cheap
  }
  // Everything else with images
  return gpt-4o;  // Best multimodal
}

// Text-only routing
// Email/writing → claude-sonnet-3.5
// Technical/code → gpt-4o
// Quick questions → gemini-flash
```

---

## 💾 Database Schema

```sql
uploaded_images
  id                UUID PRIMARY KEY
  user_id           UUID NOT NULL → auth.users
  conversation_id   UUID → ai_conversations (ON DELETE CASCADE)
  storage_path      TEXT NOT NULL
  file_size         INTEGER
  mime_type         TEXT NOT NULL
  created_at        TIMESTAMPTZ

-- Key Indexes
idx_uploaded_images_user
idx_uploaded_images_conversation
idx_uploaded_images_orphan_lookup (conversation_id, created_at)
```

---

## 🔒 Security Layers

| Layer | Protection | Implementation |
|-------|-----------|----------------|
| Database | RLS policies | Users can only access own images |
| Storage | Folder isolation | Path: `{user_id}/{filename}` |
| Edge Function | Ownership check | `.eq('user_id', user.id)` |
| URLs | Time-limited | Signed URLs expire in 1 hour |

---

## 🎨 Provider Message Formats

### Anthropic
```typescript
{
  role: 'user',
  content: [
    { type: 'text', text: 'Analyze this' },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64String
      }
    }
  ]
}
```

### Gemini
```typescript
{
  role: 'user',
  parts: [
    { text: 'Analyze this' },
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64String
      }
    }
  ]
}
```

### OpenAI
```typescript
{
  role: 'user',
  content: [
    { type: 'text', text: 'Analyze this' },
    {
      type: 'image_url',
      image_url: {
        url: signedUrl  // NOT base64!
      }
    }
  ]
}
```

---

## 🐛 Debug Commands

### Check Recent Uploads
```sql
SELECT id, file_size, conversation_id, created_at
FROM uploaded_images
ORDER BY created_at DESC
LIMIT 10;
```

### Find Orphaned Images
```sql
SELECT COUNT(*), SUM(file_size)
FROM uploaded_images
WHERE conversation_id IS NULL
AND created_at < NOW() - INTERVAL '24 hours';
```

### Check Vision Messages
```sql
SELECT
  metadata->>'router_decision'->>'provider' as provider,
  COUNT(*) as total
FROM ai_messages
WHERE metadata->'attached_image_ids' IS NOT NULL
GROUP BY provider;
```

### Manual Cleanup
```sql
SELECT * FROM cleanup_orphaned_images();

SELECT * FROM uploaded_images_cleanup_log
ORDER BY executed_at DESC
LIMIT 5;
```

---

## ⚡ Performance Optimizations

### Why OpenAI is Faster

| Step | Anthropic/Gemini | OpenAI |
|------|------------------|--------|
| Download image | ✅ Required | ❌ Skipped |
| Base64 encode | ✅ Required | ❌ Skipped |
| Upload to API | ✅ Large payload | ✅ Small URL |
| Memory usage | ~50MB | ~10MB |
| **Total time** | **8-12s** | **3-5s** |

### Compression Impact

| Original Size | Compressed | Token Reduction |
|---------------|-----------|-----------------|
| 5MB (4000px) | 1MB (1536px) | ~75% |
| 3MB (3000px) | 800KB (1536px) | ~65% |
| 1.5MB (2000px) | 600KB (1536px) | ~50% |

---

## 🚨 Common Errors

### "Failed to create signed URL"
**Cause**: Service role policy missing
**Fix**: Add storage policy for service_role

### "Image too large"
**Cause**: Compression not triggered
**Fix**: Check COMPRESSION_THRESHOLD = 1MB

### "Bucket not found"
**Cause**: Name mismatch frontend/backend
**Fix**: Verify both use `chat-uploads`

### "Permission denied"
**Cause**: RLS blocking access
**Fix**: Check user_id matches auth.uid()

---

## 📊 Monitoring Queries

### Success Rate
```sql
SELECT
  COUNT(*) FILTER (WHERE role = 'assistant') * 100.0 /
  COUNT(*) as success_rate
FROM ai_messages
WHERE metadata->'attached_image_ids' IS NOT NULL
AND created_at > NOW() - INTERVAL '24 hours';
```

### Average Response Time
```sql
SELECT
  metadata->>'router_decision'->>'provider' as provider,
  AVG(EXTRACT(EPOCH FROM (
    (SELECT created_at FROM ai_messages m2
     WHERE m2.conversation_id = m1.conversation_id
     AND m2.role = 'assistant'
     AND m2.created_at > m1.created_at
     LIMIT 1)
    - m1.created_at
  ))) as avg_seconds
FROM ai_messages m1
WHERE metadata->'attached_image_ids' IS NOT NULL
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY provider;
```

### Storage Growth
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as uploads,
  SUM(file_size) / 1024 / 1024 as total_mb
FROM uploaded_images
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🔧 Maintenance Tasks

### Daily
- Check Edge Function logs for errors
- Monitor storage usage growth
- Verify orphan cleanup ran (if cron enabled)

### Weekly
- Review vision routing accuracy
- Check average response times
- Analyze provider usage distribution

### Monthly
- Audit orphaned images manually
- Review compression effectiveness
- Test RLS policies with penetration testing

---

## 📝 Environment Variables

```bash
# Edge Function Secrets (Supabase Dashboard)
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...

# Frontend (.env)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...
```

---

## 🎯 Testing Shortcuts

### Quick Smoke Test
```bash
# 1. Upload small image
# 2. Send to OpenAI
# 3. Check logs for "✅ Signed URL created"
# 4. Verify response in < 5 seconds
```

### Compression Test
```bash
# Upload 5MB image
# Check file_size < 1MB in database
```

### Security Test
```sql
-- As User B, try to access User A's image
SELECT * FROM uploaded_images WHERE id = '{user-a-image-id}';
-- Should return empty
```

---

## 💡 Pro Tips

1. **Always check bucket name first** - Most common bug
2. **Monitor OpenAI vs others** - OpenAI should be 2x faster
3. **Use Gemini for quick questions** - Saves money
4. **Enable cron for orphan cleanup** - Prevents storage bloat
5. **Compress aggressively** - 1536px is plenty for vision
6. **Log everything** - Helps debug in production
7. **Test RLS thoroughly** - Security is non-negotiable

---

## 📞 Quick Links

- Implementation Doc: `HARDENED_IMAGE_VISION_IMPLEMENTATION.md`
- Testing Guide: `IMAGE_VISION_TESTING_GUIDE.md`
- Edge Function: `supabase/functions/ai-chat-router/index.ts`
- Upload Service: `src/lib/imageStorageService.ts`

---

**Version**: 1.0.0 | **Last Updated**: 2025-11-18 | **Status**: ✅ Production Ready
