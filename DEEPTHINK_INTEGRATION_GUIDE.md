# DeepThink Frontend Integration Guide

## Quick Integration Steps

The DeepThink interface component has been created and is ready to integrate into your application. Here's how to add it:

### 1. Add DeepThink to Sidebar Navigation

Update `src/components/Sidebar.tsx` to include a DeepThink space option:

```typescript
// Add this to your sidebar items/sessions list
const deepThinkSpace = {
  id: 'deepthink',
  name: 'DeepThink',
  icon: <Brain className="w-5 h-5" />, // Import Brain from lucide-react
  description: 'Advanced multi-pass reasoning'
};
```

### 2. Update App.tsx to Handle DeepThink Space

Modify `src/App.tsx` to conditionally render the DeepThink interface:

```typescript
import { DeepThinkInterface } from './components/DeepThinkInterface';

// In your render logic:
return (
  <div className="h-screen w-screen flex bg-zinc-900">
    <Sidebar
      sessions={sessions}
      currentSessionId={appState.currentSessionId}
      onNewSession={handleNewSession}
      onSwitchSession={handleSwitchSession}
      onDeleteSession={handleDeleteSession}
      onSignOut={handleSignOut}
      // Add DeepThink navigation
      onNavigateToDeepThink={() => setAppState(prev => ({ ...prev, mode: 'deepthink' }))}
    />

    {appState.mode === 'deepthink' ? (
      <DeepThinkInterface userId={user.id} />
    ) : (
      <ChatInterface
        sessionId={appState.currentSessionId}
        // ... other props
      />
    )}
  </div>
);
```

### 3. Add Mode to AppState

Update `src/types.ts` to include a mode field:

```typescript
export interface AppState {
  currentSessionId: string | null;
  sidebarOpen: boolean;
  mode?: 'chat' | 'deepthink'; // Add this
}
```

### 4. Update Sidebar Component

Add a DeepThink button to your sidebar:

```typescript
<button
  onClick={onNavigateToDeepThink}
  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transition-all"
>
  <Brain className="w-5 h-5" />
  <div className="flex-1 text-left">
    <div className="font-medium">DeepThink</div>
    <div className="text-xs opacity-80">Advanced reasoning</div>
  </div>
</button>
```

## Alternative: Standalone Page

If you prefer DeepThink as a separate page, you can:

1. Create a route for `/deepthink`
2. Mount `<DeepThinkInterface userId={user.id} />` directly
3. Add navigation link in your app header/sidebar

## Usage Flow

1. User clicks "DeepThink" in the sidebar
2. DeepThinkInterface renders with introduction
3. User enters complex query
4. System shows real-time progress through phases:
   - Planning → Evidence → Solving → Verifying
5. Final verified result displayed with citations
6. User can start a new analysis

## Component Props

```typescript
interface DeepThinkInterfaceProps {
  userId: string; // Required: authenticated user ID
}
```

## Features Included

- ✅ Real-time SSE streaming of progress
- ✅ Visual phase indicators (Planning, Evidence, Solving, Verifying)
- ✅ Structured plan display
- ✅ Evidence snippets with citations
- ✅ Solution candidate tracking
- ✅ Final result with markdown support
- ✅ Quality score and verification status
- ✅ Error handling and retry
- ✅ Responsive design

## Styling

The component uses:
- Tailwind CSS classes matching your existing design system
- Lucide React icons
- Dark theme with zinc/blue/purple color scheme
- Glassmorphism effects consistent with your app

## API Requirements

The component expects:
1. `ai_lanes` table to have a record with name `'deepthink_lane_gemini_v2_1_plus'`
2. DeepThink edge function deployed at `/functions/v1/deepthink`
3. User to be authenticated (via Supabase auth)

## Testing Checklist

Before going live:

- [ ] Database migration applied successfully
- [ ] Lane configuration inserted into `ai_lanes` table
- [ ] Edge function deployed and accessible
- [ ] Environment variables configured (GEMINI_API_KEY, etc.)
- [ ] User can authenticate and access the interface
- [ ] Submit a test query and verify all phases execute
- [ ] Check that results are persisted in `space_runs` table
- [ ] Verify cost tracking in `ai_cost_ledger`
- [ ] Test error handling with invalid inputs
- [ ] Verify metrics endpoint is accessible

## Example Test Query

Try this query to test the system:

```
Design a scalable architecture for a real-time collaborative code editor
that supports 1000+ concurrent users. Consider performance, conflict
resolution, data persistence, and cost optimization.
```

This should trigger:
- Strategic planning
- Evidence gathering (if search API configured)
- Multiple solution candidates
- Quality verification
- Detailed result with citations

## Next Steps

After integration:

1. **Monitor Usage**: Check `/functions/v1/deepthink/metrics` for operational metrics
2. **Tune Configuration**: Adjust verification threshold and token caps in lane config
3. **Add Analytics**: Track user engagement with DeepThink vs regular chat
4. **Cost Management**: Monitor `ai_cost_ledger` and set budgets per user
5. **User Feedback**: Collect feedback on result quality and adjust accordingly

## Support

If you encounter issues:
1. Check browser console for errors
2. Check Supabase Edge Function logs
3. Query `space_runs` table for execution details
4. Review `ai_run_checks` for verification failures
5. See DEEPTHINK_SETUP.md for troubleshooting
