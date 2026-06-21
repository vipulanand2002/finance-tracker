import sharp from 'sharp'

const dashboardSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1920" fill="#09090b"/>
  <rect x="0" y="0" width="1080" height="120" fill="#18181b"/>
  <text x="60" y="78" font-family="Arial" font-size="52" font-weight="bold" fill="white">Finance Tracker</text>
  <rect x="40" y="160" width="300" height="180" rx="20" fill="#18181b"/>
  <text x="80" y="220" font-family="Arial" font-size="28" fill="#71717a">Income</text>
  <text x="80" y="300" font-family="Arial" font-size="48" font-weight="bold" fill="#22c55e">+45,000</text>
  <rect x="380" y="160" width="300" height="180" rx="20" fill="#18181b"/>
  <text x="420" y="220" font-family="Arial" font-size="28" fill="#71717a">Expenses</text>
  <text x="420" y="300" font-family="Arial" font-size="48" font-weight="bold" fill="#ef4444">-28,500</text>
  <rect x="720" y="160" width="300" height="180" rx="20" fill="#18181b"/>
  <text x="760" y="220" font-family="Arial" font-size="28" fill="#71717a">Balance</text>
  <text x="760" y="300" font-family="Arial" font-size="48" font-weight="bold" fill="white">16,500</text>
  <rect x="40" y="380" width="1000" height="500" rx="20" fill="#18181b"/>
  <text x="80" y="440" font-family="Arial" font-size="36" font-weight="bold" fill="white">Spending Overview</text>
  <circle cx="540" cy="640" r="200" fill="none" stroke="#27272a" stroke-width="60"/>
  <circle cx="540" cy="640" r="200" fill="none" stroke="#22c55e" stroke-width="60" stroke-dasharray="502 754" stroke-dashoffset="0"/>
  <circle cx="540" cy="640" r="200" fill="none" stroke="#3b82f6" stroke-width="60" stroke-dasharray="300 956" stroke-dashoffset="-502"/>
  <circle cx="540" cy="640" r="200" fill="none" stroke="#f59e0b" stroke-width="60" stroke-dasharray="200 1056" stroke-dashoffset="-802"/>
  <rect x="40" y="920" width="1000" height="860" rx="20" fill="#18181b"/>
  <text x="80" y="980" font-family="Arial" font-size="36" font-weight="bold" fill="white">Recent Transactions</text>
  <line x1="60" y1="1010" x2="1020" y2="1010" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="1070" font-family="Arial" font-size="32" fill="white">Groceries</text>
  <text x="80" y="1110" font-family="Arial" font-size="26" fill="#71717a">Food - Today</text>
  <text x="980" y="1090" font-family="Arial" font-size="36" font-weight="bold" fill="#ef4444" text-anchor="end">-850</text>
  <line x1="60" y1="1140" x2="1020" y2="1140" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="1200" font-family="Arial" font-size="32" fill="white">Salary</text>
  <text x="80" y="1240" font-family="Arial" font-size="26" fill="#71717a">Income - Yesterday</text>
  <text x="980" y="1220" font-family="Arial" font-size="36" font-weight="bold" fill="#22c55e" text-anchor="end">+45,000</text>
  <line x1="60" y1="1270" x2="1020" y2="1270" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="1330" font-family="Arial" font-size="32" fill="white">Restaurant</text>
  <text x="80" y="1370" font-family="Arial" font-size="26" fill="#71717a">Food - 2 days ago</text>
  <text x="980" y="1350" font-family="Arial" font-size="36" font-weight="bold" fill="#ef4444" text-anchor="end">-1,200</text>
  <line x1="60" y1="1400" x2="1020" y2="1400" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="1460" font-family="Arial" font-size="32" fill="white">Netflix</text>
  <text x="80" y="1500" font-family="Arial" font-size="26" fill="#71717a">Entertainment - Jun 18</text>
  <text x="980" y="1480" font-family="Arial" font-size="36" font-weight="bold" fill="#ef4444" text-anchor="end">-649</text>
  <rect x="0" y="1820" width="1080" height="100" fill="#18181b"/>
  <text x="120" y="1878" font-family="Arial" font-size="30" fill="#22c55e" text-anchor="middle">Home</text>
  <text x="360" y="1878" font-family="Arial" font-size="30" fill="#71717a" text-anchor="middle">Transactions</text>
  <text x="720" y="1878" font-family="Arial" font-size="30" fill="#71717a" text-anchor="middle">Trips</text>
  <text x="960" y="1878" font-family="Arial" font-size="30" fill="#71717a" text-anchor="middle">Splits</text>
