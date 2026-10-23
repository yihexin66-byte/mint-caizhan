import fs from 'node:fs'

const list = await (await fetch('http://localhost:9222/json/list')).json()
const page = list.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const errors = []
let fileChooser = null
ws.addEventListener('message', e => {
	const msg = JSON.parse(e.data)
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id)
		pending.delete(msg.id)
		if (msg.error) reject(new Error(JSON.stringify(msg.error)))
		else resolve(msg.result)
	} else if (msg.method === 'Runtime.exceptionThrown') {
		errors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 400))
	} else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
		errors.push(msg.params.entry.text)
	} else if (msg.method === 'Page.fileChooserOpened') {
		fileChooser = msg.params
	}
})
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
function send(method, params = {}) {
	return new Promise((resolve, reject) => {
		const callId = ++id
		pending.set(callId, { resolve, reject })
		ws.send(JSON.stringify({ id: callId, method, params }))
	})
}
const nap = ms => new Promise(r => setTimeout(r, ms))
async function ev(label, expr) {
	const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
	const v = r.result?.value
	if (r.exceptionDetails) console.log('[' + label + '] EXC', JSON.stringify(r.exceptionDetails).slice(0, 400))
	console.log('[' + label + ']', typeof v === 'string' ? v : JSON.stringify(v))
	return v
}
async function shot(name) {
	const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	fs.writeFileSync('_qa/' + name, Buffer.from(s.data, 'base64'))
	console.log('[shot]', name)
}
async function click(sel) {
	return await ev('click ' + sel, `(() => { const e = document.querySelector('${sel}'); if (!e) return 'MISS'; e.click(); return 'OK'; })()`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('DOM.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true })
await send('Page.setInterceptFileChooserDialog', { enabled: true })
await send('Page.navigate', { url: 'http://localhost:5173/?qa=v8p' + Date.now() + '#/pages/shell/shell' })
await nap(3200)

await click('.avatar')
await nap(1400)
await ev('settings-hash', 'location.hash')
await shot('v8-settings.png')
await ev('profile-name', `(() => { const e = document.querySelector('.profile-name'); return e ? e.innerText : 'MISS'; })()`)

// avatar sheet
await click('.avatar-wrap')
await nap(500)
await shot('v8-avatar-sheet.png')

// pick from album via intercepted file chooser
fileChooser = null
await ev('album-click', `(() => { const rows = document.querySelectorAll('.sheet .profile-action'); if (rows.length < 2) return 'MISS ' + rows.length; rows[1].click(); return 'OK'; })()`)
await nap(600)
console.log('[fileChooser]', JSON.stringify(fileChooser))
if (fileChooser && fileChooser.backendNodeId) {
	await send('DOM.setFileInputFiles', { files: ['C:/Users/windows/Documents/HBuilderProjects/Mint 个人财务管家/_brand/home-logo-256.png'], backendNodeId: fileChooser.backendNodeId })
	console.log('[file set]')
} else {
	// fallback: locate input element
	const doc = await send('DOM.getDocument', { depth: -1 })
	const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
	if (q.nodeId) {
		await send('DOM.setFileInputFiles', { files: ['C:/Users/windows/Documents/HBuilderProjects/Mint 个人财务管家/_brand/home-logo-256.png'], nodeId: q.nodeId })
		console.log('[file set via query]', q.nodeId)
	} else {
		console.log('[no file input found]')
	}
}
await nap(2000)
await shot('v8-avatar-picked.png')
await ev('avatar-img', `(() => { const e = document.querySelector('.avatar-big-image'); return e ? (e.getAttribute('src') || '').slice(0, 80) : 'NO-IMG'; })()`)
await ev('toast', `(() => { const e = document.querySelector('.uni-toast'); return e ? e.innerText : 'no-toast'; })()`)

// name dialog
await click('.profile-main')
await nap(500)
await shot('v8-name-dialog.png')
await ev('focus-input', `(() => { const i = document.querySelector('.name-input input'); if (!i) return 'NO-INPUT'; i.focus(); i.select(); return 'FOCUSED'; })()`)
await send('Input.insertText', { text: '小满' })
await nap(300)
await ev('draft', `(() => { const i = document.querySelector('.name-input input'); return i ? i.value : 'MISS'; })()`)
await shot('v8-name-typed.png')
await click('.dialog-btn-mint')
await nap(1200)
await ev('name-after-save', `(() => { const e = document.querySelector('.profile-name'); return e ? e.innerText : 'MISS'; })()`)
await shot('v8-settings-renamed.png')

// back home, check greeting and avatar
await click('.back-btn')
await nap(1200)
await ev('hash-home', 'location.hash')
await ev('greeting', `(() => { const e = document.querySelector('.hello-title'); return e ? e.innerText : 'MISS'; })()`)
await ev('home-avatar', `(() => { const e = document.querySelector('.avatar .avatar-image'); return e ? (e.getAttribute('src') || '').slice(0, 80) : 'LETTER'; })()`)
await shot('v8-home-renamed.png')

// check both tabs stay in sync without a page reload
await click('.tab-item:nth-child(4)')
await nap(700)
await click('.tab-item:nth-child(1)')
await nap(700)
await ev('greeting-after-tabs', `(() => { const e = document.querySelector('.hello-title'); return e ? e.innerText : 'MISS'; })()`)
await ev('home-avatar-after-tabs', `(() => { const e = document.querySelector('.avatar .avatar-image'); return e ? (e.getAttribute('src') || '').slice(0, 80) : 'LETTER'; })()`)
await shot('v8-home-after-tabs.png')

// open settings again and remove avatar
await click('.avatar')
await nap(1200)
await click('.avatar-wrap')
await nap(400)
await ev('sheet-actions', `(() => { const all = document.querySelectorAll('.profile-action'); return Array.from(all).map(e => e.innerText.replace(/\\n/g, ' ')).join(' / '); })()`)
await ev('remove-click', `(() => { const rows = document.querySelectorAll('.sheet .profile-action'); if (rows.length == 0) return 'MISS'; rows[rows.length - 1].click(); return 'OK'; })()`)
await nap(900)
await ev('avatar-after-remove', `(() => { const e = document.querySelector('.avatar-big-image'); return e ? 'IMG' : 'LETTER'; })()`)
await shot('v8-avatar-removed.png')

console.log('[exceptions]', errors.length)
if (errors.length) console.log(errors.slice(0, 6).join('\n---\n'))
ws.close()
