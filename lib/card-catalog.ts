// Card art: how a card looks. A card's `color` field holds one of
//   'auto'          → pick the look from the card name / bank (default)
//   '<design id>'   → one of the designs below, chosen by the user
//   'img:<url>'     → the user's own image (uploaded, or found online)
// Older cards still hold the original preset names (blue, gold, …); those are treated as 'auto'
// unless the name/bank is unknown, in which case the matching preset look is used.

export type Network = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'other'
export type CardType = 'credit' | 'debit' | 'prepaid'

export type PatternKind = 'none' | 'waves' | 'swoosh' | 'geo' | 'hex' | 'lines' | 'rings' | 'dots' | 'stripes' | 'arcs' | 'grid'

export interface CardDesign {
  id: string
  name: string
  /** Full CSS `background` value (layered gradients) */
  background: string
  pattern: PatternKind
  /** Colour (with alpha) used to draw the pattern */
  patternColor: string
  /** Main text colour on the card */
  text: string
  /** Highlight colour (small labels, glow) */
  accent: string
  chip: 'gold' | 'silver'
  /** Adds a brushed-metal highlight */
  metallic?: boolean
  /** Shown in the design picker for any card */
  generic?: boolean
}

const d = (id: string, name: string, o: Omit<CardDesign, 'id' | 'name'>): CardDesign => ({ id, name, ...o })