</svg>`

const txSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1920" fill="#09090b"/>
  <rect x="0" y="0" width="1080" height="120" fill="#18181b"/>
  <text x="60" y="78" font-family="Arial" font-size="52" font-weight="bold" fill="white">Transactions</text>
  <rect x="40" y="140" width="980" height="80" rx="14" fill="#18181b"/>
  <text x="80" y="190" font-family="Arial" font-size="30" fill="#52525b">Search transactions...</text>
  <rect x="40" y="250" width="1000" height="1520" rx="20" fill="#18181b"/>
  <text x="80" y="320" font-family="Arial" font-size="28" font-weight="bold" fill="#52525b">JUNE 2025</text>
  <line x1="60" y1="340" x2="1020" y2="340" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="405" font-family="Arial" font-size="34" fill="white">Groceries</text>
  <text x="80" y="445" font-family="Arial" font-size="26" fill="#71717a">Food - Jun 21</text>
  <text x="980" y="425" font-family="Arial" font-size="36" font-weight="bold" fill="#ef4444" text-anchor="end">-850</text>
  <line x1="60" y1="470" x2="1020" y2="470" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="535" font-family="Arial" font-size="34" fill="white">Salary</text>
  <text x="80" y="575" font-family="Arial" font-size="26" fill="#71717a">Income - Jun 20</text>
  <text x="980" y="555" font-family="Arial" font-size="36" font-weight="bold" fill="#22c55e" text-anchor="end">+45,000</text>
  <line x1="60" y1="600" x2="1020" y2="600" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="665" font-family="Arial" font-size="34" fill="white">Restaurant</text>
  <text x="80" y="705" font-family="Arial" font-size="26" fill="#71717a">Food - Jun 19</text>
  <text x="980" y="685" font-family="Arial" font-size="36" font-weight="bold" fill="#ef4444" text-anchor="end">-1,200</text>
  <line x1="60" y1="730" x2="1020" y2="730" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="795" font-family="Arial" font-size="34" fill="white">Netflix</text>
  <text x="80" y="835" font-family="Arial" font-size="26" fill="#71717a">Entertainment - Jun 18</text>
  <text x="980" y="815" font-family="Arial" font-size="36" font-weight="bold" fill="#ef4444" text-anchor="end">-649</text>
  <line x1="60" y1="860" x2="1020" y2="860" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="925" font-family="Arial" font-size="34" fill="white">Petrol</text>
  <text x="80" y="965" font-family="Arial" font-size="26" fill="#71717a">Transport - Jun 17</text>
  <text x="980" y="945" font-family="Arial" font-size="36" font-weight="bold" fill="#ef4444" text-anchor="end">-2,500</text>
  <line x1="60" y1="990" x2="1020" y2="990" stroke="#27272a" stroke-width="2"/>
  <text x="80" y="1055" font-family="Arial" font-size="34" fill="white">Freelance</text>
  <text x="80" y="1095" font-family="Arial" font-size="26" fill="#71717a">Income - Jun 15</text>
  <text x="980" y="1075" font-family="Arial" font-size="36" font-weight="bold" fill="#22c55e" text-anchor="end">+12,000</text>
  <rect x="0" y="1820" width="1080" height="100" fill="#18181b"/>
  <text x="120" y="1878" font-family="Arial" font-size="30" fill="#71717a" text-anchor="middle">Home</text>
  <text x="360" y="1878" font-family="Arial" font-size="30" fill="#22c55e" text-anchor="middle">Transactions</text>
  <text x="720" y="1878" font-family="Arial" font-size="30" fill="#71717a" text-anchor="middle">Trips</text>
  <text x="960" y="1878" font-family="Arial" font-size="30" fill="#71717a" text-anchor="middle">Splits</text>
</svg>`

await Promise.all([
  sharp(Buffer.from(dashboardSvg)).png().toFile('public/screenshots/dashboard.png'),
  sharp(Buffer.from(txSvg)).png().toFile('public/screenshots/transactions.png'),
])

console.log('Screenshots generated.')
