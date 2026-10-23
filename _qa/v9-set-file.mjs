import fs from 'node:fs'
const list = await (await fetch('http://localhost:9222/json/list')).json()
const page = list.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', e => {
	const msg = JSON.parse(e.data)
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id)
		pending.delete(msg.id)
		if (msg.error) reject(new Error(JSON.stringify(msg.error)))
		else resolve(msg.result)
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
const doc = await send('DOM.getDocument', { depth: -1 })
const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
console.log('node', q.nodeId)
if (q.nodeId) {
	await send('DOM.setFileInputFiles', { files: ['C:/Users/windows/Documents/HBuilderProjects/Mint 个人财务管家/_brand/home-logo-256.png'], nodeId: q.nodeId })
	await new Promise(r => setTimeout(r, 2000))
}
const r = await send('Runtime.evaluate', { expression: `(() => ({ img: document.querySelector('.avatar-big-image') ? 'IMG' : 'LETTER', toast: document.querySelector('.uni-toast') ? document.querySelector('.uni-toast').innerText : 'no-toast' }))()`, returnByValue: true })
console.log(JSON.stringify(r.result.value))
const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
fs.writeFileSync('_qa/v9-consent-avatar-uploaded.png', Buffer.from(s.data, 'base64'))
console.log('[shot] v9-consent-avatar-uploaded.png')
ws.close()
