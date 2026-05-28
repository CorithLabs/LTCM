/**
 * Shared Jira helpers — used by jira.js routes and runs.js (comment posting).
 * Encryption helpers are also exported so jira.js can use them for config save/load.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
// db imported lazily inside getConfig to avoid circular dependency

// ---- Encryption ----

function getEncryptionKey() {
  const key = process.env.JIRA_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('JIRA_ENCRYPTION_KEY missing or invalid. Expected 64-char hex string in .env.local.');
  }
  return Buffer.from(key, 'hex');
}

function ensureEncryptionKey() {
  if (process.env.JIRA_ENCRYPTION_KEY) return;
  const key = crypto.randomBytes(32).toString('hex');
  const envPath = path.join(__dirname, '..', '.env.local');
  const line = `\nJIRA_ENCRYPTION_KEY=${key}\n`;
  try {
    fs.appendFileSync(envPath, line, 'utf8');
    process.env.JIRA_ENCRYPTION_KEY = key;
    console.log('  ✓ JIRA_ENCRYPTION_KEY generated and written to .env.local');
  } catch (err) {
    console.warn(`  ⚠ Could not write JIRA_ENCRYPTION_KEY to .env.local: ${err.message}`);
    process.env.JIRA_ENCRYPTION_KEY = key;
  }
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(ciphertext) {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ---- Config ----

async function getConfig() {
  const { queryOne } = require('./db');
  return await queryOne('SELECT * FROM jira_config LIMIT 1') || null;
}

async function getDecryptedConfig() {
  const cfg = await getConfig();
  if (!cfg) return null;
  if (!cfg.api_token_encrypted) return null;
  try {
    return { ...cfg, api_token: decrypt(cfg.api_token_encrypted) };
  } catch {
    return null;
  }
}

// Returns base_url from global config + email/token from per-user credentials.
// Falls back to the first admin user who has Jira credentials configured.
async function getDecryptedConfigForUser(userId) {
  const { queryOne } = require('./db');
  const cfg = await getConfig();
  if (!cfg) return null;
  // Try per-user credentials first
  if (userId) {
    const userCred = await queryOne(
      'SELECT email, api_token_encrypted FROM jira_user_credentials WHERE user_id = $1',
      [userId]
    );
    if (userCred) {
      try {
        return { ...cfg, email: userCred.email, api_token: decrypt(userCred.api_token_encrypted) };
      } catch { /* fall through */ }
    }
  }
  // Fall back to first admin with Jira credentials
  const adminCred = await queryOne(
    `SELECT juc.email, juc.api_token_encrypted
     FROM jira_user_credentials juc
     JOIN users u ON u.id = juc.user_id
     WHERE u.role = 'admin'
     LIMIT 1`
  );
  if (adminCred) {
    try {
      return { ...cfg, email: adminCred.email, api_token: decrypt(adminCred.api_token_encrypted) };
    } catch { /* fall through */ }
  }
  // Legacy: global token on jira_config (kept for backwards compat)
  if (!cfg.api_token_encrypted) return null;
  try {
    return { ...cfg, api_token: decrypt(cfg.api_token_encrypted) };
  } catch {
    return null;
  }
}

// ---- HTTP proxy ----

async function jiraFetch(baseUrl, email, apiToken, urlPath, options = {}) {
  const url = `${baseUrl}/rest/api/3${urlPath}`;
  const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('JIRA_UNREACHABLE'), { code: 'JIRA_UNREACHABLE' });
    throw Object.assign(new Error('JIRA_UNREACHABLE'), { code: 'JIRA_UNREACHABLE' });
  } finally {
    clearTimeout(timeout);
  }
}

// ---- ADF comment builder ----

function buildRunComment(runName, cases) {
  const emoji = { pass: '✅', fail: '❌', skip: '⏭️' };

  const listItems = cases.map(c => ({
    type: 'listItem',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: `${emoji[c.status] || '○'} ${(c.status || 'unmarked').toUpperCase()}`, marks: [{ type: 'strong' }] },
        { type: 'text', text: ` — ${c.suite_name} › ${c.title}` },
        ...(c.note ? [{ type: 'hardBreak' }, { type: 'text', text: `Note: ${c.note}`, marks: [{ type: 'em' }] }] : []),
      ],
    }],
  }));

  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: `🧪 LTCM Run: `, marks: [] },
          { type: 'text', text: `"${runName}"`, marks: [{ type: 'strong' }] },
          { type: 'text', text: ' — COMPLETED' },
        ],
      },
      { type: 'bulletList', content: listItems },
    ],
  };
}

/**
 * Upload a file buffer to a Jira issue as an attachment.
 * Jira requires X-Atlassian-Token: no-check and no Content-Type override (multipart set by fetch).
 */
