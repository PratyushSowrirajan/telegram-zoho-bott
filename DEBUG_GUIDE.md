# Database Debugging Guide

## Current Issue
The `/connect` command successfully exchanges the authorization code for tokens with Zoho, but the `saveTokens` function is failing to store them in the database, even though `/dbtest` shows the database connection is healthy.

## New Debugging Commands Added

### 1. `/table-info`
**Purpose**: Check if the `oauth_tokens` table exists and verify its structure.

**Expected output if working**:
```
📋 Table Information

✅ Table exists: oauth_tokens
📊 Row count: X

Columns:
• id (bigint)
• telegram_user_id (bigint)
• access_token (text)
• refresh_token (text)
• expires_at (timestamp with time zone)
• client_id (text)
• client_secret (text)
• created_at (timestamp with time zone)
• updated_at (timestamp with time zone)
```

**If this fails**: The table doesn't exist or has wrong structure. Need to run `setup.sql`.

### 2. `/db-query`
**Purpose**: Test the exact same `saveTokens` and `getTokens` functions used by `/connect`.

**Expected output if working**:
```
🧪 Testing token storage...
✅ Test tokens saved successfully!
✅ Test tokens retrieved successfully!

Stored: test_access_[timestamp]
Client ID: test_client_id
Expires: [date]
```

**If this fails**: Shows the exact error message preventing token storage.

### 3. `/check-tokens`
**Purpose**: Check if any tokens are currently stored for your Telegram user ID.

**Expected output if tokens exist**:
```
✅ Tokens Found!

🔑 Access Token: 1000.3b8f9...
🔄 Refresh Token: 1000.1234...
⏰ Expires: [date]
🆔 Client ID: [your client ID]
📅 Updated: [date]
```

**If no tokens**: `❌ No tokens found for your account.`

## Testing Steps

1. **First, test the table structure**:
   Send: `/table-info`
   
   Expected: Should show table exists with 9 columns
   If fails: Table missing - need to run setup.sql in Supabase

2. **Test token storage mechanism**:
   Send: `/db-query`
   
   Expected: Should save and retrieve test tokens successfully
   If fails: Shows exact error preventing storage

3. **Check current tokens**:
   Send: `/check-tokens`
   
   Expected: Shows if any tokens exist from previous /connect attempts

4. **Try /connect again**:
   Send: `/connect`
   Follow the flow with your Zoho credentials
   
   Expected: Should now show "✅ Connection Successful!" instead of "⚠️ Partial Success"

## Common Issues to Look For

### Issue 1: Table Missing
- `/table-info` shows table doesn't exist
- **Fix**: Run the `setup.sql` script in Supabase SQL editor

### Issue 2: Permission Error
- `/db-query` shows permission denied
- **Fix**: Check Supabase database user permissions

### Issue 3: Data Type Mismatch
- `/db-query` shows type conversion error
- **Fix**: Check if `chatId` is being passed as correct type (bigint)

### Issue 4: Connection Pool Issues
- `/db-query` works but `/connect` fails
- **Fix**: May be transaction or connection timing issue

## What to Report

Please test these commands and report back:

1. **Output of `/table-info`** - to confirm table structure
2. **Output of `/db-query`** - to see exact error in token storage
3. **Output of `/check-tokens`** - to see current state
4. **Any error messages** - full text of any errors shown

This will help pinpoint exactly why `saveTokens` is failing during the `/connect` flow.

## Next Steps After Debugging

Once we identify the root cause, we can:
- Fix the table schema if needed
- Fix permission issues if needed  
- Fix data type conversion if needed
- Add better error handling to prevent silent failures
- Restore the `/leads` command once token storage is working

The good news is that the OAuth flow with Zoho is working perfectly - we just need to fix the database storage step.
