# Issue Reporting - Quick Start Guide

## For End Users

### How to Report an Issue

1. Click the **⚠️ Report Issue** button in the top navbar
2. Fill in the form:
   - **Issue Title** (required) — e.g., "App crashes on startup"
   - **Description** — What were you doing when it happened?
   - **Comment** (optional) — Any extra details
3. Click **Send Report**
4. Your default email client will open with an encrypted file
5. Send the file to **hi@osmosis.page**

That's it! The issue report is encrypted, so only the recipient can read it.

---

## For Server/Recipient Setup

### 1. Generate GPG Key (Already Done)

The app comes with a hardcoded public key for `hi@osmosis.page`. The private key should be on your server.

**Verify the key:**
```bash
gpg --list-keys hi@osmosis.page
```

### 2. Receive Encrypted Reports

Users will email encrypted `.asc` files to `hi@osmosis.page`.

### 3. Decrypt Reports

```bash
gpg --decrypt issue-1234567890.asc
# Or with output to file:
gpg --decrypt issue-1234567890.asc > issue.json
cat issue.json
```

### 4. Parse the JSON

The decrypted content is JSON:
```json
{
  "timestamp": "2026-05-21T12:34:56.789Z",
  "type": "issue_report",
  "app": {
    "version": "1.1.0",
    "platform": "linux"
  },
  "issue": {
    "title": "App crashes on startup",
    "description": "Happens every time...",
    "userComment": "Tried restarting"
  }
}
```

### 5. Store/Organize Reports

Create a workflow to:
- Store encrypted files in an archive
- Decrypt and parse into a database
- Send confirmations to users
- Track issue status

---

## Technical Details

### Key Information

- **Key ID**: `7820CC76F4470FBD957CA452A45515A3C5E4AB23`
- **Email**: `hi@osmosis.page`
- **Algorithm**: RSA 4096-bit
- **No passphrase**: Public key can be shared freely

### App Configuration

No configuration needed. The public key is hardcoded in:
```javascript
// src/main/issue-reporter.js
const PUBLIC_KEY = `-----BEGIN PGP...`
```

### Files Involved

- `src/main/issue-reporter.js` — Encryption logic
- `src/renderer/main.js` — UI form
- `src/preload/index.js` — API bridge

---

## Troubleshooting

### "Could not open email client" error

The app needs an email client configured as the default handler for `.asc` files or text files.

**Fix:**
- Linux: `xdg-open` should use your default email client
- macOS: Right-click `.asc` file → Get Info → Open With → select Mail.app
- Windows: Right-click `.asc` file → Open With → select Outlook/Thunderbird

### File not opening

- Try manually navigating to the temp directory:
  - Linux: `/tmp/userscript-browser-issues/`
  - macOS: `/var/folders/.../T/userscript-browser-issues/`
  - Windows: `%TEMP%\userscript-browser-issues\`
- Attach the file manually to an email

### Decryption fails on server

Check that:
1. You have the matching **private key** in GPG
2. The key is in your default keyring: `gpg --list-secret-keys`
3. No passphrase is set (or you provide it when prompted)

---

## Example Workflow

```bash
# Receive email with issue-1716345296.asc attached

# Decrypt to JSON
gpg --decrypt issue-1716345296.asc > /tmp/issue.json

# View the issue
cat /tmp/issue.json | jq .

# Archive encrypted original
cp issue-1716345296.asc ~/issues-archive/

# Process (import to database, etc.)
python3 process_issue.py /tmp/issue.json
```

---

## Security Notes

✅ Encryption happens **before** the file leaves the user's computer  
✅ Only the **private key holder** can read reports  
✅ **No server** involvement in encryption  
✅ Users can verify they're using **your key** (fingerprint visible to them)  

⚠️ Remind users: Don't include passwords, API keys, or PII in reports
