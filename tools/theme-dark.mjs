import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = []
for (const dir of ['pages', 'components']) {
  for (const sub of fs.readdirSync(path.join(root, dir))) {
    const p = path.join(root, dir, sub)
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) if (f.endsWith('.uvue')) files.push(path.join(p, f))
    } else if (p.endsWith('.uvue')) files.push(p)
  }
}
files.push(path.join(root, 'App.uvue'))

const bgMap = {
  '#F4F0E8': '#060807',
  '#F7F3EA': 'rgba(255,255,255,0.06)',
  '#FFFFFF': 'rgba(255,255,255,0.055)',
  '#F4EFE7': 'rgba(255,255,255,0.08)',
  '#F4EFE5': 'rgba(255,255,255,0.08)',
  '#F3EEE6': 'rgba(255,255,255,0.08)',
  '#F3EDE3': 'rgba(255,255,255,0.07)',
  '#F2EDE4': 'rgba(255,255,255,0.08)',
  '#F1ECE3': 'rgba(255,255,255,0.10)',
  '#F0EBE1': 'rgba(255,255,255,0.08)',
  '#EAE4D8': 'rgba(255,255,255,0.08)',
  '#E7E1D6': 'rgba(255,255,255,0.10)',
  '#D8D1C5': 'rgba(255,255,255,0.16)',
  '#DCD5C8': 'rgba(255,255,255,0.16)',
  '#CFC9BD': 'rgba(255,255,255,0.18)',
  '#C9C2B4': 'rgba(255,255,255,0.14)',
  '#EEF7F1': 'rgba(123,231,191,0.12)',
  '#F4F8F1': 'rgba(123,231,191,0.08)',
  '#F3F8F4': 'rgba(123,231,191,0.10)',
  '#DFF2E7': 'rgba(123,231,191,0.12)',
  '#E6F5EC': 'rgba(123,231,191,0.12)',
  '#DCEFE4': 'rgba(123,231,191,0.10)',
  '#D6EADF': 'rgba(123,231,191,0.14)',
  '#FBEDE8': 'rgba(240,110,86,0.12)',
  '#FCEFE3': 'rgba(240,160,106,0.12)',
  '#FBEBDD': 'rgba(240,160,106,0.12)',
  '#F3D8CB': 'rgba(240,160,106,0.18)',
  '#F2D4B9': 'rgba(240,160,106,0.18)',
  '#1E1D19': 'rgba(255,255,255,0.075)',
  '#2A2924': 'rgba(255,255,255,0.10)',
  '#C4EAD8': '#A9EDCB',
  '#BDE8D2': '#A9EDCB',
  '#C8EAD8': '#A9EDCB',
  '#74C7A0': '#6FE0B2',
  '#5BB88B': '#6FE0B2',
  '#4C8E6D': '#3F8F6C',
  '#F3A96B': '#F0A06A',
  '#F08F5C': '#F0A06A',
  '#EE9A62': '#F0A06A',
  '#E58A64': '#F0A06A',
  '#F0BB8F': '#F0A06A',
  '#E7A181': '#F0A06A',
  '#4A463E': 'rgba(245,247,244,0.55)',
  'rgba(255, 255, 255, 0.62)': 'rgba(255,255,255,0.055)',
  'rgba(20, 19, 16, 0.42)': 'rgba(0,0,0,0.62)'
}