// ── Designs anyone can pick ───────────────────────────────────────────────────
export const GENERIC_DESIGNS: CardDesign[] = [
  d('blue', 'Cobalt', {
    background: 'radial-gradient(120% 90% at 85% 5%, #3b82f6 0%, transparent 55%), linear-gradient(135deg, #0b1f5c 0%, #1d4ed8 100%)',
    pattern: 'waves', patternColor: 'rgba(255,255,255,.16)', text: '#ffffff', accent: '#bfdbfe', chip: 'gold', generic: true,
  }),
  d('gold', 'Champagne', {
    background: 'radial-gradient(100% 80% at 80% 0%, #fde68a 0%, transparent 60%), linear-gradient(135deg, #78350f 0%, #d97706 60%, #f59e0b 100%)',
    pattern: 'lines', patternColor: 'rgba(255,255,255,.10)', text: '#ffffff', accent: '#fef3c7', chip: 'gold', metallic: true, generic: true,
  }),
  d('green', 'Emerald', {
    background: 'radial-gradient(90% 80% at 10% 0%, #34d399 0%, transparent 55%), linear-gradient(135deg, #022c22 0%, #047857 100%)',
    pattern: 'hex', patternColor: 'rgba(255,255,255,.10)', text: '#ffffff', accent: '#a7f3d0', chip: 'gold', generic: true,
  }),
  d('purple', 'Violet', {
    background: 'radial-gradient(90% 90% at 90% 10%, #a78bfa 0%, transparent 55%), linear-gradient(135deg, #2e1065 0%, #7c3aed 100%)',
    pattern: 'waves', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#ddd6fe', chip: 'gold', generic: true,
  }),
  d('red', 'Crimson', {
    background: 'radial-gradient(90% 90% at 85% 0%, #f87171 0%, transparent 55%), linear-gradient(135deg, #450a0a 0%, #dc2626 100%)',
    pattern: 'swoosh', patternColor: 'rgba(255,255,255,.12)', text: '#ffffff', accent: '#fecaca', chip: 'gold', generic: true,
  }),
  d('dark', 'Onyx', {
    background: 'radial-gradient(80% 60% at 80% 0%, #3f3f46 0%, transparent 60%), linear-gradient(135deg, #09090b 0%, #27272a 100%)',
    pattern: 'lines', patternColor: 'rgba(255,255,255,.06)', text: '#fafafa', accent: '#d4d4d8', chip: 'gold', metallic: true, generic: true,
  }),
  d('rose', 'Blush', {
    background: 'radial-gradient(90% 90% at 15% 0%, #fda4af 0%, transparent 55%), linear-gradient(135deg, #4c0519 0%, #e11d48 100%)',
    pattern: 'rings', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#ffe4e6', chip: 'gold', generic: true,
  }),
  d('teal', 'Lagoon', {
    background: 'radial-gradient(90% 90% at 90% 0%, #5eead4 0%, transparent 55%), linear-gradient(135deg, #042f2e 0%, #0d9488 100%)',
    pattern: 'arcs', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#99f6e4', chip: 'gold', generic: true,
  }),
  d('aurora', 'Aurora', {
    background: 'radial-gradient(60% 80% at 15% 20%, rgba(52,211,153,.55), transparent 60%), radial-gradient(55% 70% at 85% 30%, rgba(99,102,241,.65), transparent 60%), radial-gradient(70% 80% at 50% 110%, rgba(236,72,153,.5), transparent 60%), #0b1020',
    pattern: 'none', patternColor: 'rgba(255,255,255,.1)', text: '#ffffff', accent: '#c7d2fe', chip: 'silver', generic: true,
  }),
  d('midnight', 'Midnight', {
    background: 'radial-gradient(70% 70% at 80% 10%, #1e3a8a 0%, transparent 60%), linear-gradient(160deg, #020617 0%, #0f172a 100%)',
    pattern: 'dots', patternColor: 'rgba(191,219,254,.35)', text: '#e2e8f0', accent: '#93c5fd', chip: 'silver', generic: true,
  }),
  d('carbon', 'Carbon', {
    background: 'linear-gradient(135deg, #050505 0%, #1c1c1f 100%)',
    pattern: 'grid', patternColor: 'rgba(255,255,255,.07)', text: '#f4f4f5', accent: '#a1a1aa', chip: 'silver', generic: true,
  }),
  d('rosegold', 'Rose gold', {
    background: 'radial-gradient(100% 80% at 20% 0%, #fde2d6 0%, transparent 55%), linear-gradient(135deg, #7a4a45 0%, #e8b4a0 55%, #c98b7a 100%)',
    pattern: 'lines', patternColor: 'rgba(255,255,255,.12)', text: '#3b1f1c', accent: '#5c342f', chip: 'gold', metallic: true, generic: true,
  }),
  d('ocean', 'Ocean', {
    background: 'radial-gradient(100% 90% at 100% 100%, #22d3ee 0%, transparent 55%), linear-gradient(135deg, #082f49 0%, #0369a1 100%)',
    pattern: 'waves', patternColor: 'rgba(255,255,255,.15)', text: '#ffffff', accent: '#a5f3fc', chip: 'silver', generic: true,
  }),
  d('sunset', 'Sunset', {
    background: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 45%, #db2777 100%)',
    pattern: 'swoosh', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#fed7aa', chip: 'gold', generic: true,
  }),
  d('graphite', 'Graphite', {
    background: 'linear-gradient(135deg, #1f2937 0%, #4b5563 100%)',
    pattern: 'geo', patternColor: 'rgba(255,255,255,.10)', text: '#f9fafb', accent: '#d1d5db', chip: 'silver', metallic: true, generic: true,
  }),
  d('royal', 'Royal', {
    background: 'radial-gradient(80% 80% at 80% 0%, #6366f1 0%, transparent 60%), linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
    pattern: 'geo', patternColor: 'rgba(250,204,21,.16)', text: '#ffffff', accent: '#fde68a', chip: 'gold', generic: true,
  }),
  d('mint', 'Mint', {
    background: 'radial-gradient(90% 90% at 90% 0%, #ffffff 0%, transparent 55%), linear-gradient(135deg, #a7f3d0 0%, #34d399 100%)',
    pattern: 'rings', patternColor: 'rgba(6,78,59,.12)', text: '#052e2b', accent: '#065f46', chip: 'gold', generic: true,
  }),
  d('neon', 'Neon', {
    background: 'radial-gradient(60% 70% at 15% 100%, rgba(236,72,153,.55), transparent 60%), radial-gradient(60% 70% at 90% 0%, rgba(34,211,238,.5), transparent 60%), #05010f',
    pattern: 'grid', patternColor: 'rgba(147,197,253,.16)', text: '#ffffff', accent: '#67e8f9', chip: 'silver', generic: true,
  }),
  d('platinum', 'Platinum', {
    background: 'linear-gradient(135deg, #9ca3af 0%, #f3f4f6 48%, #9ca3af 100%)',
    pattern: 'lines', patternColor: 'rgba(0,0,0,.06)', text: '#111827', accent: '#374151', chip: 'silver', metallic: true, generic: true,
  }),
  d('ember', 'Ember', {
    background: 'radial-gradient(70% 70% at 90% 100%, #f97316 0%, transparent 60%), linear-gradient(135deg, #0a0a0a 0%, #1c1917 100%)',
    pattern: 'stripes', patternColor: 'rgba(249,115,22,.14)', text: '#fafaf9', accent: '#fdba74', chip: 'gold', generic: true,
  }),
]

export const GENERIC_BY_ID = new Map(GENERIC_DESIGNS.map(g => [g.id, g]))
/** The original eight presets — kept as "auto, with this fallback" for existing cards */
export const LEGACY_IDS = new Set(['blue', 'gold', 'green', 'purple', 'red', 'dark', 'rose', 'teal'])

// ── Specific cards ────────────────────────────────────────────────────────────
export interface CatalogCard {
  /** Words that must all appear in "<card name> <bank name>" (lower case) */
  all: string[]
  label: string
  bank?: string
  network?: Network
  type?: CardType
  design: CardDesign
  cobrand?: { domain: string; name: string }
}

const metal = (id: string, name: string, bg: string, pattern: PatternKind, pc: string, text: string, accent: string, chip: 'gold' | 'silver' = 'gold'): CardDesign =>
  d(id, name, { background: bg, pattern, patternColor: pc, text, accent, chip, metallic: true })

