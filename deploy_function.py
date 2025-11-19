#!/usr/bin/env python3
import os
import sys

# Read the function file
with open('supabase/functions/ai-chat-router/index.ts', 'r') as f:
    function_content = f.read()

# Output for verification
print(f"Function content length: {len(function_content)} characters")
print(f"First 200 chars: {function_content[:200]}")
print("\nFunction is ready to deploy via Supabase MCP tool")
print("The file has been updated with fixes for:")
print("  1. Database column: content_text -> content")
print("  2. Router decision: explicit property assignment")  
print("  3. Enhanced logging for debugging")