async function jiraUploadAttachment(baseUrl, email, apiToken, issueKey, buffer, originalName, mimeType) {
  const url = `${baseUrl}/rest/api/3/issue/${issueKey}/attachments`;
  const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');

  const { FormData, Blob } = await import('node:buffer').catch(() => ({}));
  // Use undici FormData or fall back to global FormData (Node 18+)
  const FD = globalThis.FormData || FormData;
  const B = globalThis.Blob || Blob;

  const form = new FD();
  form.append('file', new B([buffer], { type: mimeType || 'application/octet-stream' }), originalName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'X-Atlassian-Token': 'no-check',
        'Accept': 'application/json',
      },
      body: form,
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('JIRA_UNREACHABLE'), { code: 'JIRA_UNREACHABLE' });
    throw Object.assign(new Error('JIRA_UNREACHABLE'), { code: 'JIRA_UNREACHABLE' });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire a Jira transition for every issue linked to a test case.
 * Determines the target Jira status from jira_status_mapping using the LTCM event name.
 * Includes a comment in the transition body crediting the actual executor by name.
 * Silent fail: any error is caught and logged — never throws.
 *
 * event: 'pass' | 'fail' | 'in_progress'
 * executorUsername: name of the user who ran the test (included in the Jira comment)
 */
async function fireJiraTransitions(caseId, event, userId, executorUsername) {
  try {
    const { query, queryOne } = require('./db');

    const mapping = await queryOne(
      'SELECT jira_status_name FROM jira_status_mapping WHERE ltcm_event = $1',
      [event]
    );
    if (!mapping) return;

    const cfg = await getDecryptedConfigForUser(userId);
    if (!cfg || !cfg.api_token) return;

    const links = await query(
      'SELECT jira_issue_key FROM case_jira_links WHERE case_id = $1',
      [caseId]
    );
    if (links.length === 0) return;

    const targetStatus = mapping.jira_status_name.toLowerCase();
    const commentText = executorUsername
      ? `🧪 LTCM: Test marked as ${event.replace('_', ' ')} by ${executorUsername}`
      : `🧪 LTCM: Test marked as ${event.replace('_', ' ')}`;

    const commentBody = {
      version: 1, type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: commentText }] }],
    };

    for (const link of links) {
      const issueKey = link.jira_issue_key;
      try {
        const tRes = await jiraFetch(
          cfg.base_url, cfg.email, cfg.api_token,
          `/issue/${encodeURIComponent(issueKey)}/transitions`
        );
        if (!tRes.ok) continue;
        const tData = await tRes.json();
        const transition = (tData.transitions || []).find(
          t => t.to?.name?.toLowerCase() === targetStatus
        );
        if (!transition) continue;

        await jiraFetch(
          cfg.base_url, cfg.email, cfg.api_token,
          `/issue/${encodeURIComponent(issueKey)}/transitions`,
          {
            method: 'POST',
            body: JSON.stringify({
              transition: { id: transition.id },
              update: { comment: [{ add: { body: commentBody } }] },
            }),
          }
        );
      } catch (err) {
        console.warn(`[jira-transition] ${issueKey} silent fail: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`[jira-transition] outer silent fail: ${err.message}`);
  }
}

/**
 * Create a Jira remote link (web link) on an issue pointing back to the LTCM test case.
 * Stores the returned remote link ID so it can be deleted later.
 * Silent fail — never throws.
 */
async function addJiraRemoteLink(issueKey, linkId, caseTitle, ltcmBaseUrl, caseUrl, cfg) {
  try {
    if (!ltcmBaseUrl || !cfg || !cfg.api_token) return null;
    const body = {
      globalId: `ltcm-case-${linkId}`,
      application: { type: 'com.ltcm', name: 'LTCM' },
      relationship: 'tests',
      object: {
        url: caseUrl,
        title: `LTCM: ${caseTitle}`,
        icon: { url16x16: `${ltcmBaseUrl}/favicon.ico`, title: 'LTCM' },
        status: { resolved: false, icon: {} },
      },
    };
    const res = await jiraFetch(
      cfg.base_url, cfg.email, cfg.api_token,
      `/issue/${encodeURIComponent(issueKey)}/remotelink`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.id ? String(data.id) : null;
  } catch (err) {
    console.warn(`[jira-remotelink] add silent fail for ${issueKey}: ${err.message}`);
    return null;
  }
}

/**
 * Delete a Jira remote link by its ID.
 * Silent fail — never throws.
 */
async function removeJiraRemoteLink(issueKey, remoteLinkId, cfg) {
  try {
    if (!remoteLinkId || !cfg || !cfg.api_token) return;
    await jiraFetch(
      cfg.base_url, cfg.email, cfg.api_token,
      `/issue/${encodeURIComponent(issueKey)}/remotelink/${encodeURIComponent(remoteLinkId)}`,
      { method: 'DELETE' }
    );
  } catch (err) {
    console.warn(`[jira-remotelink] remove silent fail for ${issueKey}: ${err.message}`);
  }
}

module.exports = {
  getEncryptionKey,
  ensureEncryptionKey,
  encrypt,
  decrypt,
  getConfig,
  getDecryptedConfig,
  getDecryptedConfigForUser,
  jiraFetch,
  jiraUploadAttachment,
  buildRunComment,
  fireJiraTransitions,
  addJiraRemoteLink,
  removeJiraRemoteLink,
};
