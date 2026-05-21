# Encrypted Issue Reporting System

## Overview

The app includes an encrypted issue reporting system that lets users securely report bugs. All reports are encrypted with GPG before being sent, ensuring only you can decrypt them on your server.

## How It Works

### User Flow

1. **Click "Report Issue"** button (⚠️ icon) in the navbar
2. **Fill out the form:**
   - **Title** (required): Brief description of the problem
   - **Description**: What were you doing when it happened?
   - **Comment** (optional): Any extra info
3. **Click "Send Report"**
4. The app encrypts the data with your GPG public key
5. System opens the encrypted file in the user's default email client
6. User sends the encrypted `.asc` file to `hi@osmosis.page`

### What Gets Encrypted

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
    "description": "Happens every time I open the app",
    "userComment": "Tried reinstalling but didn't help"
  }
}
```

## Architecture

### Files Modified

- **`src/main/issue-reporter.js`** - Encryption & file handling
  - Uses system `gpg` command to encrypt
  - Saves encrypted file to system temp directory
  - Opens file with default app (email client)

- **`src/main/ipc.js`** - IPC handler for issue reporting

- **`src/preload/index.js`** - Exposes issue API to renderer
  - `window.electronAPI.issue.report(data)`

- **`src/renderer/main.js`** - UI logic
  - `wireIssuePanel()` - Event listeners
  - `submitIssueReport()` - Form submission
  - `clearIssueForm()` - Reset form

- **`src/renderer/index.html`** - Issue dialog HTML

- **`src/renderer/styles.css`** - Issue panel styling

## GPG Key Details

**Email**: `hi@osmosis.page`  
**Key ID**: `7820CC76F4470FBD957CA452A45515A3C5E4AB23`

The public key is hardcoded in `src/main/issue-reporter.js` so the app can encrypt without any configuration.

### To Decrypt on Your Server

```bash
gpg --decrypt issue-*.asc
```

You'll need the corresponding private key in your GPG keyring.

## File Locations

**Temporary Storage (before user sends):**
- Linux: `/tmp/userscript-browser-issues/issue-*.asc`
- macOS: `/var/folders/.../T/userscript-browser-issues/issue-*.asc`
- Windows: `%TEMP%\userscript-browser-issues\issue-*.asc`

Files are automatically cleaned up by the OS temp directory cleanup process.

## Security Considerations

✅ **Encrypted before transmission** - GPG public key only (asymmetric)  
✅ **User controls delivery** - Opens native email client  
✅ **No server communication** - Works completely offline  
✅ **No credentials stored** - Public key is hardcoded  

⚠️ **User awareness** - Users should be reminded not to include sensitive personal data in reports

## Implementation Details

### Main Process Flow

```
User submits form
  ↓
Encrypt JSON with GPG (using hi@osmosis.page key)
  ↓
Save to temp directory as issue-<timestamp>.asc
  ↓
Open file with shell.openPath() → default email client
  ↓
User's email client opens with file attachment
  ↓
User composes email to hi@osmosis.page and sends
```

### Error Handling

- If GPG encryption fails → throw error, show in UI
- If file save fails → throw error, show in UI
- If email client can't open → helpful error message
- File is still saved even if email client fails

## Future Enhancements

- [ ] Auto-attach app logs (if available)
- [ ] Include screenshot (optional checkbox)
- [ ] Error tracking integration for uncaught exceptions
- [ ] Rate limiting to prevent spam
- [ ] User email field (optional, for follow-up)
- [ ] Pre-fill title from error messages

## Testing

### Local Development

**Generate test issue:**
1. Run `npm run dev`
2. Click report issue button
3. Fill form and submit
4. Check that email client opens

**Check temp files:**
```bash
ls /tmp/userscript-browser-issues/
cat /tmp/userscript-browser-issues/issue-*.asc
```

**Verify encryption:**
```bash
# Check the file is encrypted
cat /tmp/userscript-browser-issues/issue-*.asc | head -2
# Should show: -----BEGIN PGP MESSAGE-----
```

### Decrypt Test File

If you have the private key:
```bash
gpg --decrypt /tmp/userscript-browser-issues/issue-*.asc
```

### Without Default Email Client

If the user doesn't have a default email client configured, they'll see an error. They can still manually send the file from:
- The temp directory location
- Or configure a default email handler for `.asc` files