// More specific entries first. These are inspired by how the real cards look.
export const CARD_CATALOG: CatalogCard[] = [
  // RuPay
  { all: ['rupay', 'platinum'], label: 'RuPay Platinum', network: 'rupay', design: d('rupay-platinum', 'RuPay Platinum', {
      background: 'radial-gradient(90% 80% at 85% 100%, rgba(19,136,8,.55), transparent 55%), radial-gradient(90% 80% at 10% 100%, rgba(243,112,33,.5), transparent 55%), linear-gradient(135deg, #0b1b4d 0%, #16347a 100%)',
      pattern: 'arcs', patternColor: 'rgba(255,255,255,.12)', text: '#ffffff', accent: '#fdba74', chip: 'gold' }) },
  { all: ['rupay', 'select'], label: 'RuPay Select', network: 'rupay', design: metal('rupay-select', 'RuPay Select',
      'radial-gradient(80% 70% at 85% 0%, #3a3a1a 0%, transparent 60%), linear-gradient(135deg, #0a0a0a 0%, #2a2a2e 100%)', 'lines', 'rgba(212,175,55,.12)', '#f5e6b3', '#d4af37') },

  // HDFC
  { all: ['infinia'], label: 'HDFC Infinia', bank: 'HDFC Bank', network: 'visa', type: 'credit', design: metal('hdfc-infinia', 'Infinia',
      'radial-gradient(70% 60% at 85% 0%, #4a4a52 0%, transparent 60%), linear-gradient(135deg, #060607 0%, #26262b 50%, #0c0c0e 100%)', 'lines', 'rgba(255,255,255,.07)', '#e8d9a8', '#d9c28a') },
  { all: ['diners'], label: 'Diners Club', bank: 'HDFC Bank', type: 'credit', design: metal('hdfc-diners', 'Diners Club',
      'linear-gradient(135deg, #0b0b0c 0%, #202023 100%)', 'rings', 'rgba(255,255,255,.07)', '#e5e7eb', '#cbd5e1', 'silver') },
  { all: ['regalia', 'gold'], label: 'HDFC Regalia Gold', bank: 'HDFC Bank', network: 'visa', type: 'credit', design: d('hdfc-regalia-gold', 'Regalia Gold', {
      background: 'radial-gradient(80% 70% at 80% 0%, #7c3aed 0%, transparent 60%), linear-gradient(135deg, #12063a 0%, #3b1a8a 100%)',
      pattern: 'waves', patternColor: 'rgba(250,204,21,.3)', text: '#fef3c7', accent: '#facc15', chip: 'gold' }) },
  { all: ['regalia'], label: 'HDFC Regalia', bank: 'HDFC Bank', network: 'visa', type: 'credit', design: d('hdfc-regalia', 'Regalia', {
      background: 'radial-gradient(80% 70% at 85% 0%, #4f46e5 0%, transparent 60%), linear-gradient(135deg, #0f0638 0%, #312e81 100%)',
      pattern: 'waves', patternColor: 'rgba(201,168,76,.28)', text: '#f5ecd0', accent: '#c9a84c', chip: 'gold' }) },
  { all: ['millennia'], label: 'HDFC Millennia', bank: 'HDFC Bank', network: 'mastercard', type: 'credit', design: d('hdfc-millennia', 'Millennia', {
      background: 'radial-gradient(70% 80% at 90% 10%, #f472b6 0%, transparent 60%), linear-gradient(135deg, #3b0764 0%, #7e22ce 100%)',
      pattern: 'waves', patternColor: 'rgba(255,255,255,.2)', text: '#ffffff', accent: '#f5d0fe', chip: 'gold' }) },
  { all: ['moneyback'], label: 'HDFC MoneyBack+', bank: 'HDFC Bank', type: 'credit', design: d('hdfc-moneyback', 'MoneyBack+', {
      background: 'radial-gradient(80% 80% at 90% 0%, #2dd4bf 0%, transparent 55%), linear-gradient(135deg, #063b3a 0%, #0f766e 100%)',
      pattern: 'rings', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#99f6e4', chip: 'gold' }) },
  { all: ['swiggy'], label: 'Swiggy HDFC', bank: 'HDFC Bank', network: 'mastercard', type: 'credit', cobrand: { domain: 'swiggy.com', name: 'Swiggy' }, design: d('swiggy', 'Swiggy', {
      background: 'radial-gradient(80% 80% at 90% 0%, #ffb067 0%, transparent 55%), linear-gradient(135deg, #b83e06 0%, #fc8019 100%)',
      pattern: 'swoosh', patternColor: 'rgba(255,255,255,.16)', text: '#ffffff', accent: '#fff1e0', chip: 'gold' }) },
  { all: ['tata', 'neu'], label: 'Tata Neu', bank: 'HDFC Bank', type: 'credit', cobrand: { domain: 'tataneu.com', name: 'Tata Neu' }, design: d('tata-neu', 'Tata Neu', {
      background: 'radial-gradient(80% 80% at 90% 0%, #d946ef 0%, transparent 55%), linear-gradient(135deg, #1a0638 0%, #5b21b6 100%)',
      pattern: 'geo', patternColor: 'rgba(255,255,255,.12)', text: '#ffffff', accent: '#f0abfc', chip: 'gold' }) },

  // ICICI
  { all: ['amazon'], label: 'Amazon Pay ICICI', bank: 'ICICI Bank', network: 'visa', type: 'credit', cobrand: { domain: 'amazon.in', name: 'Amazon Pay' }, design: d('amazon-pay', 'Amazon Pay', {
      background: 'radial-gradient(70% 70% at 100% 100%, #ff9900 0%, transparent 55%), linear-gradient(135deg, #0b0f19 0%, #1b2433 100%)',
      pattern: 'swoosh', patternColor: 'rgba(255,153,0,.28)', text: '#ffffff', accent: '#ffb84d', chip: 'gold' }) },
  { all: ['sapphiro'], label: 'ICICI Sapphiro', bank: 'ICICI Bank', type: 'credit', design: d('icici-sapphiro', 'Sapphiro', {
      background: 'radial-gradient(80% 70% at 85% 0%, #2563eb 0%, transparent 60%), linear-gradient(135deg, #04163a 0%, #0b4a9c 100%)',
      pattern: 'geo', patternColor: 'rgba(201,168,76,.2)', text: '#f5ecd0', accent: '#c9a84c', chip: 'gold' }) },
  { all: ['rubyx'], label: 'ICICI Rubyx', bank: 'ICICI Bank', type: 'credit', design: d('icici-rubyx', 'Rubyx', {
      background: 'radial-gradient(80% 70% at 85% 0%, #f43f5e 0%, transparent 60%), linear-gradient(135deg, #3f0610 0%, #9f1239 100%)',
      pattern: 'geo', patternColor: 'rgba(255,255,255,.12)', text: '#ffffff', accent: '#fecdd3', chip: 'gold' }) },
  { all: ['coral'], label: 'ICICI Coral', bank: 'ICICI Bank', type: 'credit', design: d('icici-coral', 'Coral', {
      background: 'radial-gradient(80% 80% at 90% 0%, #fdba74 0%, transparent 55%), linear-gradient(135deg, #b91c1c 0%, #f97316 100%)',
      pattern: 'waves', patternColor: 'rgba(255,255,255,.2)', text: '#ffffff', accent: '#ffedd5', chip: 'gold' }) },
  { all: ['emeralde'], label: 'ICICI Emeralde', bank: 'ICICI Bank', type: 'credit', design: metal('icici-emeralde', 'Emeralde',
      'radial-gradient(80% 70% at 85% 0%, #10b981 0%, transparent 60%), linear-gradient(135deg, #02120c 0%, #065f46 100%)', 'lines', 'rgba(255,255,255,.07)', '#f5e6b3', '#d4af37') },

  // Axis
  { all: ['magnus'], label: 'Axis Magnus', bank: 'Axis Bank', network: 'visa', type: 'credit', design: metal('axis-magnus', 'Magnus',
      'radial-gradient(80% 70% at 85% 0%, #7f1d1d 0%, transparent 60%), linear-gradient(135deg, #12060a 0%, #3b0d17 100%)', 'geo', 'rgba(212,175,55,.2)', '#f1e0a8', '#d4af37') },
  { all: ['atlas'], label: 'Axis Atlas', bank: 'Axis Bank', network: 'visa', type: 'credit', design: d('axis-atlas', 'Atlas', {
      background: 'radial-gradient(80% 70% at 100% 100%, #06b6d4 0%, transparent 55%), linear-gradient(135deg, #07162e 0%, #123d7a 100%)',
      pattern: 'stripes', patternColor: 'rgba(255,255,255,.08)', text: '#ffffff', accent: '#a5f3fc', chip: 'gold' }) },
  { all: ['flipkart'], label: 'Flipkart Axis', bank: 'Axis Bank', network: 'mastercard', type: 'credit', cobrand: { domain: 'flipkart.com', name: 'Flipkart' }, design: d('flipkart', 'Flipkart', {
      background: 'radial-gradient(70% 70% at 100% 100%, #facc15 0%, transparent 50%), linear-gradient(135deg, #1e40af 0%, #2874f0 100%)',
      pattern: 'swoosh', patternColor: 'rgba(255,255,255,.16)', text: '#ffffff', accent: '#fef08a', chip: 'gold' }) },
  { all: ['reserve'], label: 'Axis Reserve', bank: 'Axis Bank', type: 'credit', design: metal('axis-reserve', 'Reserve',
      'linear-gradient(135deg, #070707 0%, #25201a 100%)', 'rings', 'rgba(212,175,55,.14)', '#efdca0', '#d4af37') },
  { all: ['ace'], label: 'Axis ACE', bank: 'Axis Bank', network: 'visa', type: 'credit', design: d('axis-ace', 'ACE', {
      background: 'radial-gradient(70% 80% at 90% 10%, #a855f7 0%, transparent 55%), linear-gradient(135deg, #0b1230 0%, #1e3a8a 100%)',
      pattern: 'waves', patternColor: 'rgba(255,255,255,.16)', text: '#ffffff', accent: '#c4b5fd', chip: 'gold' }) },
  { all: ['airtel'], label: 'Airtel Axis', bank: 'Axis Bank', type: 'credit', design: d('airtel-axis', 'Airtel', {
      background: 'radial-gradient(80% 70% at 90% 0%, #fb7185 0%, transparent 55%), linear-gradient(135deg, #7f1018 0%, #e40000 100%)',
      pattern: 'rings', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#fecaca', chip: 'gold' }) },

  // SBI
  { all: ['sbi', 'elite'], label: 'SBI Elite', bank: 'State Bank of India', type: 'credit', design: metal('sbi-elite', 'SBI Elite',
      'linear-gradient(135deg, #07070a 0%, #25252b 100%)', 'lines', 'rgba(255,255,255,.06)', '#e5e7eb', '#9ca3af', 'silver') },
  { all: ['sbi', 'prime'], label: 'SBI Prime', bank: 'State Bank of India', type: 'credit', design: d('sbi-prime', 'SBI Prime', {
      background: 'radial-gradient(80% 70% at 85% 0%, #3b82f6 0%, transparent 60%), linear-gradient(135deg, #041a52 0%, #0a3d91 100%)',
      pattern: 'geo', patternColor: 'rgba(250,204,21,.18)', text: '#ffffff', accent: '#fde68a', chip: 'gold' }) },
  { all: ['cashback'], label: 'SBI Cashback', bank: 'State Bank of India', network: 'visa', type: 'credit', design: d('sbi-cashback', 'Cashback', {
      background: 'radial-gradient(80% 70% at 100% 100%, #22d3ee 0%, transparent 55%), linear-gradient(135deg, #0a2a6e 0%, #1d4ed8 100%)',
      pattern: 'swoosh', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#a5f3fc', chip: 'gold' }) },
  { all: ['simplyclick'], label: 'SBI SimplyCLICK', bank: 'State Bank of India', type: 'credit', design: d('sbi-simplyclick', 'SimplyCLICK', {
      background: 'radial-gradient(80% 80% at 90% 0%, #fb923c 0%, transparent 55%), linear-gradient(135deg, #0a2a6e 0%, #1e40af 100%)',
      pattern: 'dots', patternColor: 'rgba(255,255,255,.3)', text: '#ffffff', accent: '#fed7aa', chip: 'gold' }) },
  { all: ['simply', 'click'], label: 'SBI SimplyCLICK', bank: 'State Bank of India', type: 'credit', design: d('sbi-simplyclick2', 'SimplyCLICK', {
      background: 'radial-gradient(80% 80% at 90% 0%, #fb923c 0%, transparent 55%), linear-gradient(135deg, #0a2a6e 0%, #1e40af 100%)',
      pattern: 'dots', patternColor: 'rgba(255,255,255,.3)', text: '#ffffff', accent: '#fed7aa', chip: 'gold' }) },

  // Kotak / IDFC / IndusInd / RBL / others
  { all: ['kotak', 'league'], label: 'Kotak League', bank: 'Kotak Mahindra Bank', type: 'credit', design: d('kotak-league', 'League', {
      background: 'radial-gradient(80% 70% at 85% 0%, #ef4444 0%, transparent 60%), linear-gradient(135deg, #2a0707 0%, #991b1b 100%)',
      pattern: 'geo', patternColor: 'rgba(255,255,255,.1)', text: '#ffffff', accent: '#fecaca', chip: 'gold' }) },
  { all: ['811'], label: 'Kotak 811', bank: 'Kotak Mahindra Bank', type: 'debit', design: d('kotak-811', '811', {
      background: 'radial-gradient(80% 80% at 90% 0%, #fb7185 0%, transparent 55%), linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)',
      pattern: 'rings', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#fecaca', chip: 'gold' }) },
  { all: ['idfc', 'wealth'], label: 'IDFC FIRST Wealth', bank: 'IDFC FIRST Bank', network: 'visa', type: 'credit', design: metal('idfc-wealth', 'FIRST Wealth',
      'radial-gradient(80% 70% at 90% 0%, #e11d48 0%, transparent 55%), linear-gradient(135deg, #0a0f2e 0%, #1e1b6b 100%)', 'waves', 'rgba(255,255,255,.12)', '#ffffff', '#fda4af') },
  { all: ['idfc', 'select'], label: 'IDFC FIRST Select', bank: 'IDFC FIRST Bank', type: 'credit', design: d('idfc-select', 'FIRST Select', {
      background: 'radial-gradient(80% 70% at 90% 0%, #f43f5e 0%, transparent 55%), linear-gradient(135deg, #0f1b4d 0%, #1d3a8f 100%)',
      pattern: 'waves', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#fecdd3', chip: 'gold' }) },
  { all: ['legend'], label: 'IndusInd Legend', bank: 'IndusInd Bank', type: 'credit', design: metal('indusind-legend', 'Legend',
      'radial-gradient(80% 70% at 85% 0%, #7a1e2c 0%, transparent 60%), linear-gradient(135deg, #0a0506 0%, #2b0d12 100%)', 'rings', 'rgba(212,175,55,.16)', '#efdca0', '#d4af37') },
  { all: ['iconia'], label: 'IndusInd Iconia', bank: 'IndusInd Bank', type: 'credit', design: metal('indusind-iconia', 'Iconia',
      'linear-gradient(135deg, #5b2a3a 0%, #e8b4a0 60%, #b9776a 100%)', 'lines', 'rgba(255,255,255,.12)', '#3b1f1c', '#5c342f') },
  { all: ['onecard'], label: 'OneCard', bank: 'OneCard', network: 'visa', type: 'credit', design: metal('onecard', 'OneCard',
      'linear-gradient(135deg, #050505 0%, #1b1b1d 100%)', 'lines', 'rgba(255,255,255,.07)', '#fafafa', '#a1a1aa', 'silver') },
  { all: ['jupiter'], label: 'Jupiter', bank: 'Jupiter', type: 'debit', design: d('jupiter', 'Jupiter', {
      background: 'radial-gradient(70% 80% at 90% 10%, #8b5cf6 0%, transparent 55%), linear-gradient(135deg, #0b0b2a 0%, #3730a3 100%)',
      pattern: 'rings', patternColor: 'rgba(255,255,255,.12)', text: '#ffffff', accent: '#c4b5fd', chip: 'silver' }) },
  { all: ['slice'], label: 'slice', bank: 'slice', type: 'credit', design: d('slice', 'slice', {
      background: 'radial-gradient(70% 70% at 10% 100%, #22d3ee 0%, transparent 55%), linear-gradient(135deg, #3b0a6b 0%, #7c3aed 100%)',
      pattern: 'dots', patternColor: 'rgba(255,255,255,.25)', text: '#ffffff', accent: '#a5f3fc', chip: 'silver' }) },
  { all: ['ultimate', 'standard'], label: 'Standard Chartered Ultimate', bank: 'Standard Chartered', type: 'credit', design: metal('sc-ultimate', 'Ultimate',
      'radial-gradient(80% 70% at 90% 0%, #059669 0%, transparent 55%), linear-gradient(135deg, #040807 0%, #17211d 100%)', 'lines', 'rgba(255,255,255,.07)', '#e5e7eb', '#34d399', 'silver') },

  // American Express
  { all: ['amex', 'platinum'], label: 'Amex Platinum', bank: 'American Express', network: 'amex', type: 'credit', design: metal('amex-platinum', 'Platinum',
      'linear-gradient(135deg, #8b9098 0%, #eef0f3 48%, #8b9098 100%)', 'lines', 'rgba(0,0,0,.06)', '#1f2937', '#374151', 'silver') },
  { all: ['american express', 'platinum'], label: 'Amex Platinum', bank: 'American Express', network: 'amex', type: 'credit', design: metal('amex-platinum2', 'Platinum',
      'linear-gradient(135deg, #8b9098 0%, #eef0f3 48%, #8b9098 100%)', 'lines', 'rgba(0,0,0,.06)', '#1f2937', '#374151', 'silver') },
  { all: ['amex', 'gold'], label: 'Amex Gold', bank: 'American Express', network: 'amex', type: 'credit', design: metal('amex-gold', 'Gold',
      'radial-gradient(90% 80% at 20% 0%, #fff1c2 0%, transparent 55%), linear-gradient(135deg, #8a5a10 0%, #e6b655 55%, #b8801f 100%)', 'lines', 'rgba(255,255,255,.14)', '#3b2506', '#5a3a0c') },
  { all: ['amex'], label: 'American Express', bank: 'American Express', network: 'amex', design: d('amex', 'Amex', {
      background: 'radial-gradient(90% 80% at 90% 0%, #60a5fa 0%, transparent 55%), linear-gradient(135deg, #0a2a5e 0%, #2563eb 100%)',
      pattern: 'rings', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#bfdbfe', chip: 'silver' }) },

  // RuPay without a more specific card named (after every bank-specific card above)
  { all: ['rupay', 'credit'], label: 'RuPay Credit', network: 'rupay', type: 'credit', design: d('rupay-credit', 'RuPay Credit', {
      background: 'radial-gradient(90% 80% at 90% 0%, rgba(243,112,33,.5), transparent 55%), linear-gradient(135deg, #0f1f5c 0%, #1e40af 100%)',
      pattern: 'waves', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#fed7aa', chip: 'gold' }) },
  { all: ['rupay'], label: 'RuPay', network: 'rupay', design: d('rupay', 'RuPay', {
      background: 'radial-gradient(90% 80% at 90% 100%, rgba(19,136,8,.45), transparent 55%), radial-gradient(80% 80% at 5% 0%, rgba(243,112,33,.45), transparent 55%), linear-gradient(135deg, #12256b 0%, #1d3a8f 100%)',
      pattern: 'swoosh', patternColor: 'rgba(255,255,255,.1)', text: '#ffffff', accent: '#fdba74', chip: 'gold' }) },


  // Generic tiers (after the specific ones)
  { all: ['platinum'], label: 'Platinum', design: GENERIC_DESIGNS.find(g => g.id === 'platinum')! },
  { all: ['titanium'], label: 'Titanium', design: GENERIC_DESIGNS.find(g => g.id === 'graphite')! },
  { all: ['signature'], label: 'Signature', design: GENERIC_DESIGNS.find(g => g.id === 'royal')! },
  { all: ['black'], label: 'Black', design: GENERIC_DESIGNS.find(g => g.id === 'carbon')! },
  { all: ['gold'], label: 'Gold', design: GENERIC_DESIGNS.find(g => g.id === 'gold')! },
]

// ── Bank looks, for cards we don't recognise by name ─────────────────────────
export const BANK_DESIGNS: [string[], CardDesign][] = [
  [['hdfc'], d('bank-hdfc', 'HDFC', { background: 'radial-gradient(80% 70% at 90% 0%, #ef4444 0%, transparent 45%), linear-gradient(135deg, #07204f 0%, #12418f 100%)', pattern: 'stripes', patternColor: 'rgba(255,255,255,.08)', text: '#ffffff', accent: '#bfdbfe', chip: 'gold' })],
  [['icici'], d('bank-icici', 'ICICI', { background: 'radial-gradient(80% 80% at 90% 0%, #fb923c 0%, transparent 55%), linear-gradient(135deg, #5a1209 0%, #b33a12 100%)', pattern: 'waves', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#fed7aa', chip: 'gold' })],
  [['sbi', 'state bank'], d('bank-sbi', 'SBI', { background: 'radial-gradient(80% 80% at 90% 0%, #38bdf8 0%, transparent 55%), linear-gradient(135deg, #0a2a6e 0%, #1d6fd6 100%)', pattern: 'rings', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#bae6fd', chip: 'gold' })],
  [['axis'], d('bank-axis', 'Axis', { background: 'radial-gradient(80% 70% at 90% 0%, #be185d 0%, transparent 55%), linear-gradient(135deg, #3b0a1c 0%, #8c1c3c 100%)', pattern: 'swoosh', patternColor: 'rgba(255,255,255,.12)', text: '#ffffff', accent: '#fbcfe8', chip: 'gold' })],
  [['kotak'], d('bank-kotak', 'Kotak', { background: 'radial-gradient(80% 70% at 90% 0%, #3b82f6 0%, transparent 50%), linear-gradient(135deg, #7a0a0a 0%, #dc2626 100%)', pattern: 'arcs', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#fecaca', chip: 'gold' })],
  [['yes bank', 'yesbank'], d('bank-yes', 'YES', { background: 'radial-gradient(80% 70% at 90% 0%, #60a5fa 0%, transparent 55%), linear-gradient(135deg, #04204a 0%, #0b5cc2 100%)', pattern: 'geo', patternColor: 'rgba(255,255,255,.1)', text: '#ffffff', accent: '#bfdbfe', chip: 'gold' })],
  [['indusind'], d('bank-indusind', 'IndusInd', { background: 'radial-gradient(80% 70% at 90% 0%, #f59e0b 0%, transparent 50%), linear-gradient(135deg, #3a0a14 0%, #8b1a2c 100%)', pattern: 'waves', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#fde68a', chip: 'gold' })],
  [['idfc'], d('bank-idfc', 'IDFC FIRST', { background: 'radial-gradient(80% 70% at 90% 0%, #e11d48 0%, transparent 50%), linear-gradient(135deg, #0b1245 0%, #26248a 100%)', pattern: 'waves', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#fecdd3', chip: 'gold' })],
  [['rbl'], d('bank-rbl', 'RBL', { background: 'radial-gradient(80% 70% at 90% 0%, #22d3ee 0%, transparent 50%), linear-gradient(135deg, #07204f 0%, #0b5aa8 100%)', pattern: 'hex', patternColor: 'rgba(255,255,255,.1)', text: '#ffffff', accent: '#a5f3fc', chip: 'gold' })],
  [['citi'], d('bank-citi', 'Citi', { background: 'radial-gradient(80% 70% at 90% 0%, #ef4444 0%, transparent 45%), linear-gradient(135deg, #051b4a 0%, #0f4aa8 100%)', pattern: 'arcs', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#bfdbfe', chip: 'gold' })],
  [['hsbc'], metal('bank-hsbc', 'HSBC', 'radial-gradient(80% 70% at 90% 0%, #ef4444 0%, transparent 45%), linear-gradient(135deg, #0a0a0a 0%, #2a2a2e 100%)', 'lines', 'rgba(255,255,255,.07)', '#fafafa', '#fca5a5', 'silver')],
  [['standard chartered', 'sc bank'], d('bank-sc', 'Standard Chartered', { background: 'radial-gradient(80% 70% at 90% 0%, #22c55e 0%, transparent 50%), linear-gradient(135deg, #04204a 0%, #0b6bb5 100%)', pattern: 'stripes', patternColor: 'rgba(255,255,255,.08)', text: '#ffffff', accent: '#bbf7d0', chip: 'gold' })],
  [['federal'], d('bank-federal', 'Federal', { background: 'radial-gradient(80% 70% at 90% 0%, #facc15 0%, transparent 50%), linear-gradient(135deg, #07204f 0%, #1d4ed8 100%)', pattern: 'rings', patternColor: 'rgba(255,255,255,.12)', text: '#ffffff', accent: '#fef08a', chip: 'gold' })],
  [['au bank', 'au small'], d('bank-au', 'AU', { background: 'radial-gradient(80% 70% at 90% 0%, #fb923c 0%, transparent 50%), linear-gradient(135deg, #3b0a52 0%, #7c1d8f 100%)', pattern: 'waves', patternColor: 'rgba(255,255,255,.14)', text: '#ffffff', accent: '#fed7aa', chip: 'gold' })],
  [['baroda', 'bob'], d('bank-bob', 'Bank of Baroda', { background: 'radial-gradient(80% 80% at 90% 0%, #fb923c 0%, transparent 55%), linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)', pattern: 'swoosh', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#ffedd5', chip: 'gold' })],
  [['pnb', 'punjab national'], d('bank-pnb', 'PNB', { background: 'radial-gradient(80% 80% at 90% 0%, #facc15 0%, transparent 50%), linear-gradient(135deg, #5c0f1c 0%, #a31d34 100%)', pattern: 'rings', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#fef08a', chip: 'gold' })],
  [['canara'], d('bank-canara', 'Canara', { background: 'radial-gradient(80% 80% at 90% 0%, #facc15 0%, transparent 50%), linear-gradient(135deg, #04365a 0%, #0b7ab5 100%)', pattern: 'waves', patternColor: 'rgba(255,255,255,.13)', text: '#ffffff', accent: '#fef08a', chip: 'gold' })],
]

// ── Network detection ─────────────────────────────────────────────────────────
/** From the card number (full, or the first digits if known). */
export function detectNetwork(cardNumber: string): Network {
  const digits = cardNumber.replace(/\D/g, '')
  if (digits.length < 2) return 'other'
  if (digits.startsWith('4')) return 'visa'
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]\d|7[01]|720)/.test(digits)) return 'mastercard'
  if (/^3[47]/.test(digits)) return 'amex'
  // RuPay: 60, 65, 81, 82, 508, plus the JCB-partnered 353 / 356 ranges
  if (/^(60|65|81|82|508|353|356)/.test(digits)) return 'rupay'
  return 'other'
}

/** From words in the card / bank name, e.g. "SBI RuPay Platinum" → rupay. */
export function networkFromText(text: string): Network {
  const t = text.toLowerCase()
  if (/\brupay\b|\bru-pay\b/.test(t)) return 'rupay'
  if (/\bamex\b|american express/.test(t)) return 'amex'
  if (/master\s?card|\bmc\b/.test(t)) return 'mastercard'
  if (/\bvisa\b/.test(t)) return 'visa'
  return 'other'
}

export function typeFromText(text: string): CardType | null {
  const t = text.toLowerCase()
  if (/\bdebit\b/.test(t)) return 'debit'
  if (/\bprepaid\b|\bforex\b|\bgift\b/.test(t)) return 'prepaid'
  if (/\bcredit\b/.test(t)) return 'credit'
  return null
}

// ── Resolving a card's look ───────────────────────────────────────────────────
const hashIndex = (s: string, n: number) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % n
}

/** The catalogue entry that best matches what the user typed, if any. */
export function matchCatalog(cardName: string, bankName = ''): CatalogCard | null {
  const text = `${cardName} ${bankName}`.toLowerCase()
  if (!cardName.trim()) return null
  return CARD_CATALOG.find(c => c.all.every(w => text.includes(w))) ?? null
}

export interface ResolvedLook {
  design: CardDesign
  /** The user's own image, when they chose one */
  image: string | null
  match: CatalogCard | null
}

export function resolveLook(card: { card_name: string; bank_name: string; color?: string | null }): ResolvedLook {
  const color = card.color ?? 'auto'
  const match = matchCatalog(card.card_name, card.bank_name)

  if (color.startsWith('img:')) {
    return { design: match?.design ?? GENERIC_BY_ID.get('carbon')!, image: color.slice(4), match }
  }
  // An explicit pick of a design that isn't one of the old default presets
  const picked = GENERIC_BY_ID.get(color)
  if (picked && !LEGACY_IDS.has(color)) return { design: picked, image: null, match }

  if (match) return { design: match.design, image: null, match }

  const bank = card.bank_name.toLowerCase()
  const bankLook = BANK_DESIGNS.find(([keys]) => keys.some(k => bank.includes(k)))
  if (bankLook) return { design: bankLook[1], image: null, match: null }

  if (picked) return { design: picked, image: null, match: null } // legacy preset, nothing better known
  const pool = GENERIC_DESIGNS.filter(g => !LEGACY_IDS.has(g.id) || g.id === 'blue')
  return { design: pool[hashIndex(card.card_name || card.bank_name || 'card', pool.length)], image: null, match: null }
}
