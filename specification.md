# Electron Userscript Manager - API Specification

## Overview

This Electron application interfaces with the egghead_service backend to request and manage custom userscripts. The app allows users to:
- Configure target websites
- Submit userscript requests with page context
- Track request status and pricing
- Inject generated scripts into web pages

## Authentication

### API Token-Based Authentication
All API requests require an API token obtained from the egghead_service dashboard.

**Header:** `Authorization: Bearer <egghead_API_TOKEN>`

**Example:**
```
Authorization: Bearer egghead_yV_XbgeswAg0gOpjnA7l7njJ3KrQelfcigWGZXPauXU
```

### Submission Token (Read-Only Access)
After submitting a task, you receive a submission token for read-only status polling without API authentication.

**Token Format:** `task_<uuid>`

**Usage:** Included in task response during creation; can be used to check status without auth.

---

## Endpoints

### 1. Create Task (Submit Userscript Request)

**POST** `/api/tasks`

Creates a new userscript generation task with page context and user requirements.

#### Request
```json
{
  "tab_url": "https://example.com",
  "prompt": "Hide the navigation menu and add a dark mode toggle",
  "page_html": "<html>...</html>",
  "action_recording": null,
  "files": [
    {
      "name": "styles.css",
      "content": "body { color: white; }"
    }
  ]
}
```

#### Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tab_url` | string | Yes | URL of the target webpage |
| `prompt` | string | Yes | User's request for the userscript |
| `page_html` | string | Yes | Rendered DOM of the page (from devtools or renderer process) |
| `action_recording` | string | No | Recorded user interactions (future feature) |
| `files` | array | No | Source files (CSS, JS) from the page |
| `files[].name` | string | - | File name (e.g., "style.css") |
| `files[].content` | string | - | File contents as UTF-8 text |

#### Constraints
- Maximum combined size: 150,000 bytes (page_html + files content)

#### Response (201 Created)
```json
{
  "id": "56b989d2-b8e1-4a42-ba89-61940068e9f9",
  "status": "pending",
  "submission_token": "task_4b49f8c3-5787-4beb-97a1-50f1e1dc548a"
}
```

**Save the `submission_token`** - use this to poll task status without authentication.

---

### 2. Get Task Status (by Submission Token - No Auth Required)

**GET** `/api/tasks/status/{submission_token}`

Poll task status using only the submission token (no API auth needed).

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `submission_token` | string | Token from task creation response (format: `task_<uuid>`) |

#### Response (200 OK)
```json
{
  "id": "56b989d2-b8e1-4a42-ba89-61940068e9f9",
  "tab_url": "https://example.com",
  "prompt": "Hide navigation menu",
  "status": "awaiting_approval",
  "estimated_price_pln": 400,
  "price_rationale": "Requires DOM manipulation and event listeners",
  "script_name": null,
  "script_code": null,
  "match_pattern": null,
  "error_message": null,
  "created_at": "2026-05-15 17:45:54",
  "updated_at": "2026-05-15 17:46:02"
}
```

#### Status Values
| Status | Meaning |
|--------|---------|
| `pending` | Waiting to be estimated |
| `estimating` | AI is analyzing complexity |
| `awaiting_approval` | Estimation complete; user must approve price |
| `processing` | Approved; script generation in progress |
| `done` | Script generated successfully |
| `failed` | Error during estimation or generation |
| `rejected` | User rejected the estimate |

---

### 3. Approve Task (Requires Auth)

**POST** `/api/me/tasks/{id}/approve`

Approve the estimated price and proceed with script generation.

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Task UUID (from task creation) |

#### Response (204 No Content)

---

### 4. Reject Task (Requires Auth)

**POST** `/api/me/tasks/{id}/reject`

Reject the estimate and cancel the task.

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Task UUID |

#### Response (204 No Content)

---

### 5. Get Authenticated Task Details (Requires Auth)

**GET** `/api/tasks/{id}`

Retrieve full task details with authentication.

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Task UUID |

#### Response (200 OK)
```json
{
  "id": "56b989d2-b8e1-4a42-ba89-61940068e9f9",
  "tab_url": "https://example.com",
  "prompt": "Hide navigation menu",
  "status": "done",
  "estimated_price_pln": 400,
  "price_rationale": "Requires DOM manipulation",
  "script_name": "example-modifier",
  "script_code": "(() => { ... })();",
  "match_pattern": "https://example.com/*",
  "error_message": null,
  "created_at": "2026-05-15 17:45:54",
  "updated_at": "2026-05-15 17:50:12"
}
```

**Note:** When `status == "done"`, `script_code` includes the full userscript with headers.

---

## Pricing

Pricing is calculated by the AI based on task complexity:

