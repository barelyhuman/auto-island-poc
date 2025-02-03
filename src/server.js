import { createServer } from 'node:http'
import { renderToString } from 'preact-render-to-string'

import { App } from './App.jsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

import sirv from 'sirv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Generated during build
const serve = sirv(join(__dirname, './assets'), {
  brotli: true,
})

createServer((req, res) => {
  serve(req, res, () => {
    const html = renderToString(<App />)
    res.setHeader('content-type', 'text/html')
    res.end(html)
  })
}).listen(3000, () => {
  console.log('listening')
})
