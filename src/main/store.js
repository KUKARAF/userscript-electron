import Store from 'electron-store'

const store = new Store({
  schema: {
    // Pages are now managed server-side via browsing sessions.
    // cachedPages is a local fallback for offline use: [{ id, session_id, url }]
    cachedPages: {
      type: 'array',
      default: [],
      items: { type: 'object' },
    },
    apiToken: { type: 'string', default: '' },
    deviceRegistrationId: { type: 'string', default: '' },
    autoInjectScripts: { type: 'boolean', default: true },
    tasks: { type: 'array', default: [] },
    scripts: { type: 'array', default: [], items: { type: 'object' } },
  },
})

export default store
