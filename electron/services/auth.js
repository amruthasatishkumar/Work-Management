'use strict';

const { PublicClientApplication } = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// SETUP REQUIRED — Azure App Registration
//
// Before distributing this app you must create an App Registration in Azure:
//
//  1. Go to https://portal.azure.com
//  2. Search for "Entra ID" (or "Azure Active Directory") in the top search bar
//  3. In the left sidebar click "App registrations" → "New registration"
//  4. Fill in:
//       Name:                    Work Management Desktop
//       Supported account types: Accounts in this organizational directory only
//                                (single-tenant — only your org can log in)
//       Redirect URI:            Select "Mobile and desktop applications"
//                                Enter:  http://localhost
//  5. Click "Register"
//  6. On the Overview page copy:
//       "Application (client) ID"  → paste below as CLIENT_ID
//       "Directory (tenant) ID"    → paste below as TENANT_ID
//  7. No client secret is needed — this uses the public client / device flow.
// ─────────────────────────────────────────────────────────────────────────────
const CLIENT_ID = '2c02d39a-2f51-4592-adfe-73663dcaf4da';   // ← paste after App Registration
const TENANT_ID = 'fd3c2c44-d784-4e14-b908-ac428f3d8022';   // ← paste after App Registration

const SCOPES = ['User.Read'];

/**
 * Creates an auth service that handles Microsoft sign-in for a single user.
 * Tokens are cached to disk so subsequent launches are silent (no popup).
 *
 * @param {string} userDataPath  Electron's app.getPath('userData')
 * @param {(url: string) => Promise<void>} openBrowser  Callback to open the auth URL (e.g. shell.openExternal)
 */
function createAuthService(userDataPath, openBrowser) {
  const tokenCachePath = path.join(userDataPath, 'msal_cache.json');

  /** MSAL persistent cache — reads/writes the JSON file on disk */
  const cachePlugin = {
    beforeCacheAccess: async (cacheContext) => {
      if (fs.existsSync(tokenCachePath)) {
        cacheContext.tokenCache.deserialize(fs.readFileSync(tokenCachePath, 'utf-8'));
      }
    },
    afterCacheAccess: async (cacheContext) => {
      if (cacheContext.cacheHasChanged) {
        fs.mkdirSync(path.dirname(tokenCachePath), { recursive: true });
        fs.writeFileSync(tokenCachePath, cacheContext.tokenCache.serialize(), 'utf-8');
      }
    },
  };

  const pca = new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    },
    cache: { cachePlugin },
  });

  /**
   * Sign the user in.
   * - First tries a silent token refresh (cached from a previous session).
   * - If that fails or no cached account, opens the user's default browser for
   *   interactive Microsoft login and waits for the result.
   *
   * @returns {{ userId: string, displayName: string }}
   */
  async function signIn() {
    // Silent path — reuse a cached account
    const accounts = await pca.getAllAccounts();
    if (accounts.length > 0) {
      try {
        const result = await pca.acquireTokenSilent({
          scopes: SCOPES,
          account: accounts[0],
        });
        return toUser(result);
      } catch {
        // Token expired or revoked — fall through to interactive
      }
    }

    // Interactive path — opens browser, user logs in, result returned via localhost redirect
    const result = await pca.acquireTokenInteractive({
      scopes: SCOPES,
      openBrowser,
      successTemplate: `
        <!DOCTYPE html><html><body style="font-family:'Segoe UI',sans-serif;text-align:center;padding:60px;background:#f3f2f1">
        <h2 style="color:#107c10">✓ Signed in successfully</h2>
        <p>You can close this browser tab and return to the app.</p>
        </body></html>`,
      errorTemplate: `
        <!DOCTYPE html><html><body style="font-family:'Segoe UI',sans-serif;text-align:center;padding:60px;background:#f3f2f1">
        <h2 style="color:#a80000">Sign-in failed</h2>
        <p>Please close this tab and try again.</p>
        </body></html>`,
    });
    return toUser(result);
  }

  /**
   * Sign the current user out (clears the token cache).
   */
  async function signOut() {
    const accounts = await pca.getAllAccounts();
    if (accounts.length > 0) {
      await pca.clearCache();
    }
    if (fs.existsSync(tokenCachePath)) {
      fs.unlinkSync(tokenCachePath);
    }
  }

  function toUser(result) {
    return {
      // localAccountId is the immutable Entra object ID — safe DB filename key
      userId: result.account.localAccountId,
      displayName: result.account.name || result.account.username,
      email: result.account.username,
    };
  }

  return { signIn, signOut };
}

module.exports = { createAuthService };
