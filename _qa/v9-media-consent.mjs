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
await send('Page.navigate', { url: 'http://localhost:5173/?qa=v9c' + Date.now() + '#/pages/shell/shell' })
await nap(3200)
await ev('clear-consent', `(() => { localStorage.removeItem('mint_media_consent_v1'); return 'cleared'; })()`)

await click('.avatar')
await nap(1300)
await ev('settings-title', `(() => { const e = document.querySelector('.page-title'); return e ? e.innerText : 'MISS'; })()`)

// 1) open avatar sheet, choose album -> app-level consent dialog must appear
await click('.avatar-wrap')
await nap(500)
fileChooser = null
await ev('album-click', `(() => { const rows = document.querySelectorAll('.sheet .profile-action'); if (rows.length < 2) return 'MISS ' + rows.length; rows[1].click(); return 'OK'; })()`)
await nap(700)
await ev('dialog-title', `(() => { const e = document.querySelector('.dialog .dialog-title'); return e ? e.innerText : 'MISS'; })()`)
await ev('dialog-msg', `(() => { const e = document.querySelector('.dialog .dialog-msg'); return e ? e.innerText : 'MISS'; })()`)
await ev('dialog-buttons', `(() => Array.from(document.querySelectorAll('.dialog .dialog-btn')).map(e => e.innerText).join(' / '))()`)
await ev('file-chooser-before-consent', JSON.stringify(fileChooser))
await ev('stored-before', `(() => localStorage.getItem('mint_media_consent_v1'))()`)
await shot('v9-consent-dialog.png')

// 2) cancel -> no picker, consent not stored
await click('.dialog .dialog-btn-ghost')
await nap(600)
await ev('dialog-after-cancel', `(() => document.querySelectorAll('.dialog').length)()`)
await ev('toast-after-cancel', `(() => { const e = document.querySelector('.uni-toast'); return e ? e.innerText : 'no-toast'; })()`)
await ev('file-chooser-after-cancel', JSON.stringify(fileChooser))
await ev('stored-after-cancel', `(() => localStorage.getItem('mint_media_consent_v1'))()`)

// 3) agree -> picker opens and consent is remembered
fileChooser = null
await click('.avatar-wrap')
await nap(400)
await ev('album-click-2', `(() => { const rows = document.querySelectorAll('.sheet .profile-action'); if (rows.length < 2) return 'MISS ' + rows.length; rows[1].click(); return 'OK'; })()`)
await nap(500)
await click('.dialog .dialog-btn-mint')
await nap(900)
await ev('file-chooser-after-agree', JSON.stringify(fileChooser))
await ev('stored-after-agree', `(() => localStorage.getItem('mint_media_consent_v1'))()`)
console.log('[fileChooser]', JSON.stringify(fileChooser))
if (fileChooser && fileChooser.backendNodeId) {
	await send('DOM.setFileInputFiles', { files: ['C:/Users/windows/Documents/HBuilderProjects/Mint 个人财务管家/_brand/home-logo-256.png'], backendNodeId: fileChooser.backendNodeId })
	console.log('[file set]')
}
await nap(1800)
await ev('avatar-image', `(() => { const e = document.querySelector('.avatar-big-image'); return e ? 'IMG' : 'LETTER'; })()`)
await shot('v9-consent-agreed-avatar.png')

// 4) second pick must skip the app dialog (consent remembered)
fileChooser = null
await click('.avatar-wrap')
await nap(400)
await ev('album-click-3', `(() => { const rows = document.querySelectorAll('.sheet .profile-action'); if (rows.length < 2) return 'MISS ' + rows.length; rows[1].click(); return 'OK'; })()`)
await nap(800)
await ev('dialog-on-second-pick', `(() => document.querySelectorAll('.dialog').length)()`)
await ev('file-chooser-on-second-pick', JSON.stringify(fileChooser))
await shot('v9-consent-second-pick.png')

console.log('[exceptions]', errors.length)
if (errors.length) console.log(errors.slice(0, 6).join('\n---\n'))
ws.close()