**Rate:** 200 PLN per hour

**Complexity Tiers:**
- **Simple** (0.5-1 hour): CSS tweaks, hide/show elements → 100-200 PLN
- **Moderate** (1-3 hours): Form interactions, event listeners → 200-600 PLN
- **Complex** (3-8 hours): API calls, state management, WebSocket → 600-1600 PLN

Estimates are provided in the `awaiting_approval` state. The `price_rationale` field explains the breakdown.

---

## Electron App Implementation Guide

### 1. Settings Configuration

Store user preferences:
```json
{
  "apiToken": "egghead_...",
  "targetSites": [
    {
      "url": "https://example.com",
      "name": "Example Site",
      "enabled": true
    }
  ],
  "autoInjectScripts": true,
  "cachePath": "/home/user/.config/userscript-manager/scripts"
}
```

### 2. Page Context Capture

When user navigates to a target site:
```javascript
// In renderer process (preload or content script equivalent)
const pageContext = {
  url: window.location.href,
  html: document.documentElement.outerHTML,
  title: document.title,
  // Optional: extract CSS/JS sources if needed
  styles: Array.from(document.styleSheets)
    .map(sheet => ({ name: sheet.href, content: sheet.cssText })),
};
```

### 3. Request Workflow

```
1. User selects target site (from settings)
2. User submits prompt via context menu or sidebar
3. App captures: URL, rendered HTML, source files
4. POST /api/tasks → get submission_token
5. Poll GET /api/tasks/status/{token} every 5 seconds
   ├─ If status == "awaiting_approval" → show approval dialog with price
   ├─ User clicks "Approve" → POST /api/me/tasks/{id}/approve
   ├─ Resume polling...
   └─ If status == "done" → download script, inject, save locally
```

### 4. Script Injection

Once script is generated and status is `done`:

```javascript
// Retrieve script from script_code field
const scriptCode = taskDetails.script_code;

// Create script element
const scriptEl = document.createElement('script');
scriptEl.textContent = scriptCode;
document.documentElement.appendChild(scriptEl);

// Optional: persist to disk for offline use
fs.writeFileSync(
  `${cachePath}/${task.script_name}.js`,
  scriptCode
);
```

### 5. Error Handling

Monitor `error_message` field:
- If `status == "failed"`, display error to user
- Suggest retry or manual request
- Log error details for debugging

---

## Rate Limiting & Considerations

- **Polling interval:** Recommended 5 seconds (don't exceed once per second)
- **Concurrent requests:** Keep to 1-2 concurrent task requests
- **Cache:** Store successful scripts locally; allow offline viewing
- **Token expiry:** Submission tokens don't expire; task data is retained indefinitely

---

## Example: Complete Request Flow

### JavaScript Example (Electron Main Process)
```javascript
const axios = require('axios');

const API_BASE = 'https://userscripts.osmosis.page/api';
const API_TOKEN = 'egghead_yV_XbgeswAg0gOpjnA7l7njJ3KrQelfcigWGZXPauXU';

async function requestUserscript(tabUrl, prompt, pageHtml) {
  try {
    // 1. Create task
    const createResp = await axios.post(`${API_BASE}/tasks`, {
      tab_url: tabUrl,
      prompt: prompt,
      page_html: pageHtml,
      files: null
    }, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });

    const { id, submission_token, status } = createResp.data;
    console.log(`Task created: ${id} (token: ${submission_token})`);

    // 2. Poll status
    let taskStatus = status;
    while (taskStatus !== 'done' && taskStatus !== 'failed') {
      await new Promise(r => setTimeout(r, 5000)); // Wait 5s

      const statusResp = await axios.get(
        `${API_BASE}/tasks/status/${submission_token}`
      );
      taskStatus = statusResp.data.status;
      console.log(`Status: ${taskStatus}`);

      if (taskStatus === 'awaiting_approval') {
        // Show dialog to user: "Approve ${price} PLN?"
        // On approval: POST /api/me/tasks/{id}/approve
        console.log(`Price: ${statusResp.data.estimated_price_pln} PLN`);
        console.log(`Rationale: ${statusResp.data.price_rationale}`);
      }
    }

    if (taskStatus === 'done') {
      return statusResp.data.script_code;
    } else {
      throw new Error(statusResp.data.error_message);
    }
  } catch (err) {
    console.error('Failed to request userscript:', err.message);
    throw err;
  }
}
```

---

## Support & Debugging

- **API Status:** Check https://userscripts.osmosis.page/api/openapi.json for live endpoint docs
- **CORS:** API supports CORS for browser-based clients
- **SSL:** Always use HTTPS in production
- **Logs:** Save submission tokens locally for tracking; reference them when reporting issues
