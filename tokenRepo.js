const pool = require('./db.js');

/**
 * Upsert a user's Zoho tokens
 */
async function saveTokens({
  chatId,
  accessToken,
  refreshToken,
  expiresAt,
  clientId,
  clientSecret
}) {
  const query = `
    INSERT INTO oauth_tokens
      (telegram_user_id, access_token, refresh_token, expires_at,
       client_id, client_secret, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (telegram_user_id) DO UPDATE
      SET access_token  = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at    = EXCLUDED.expires_at,
          client_id     = EXCLUDED.client_id,
          client_secret = EXCLUDED.client_secret,
          updated_at    = NOW();
  `;
  
  await pool.query(query, [
    chatId,
    accessToken,
    refreshToken,
    expiresAt,
    clientId,
    clientSecret
  ]);
}

/**
 * Fetch tokens for a chat; returns null if none.
 */
async function getTokens(chatId) {
  const { rows } = await pool.query(
    'SELECT * FROM oauth_tokens WHERE telegram_user_id = $1 LIMIT 1',
    [chatId]
  );
  return rows[0] || null;
}

/**
 * Check if tokens are expired and need refresh
 */
async function areTokensExpired(chatId) {
  const tokens = await getTokens(chatId);
  if (!tokens) return true;
  
  const now = new Date();
  const expiresAt = new Date(tokens.expires_at);
  
  // Consider expired if less than 5 minutes remaining
  return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
}

module.exports = {
  saveTokens,
  getTokens,
  areTokensExpired
};
