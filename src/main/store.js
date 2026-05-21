import Store from 'electron-store'

const store = new Store({
  schema: {
    pages: {
      type: 'array',
      default: [
        { id: '1', name: 'Trans.eu Freights', url: 'https://platform.trans.eu/freights/sent', enabled: true },
      ],
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          url: { type: 'string' },
          enabled: { type: 'boolean' },
        },
      },
    },
    apiToken: { type: 'string', default: '' },
    deviceRegistrationId: { type: 'string', default: '' },
    autoInjectScripts: { type: 'boolean', default: true },
    tasks: { type: 'array', default: [] },
    scripts: { type: 'array', default: [], items: { type: 'object' } },
  },
})

export default store
