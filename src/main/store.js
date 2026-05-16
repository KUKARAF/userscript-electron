import Store from 'electron-store'

const store = new Store({
  schema: {
    pages: {
      type: 'array',
      default: [
        { id: '1', name: 'Trans.eu', url: 'https://www.trans.eu/', enabled: true },
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
    autoInjectScripts: { type: 'boolean', default: true },
  },
})

export default store
