import fs from 'node:fs'

const url = process.argv[2] || 'http://localhost:5173/'
const out = process.argv[3] || ''
const waitMs = Number(process.argv[4] || 3500)
const evalExpr = process.argv[5] || ''
const width = Number(process.argv[6] || 390)
const height = Number(process.argv[7] || 844)
const scale = Number(process.argv[8] || 2)

const list = await (await fetch('http://localhost:9222/json/list')).json()
const page = list.find(t => t.type === 'page')
if (!page) throw new Error('no page target')

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const events = []

ws.addEventListener('message', e => {
	const msg = JSON.parse(e.data)
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id)
		pending.delete(msg.id)
		if (msg.error) reject(new Error(JSON.stringify(msg.error)))
		else resolve(msg.result)
	} else if (msg.method) {
		events.push(msg)
	}
})

await new Promise((resolve, reject) => {
	ws.addEventListener('open', resolve)
	ws.addEventListener('error', reject)
})

function send(method, params = {}) {
	return new Promise((resolve, reject) => {
		const callId = ++id
		pending.set(callId, { resolve, reject })
		ws.send(JSON.stringify({ id: callId, method, params }))
	})
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
	width, height, deviceScaleFactor: scale, mobile: true
})
await send('Emulation.setTouchEmulationEnabled', { enabled: true })
const nav = await send('Page.navigate', { url })
await new Promise(r => setTimeout(r, waitMs))

const metrics = await send('Runtime.evaluate', {
	expression: `(() => {
		const q = s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) }; };
		return {
			innerW: innerWidth, innerH: innerHeight, dpr: devicePixelRatio,
			docW: document.documentElement.clientWidth,
			bodyScrollW: document.body.scrollWidth,
			body: q('uni-page-body'), page: q('.page'), content: q('.page-content'),
			hero: q('.hero'), tabbar: q('.tabbar'),
			text: document.body.innerText.slice(0, 400)
		};
	})()`,
	returnByValue: true
})
console.log(JSON.stringify(metrics.result?.value, null, 2))

if (evalExpr.length > 0) {
	const evaluated = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true, awaitPromise: true })
	console.log('EVAL:', JSON.stringify(evaluated.result?.value ?? evaluated.result, null, 2))
}

const errors = events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
if (errors.length) {
	console.log('--- console errors ---')
	for (const e of errors) console.log(JSON.stringify(e.params).slice(0, 1200))
}

if (out.length > 0) {
	const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
	console.log('screenshot:', out)
}

ws.close()
process.exit(0)