const textMap = {
  '#1D1D1A': '#F2F6F1',
  '#1E1D19': '#F2F6F1',
  '#F7F3EA': '#F4F1E9',
  '#F4F0E8': '#F4F1E9',
  '#1D3B2E': '#0B2117',
  '#C4EAD8': '#A9EDCB',
  '#BDE8D2': '#A9EDCB',
  '#C8EAD8': '#A9EDCB',
  '#D6EADF': 'rgba(169,237,203,0.90)',
  '#7BE7BF': '#7BE7BF',
  '#4C8E6D': '#8FE3BC',
  '#4F8067': '#8FE3BC',
  '#3F7C5E': '#8FE3BC',
  '#518268': '#8FE3BC',
  '#6F9B82': '#8FE3BC',
  '#2C8F63': '#7BE7BF',
  '#C45138': '#F08A70',
  '#D95F44': '#F08A70',
  '#D0664C': '#F08A70',
  '#DF6A50': '#F08A70',
  '#8C4F2A': '#F3B07C',
  '#A16B49': '#E9A879',
  '#A56C3C': '#F0A878',
  '#B26A58': '#F09783',
  '#C07A5F': '#F0A088',
  '#8D887E': 'rgba(234,242,237,0.56)',
  '#938D82': 'rgba(234,242,237,0.56)',
  '#918B80': 'rgba(234,242,237,0.52)',
  '#9A9489': 'rgba(234,242,237,0.46)',
  '#A09A8F': 'rgba(234,242,237,0.42)',
  '#7A746A': 'rgba(234,242,237,0.55)',
  '#B7B1A5': 'rgba(234,242,237,0.32)',
  '#ADA79B': 'rgba(234,242,237,0.38)',
  '#B4AEA2': 'rgba(234,242,237,0.30)',
  '#A39D91': 'rgba(234,242,237,0.40)',
  '#A39D92': 'rgba(234,242,237,0.42)',
  '#A69F93': 'rgba(234,242,237,0.38)',
  '#989287': 'rgba(234,242,237,0.46)',
  '#8F897E': 'rgba(234,242,237,0.55)',
  '#A19B8F': 'rgba(234,242,237,0.38)',
  '#9B958A': 'rgba(234,242,237,0.40)',
  '#979186': 'rgba(234,242,237,0.42)',
  '#7D786F': 'rgba(234,242,237,0.58)',
  '#5C574F': 'rgba(234,242,237,0.70)',
  '#6F6A61': 'rgba(234,242,237,0.64)',
  '#B0AA9E': 'rgba(234,242,237,0.32)',
  '#B5AEA2': 'rgba(234,242,237,0.30)',
  '#C0B9AD': 'rgba(234,242,237,0.26)',
  '#C9C2B4': 'rgba(234,242,237,0.26)',
  '#8f8f94': 'rgba(234,242,237,0.50)',
  '#4A463E': 'rgba(245,247,244,0.55)'
}

const borderMap = {
  '#F0EBE1': 'rgba(255,255,255,0.09)',
  '#F2EDE4': 'rgba(255,255,255,0.09)',
  '#E7E1D6': 'rgba(255,255,255,0.12)',
  '#EAE4D8': 'rgba(255,255,255,0.10)',
  '#DCD5C8': 'rgba(255,255,255,0.16)',
  '#DAD2C4': 'rgba(255,255,255,0.18)',
  '#D8D1C5': 'rgba(255,255,255,0.16)',
  '#C9C2B4': 'rgba(255,255,255,0.16)',
  '#C4BDB0': 'rgba(255,255,255,0.16)',
  '#CFC9BD': 'rgba(255,255,255,0.16)',
  '#DCEFE4': 'rgba(123,231,191,0.14)'
}

function lookup(map, raw) {
  const key = raw.trim()
  return map[key.toUpperCase()] || map[key] || null
}

function transformCss(css) {
  return css.replace(/(^|[;{\s])([-a-z]+)\s*:\s*([^;{}]+);/g, (full, lead, prop, value) => {
    let out = value
    const lower = prop.toLowerCase()
    const isBg = lower === 'background-color'
    const isColor = lower === 'color'
    const isBorder = lower === 'border-color' || lower.endsWith('-color') && lower.startsWith('border')
    const re = /#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)/g

    out = out.replace(re, (raw) => {
      if (isBg) {
        const mapped = lookup(bgMap, raw)
        if (mapped) return mapped
      } else if (isColor) {
        const mapped = lookup(textMap, raw)
        if (mapped) return mapped
      } else if (isBorder) {
        const mapped = lookup(borderMap, raw)
        if (mapped) return mapped
      }
      if (/rgba\(\s*29\s*,\s*29\s*,\s*26\s*,/.test(raw) || /rgba\(\s*30\s*,\s*29\s*,\s*25\s*,/.test(raw)) {
        return 'rgba(0,0,0,0.40)'
      }
      return raw
    })
    return lead + prop + ': ' + out + ';'
  })
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const match = src.match(/<style>([\s\S]*)<\/style>/)
  if (!match) continue
  const out = src.replace(match[1], transformCss(match[1]))
  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8')
    console.log('updated', path.relative(root, file))
  }
}
