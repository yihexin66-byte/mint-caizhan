import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(process.cwd(), '..')
const outDir = path.join(root, 'static', 'icons')
fs.mkdirSync(outDir, { recursive: true })

const lucideDir = path.join(process.cwd(), 'node_modules', 'lucide-static', 'icons')
const INK = '#1D1D1A'
const CREAM = '#F4F0E8'
const WHITE = '#FFFFFF'
const MINT = '#22C58B'

function readSvg(name) {
  const file = path.join(lucideDir, `${name}.svg`)
  if (!fs.existsSync(file)) {
    throw new Error(`Missing lucide icon: ${name}`)
  }
  return fs.readFileSync(file, 'utf8')
}

function tint(svg, color) {
  return svg.replaceAll('currentColor', color)
}

async function render(svg, filename, size = 96) {
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(outDir, filename))
}

const nav = [
  ['home', 'house'],
  ['list', 'receipt-text'],
  ['chart', 'chart-pie'],
  ['user', 'user-round'],
  ['plus', 'plus'],
  ['budget', 'piggy-bank'],
]

for (const [name, icon] of nav) {
  const svg = readSvg(icon)
  await render(tint(svg, CREAM), `nav-${name}.png`)
  await render(tint(svg, INK), `nav-${name}-active.png`)
}

const ui = [
  ['back', 'chevron-left'],
  ['down', 'chevron-down'],
  ['right', 'chevron-right'],
  ['search', 'search'],
  ['calendar', 'calendar'],
  ['bell', 'bell'],
  ['globe', 'globe'],
  ['logout', 'log-out'],
  ['edit', 'pencil'],
  ['trash', 'trash-2'],
  ['check', 'check'],
  ['close', 'x'],
  ['filter', 'list-filter'],
  ['refresh', 'refresh-cw'],
  ['info', 'info'],
  ['wallet', 'wallet'],
  ['arrow-up', 'arrow-up-right'],
  ['arrow-down', 'arrow-down-left'],
  ['more', 'ellipsis'],
  ['shield', 'shield-check'],
  ['plus', 'plus'],
  ['swap', 'arrow-right-left'],
  ['sparkles', 'sparkles'],
]

for (const [name, icon] of ui) {
  const svg = readSvg(icon)
  await render(tint(svg, INK), `ui-${name}.png`, 72)
}

await render(tint(readSvg('check'), WHITE), 'ui-check-white.png', 72)
await render(tint(readSvg('plus'), INK), 'ui-plus-ink.png', 72)

const categories = [
  ['food', 'utensils'],
  ['transport', 'bus-front'],
  ['shopping', 'shopping-bag'],
  ['bills', 'receipt-text'],
  ['entertainment', 'clapperboard'],
  ['health', 'heart-pulse'],
  ['education', 'graduation-cap'],
  ['living', 'house'],
  ['gift', 'gift'],
  ['travel', 'plane'],
  ['salary', 'briefcase-business'],
  ['bonus', 'sparkles'],
  ['invest', 'trending-up'],
  ['other', 'circle-ellipsis'],
  ['debt', 'hand-coins'],
  ['settlement', 'badge-check'],
]

for (const [name, icon] of categories) {
  const svg = readSvg(icon)
  await render(tint(svg, WHITE), `cat-${name}.png`, 96)
}

const leafInner = readSvg('leaf')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<svg[\s\S]*?>/, '')
  .replace('</svg>', '')

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect x="0" y="0" width="256" height="256" rx="72" fill="#1F1E1A"/>
  <circle cx="196" cy="60" r="14" fill="#F47B4D"/>
  <g transform="translate(56, 56)" fill="none" stroke="#7BE7BF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${leafInner}
  </g>
</svg>`

await render(logoSvg, 'logo.png', 256)

// Solid rounded category backgrounds are drawn with CSS, so icons stay transparent.

console.log(`Generated ${fs.readdirSync(outDir).length} icon files in ${outDir}`)
