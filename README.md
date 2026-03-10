# Crypto4Pro

A modern, professional, high-performance crypto exchange frontend built with Next.js 14, React, TypeScript, and Tailwind CSS.

![Crypto4Pro](https://via.placeholder.com/1200x630/0a0b0c/14b8a6?text=Crypto4Pro)

## 🚀 Features

- **Landing Page** - Stunning 3D hero section with React Three Fiber, animated particles, and financial network visualization
- **Authentication** - Smooth login/register flows with security-focused UI
- **Dashboard** - Real-time portfolio overview with animated price updates
- **Trading Interface** - Professional trading UI with orderbook, charts, and order forms
- **Settings** - Comprehensive security and account management

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **3D Graphics**: React Three Fiber (lazy-loaded, landing page only)
- **Animations**: Framer Motion
- **Charts**: Lightweight Charts (TradingView)
- **State**: Zustand
- **Virtualization**: TanStack Virtual

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── auth/              # Authentication pages
│   │   ├── login/
│   │   └── register/
│   ├── dashboard/         # Main dashboard
│   ├── trade/[pair]/      # Trading interface
│   ├── settings/          # User settings
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Landing page
│   └── globals.css        # Global styles
│
├── components/
│   ├── ui/                # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Skeleton.tsx
│   │   ├── Tabs.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   ├── Select.tsx
│   │   └── AnimatedNumber.tsx
│   │
│   ├── layout/            # Layout components
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── Footer.tsx
│   │
│   ├── landing/           # Landing page components
│   │   ├── Hero3D.tsx     # 3D hero with React Three Fiber
│   │   ├── Features.tsx
│   │   ├── MarketTicker.tsx
│   │   ├── Stats.tsx
│   │   └── CTA.tsx
│   │
│   └── trading/           # Trading components
│       ├── Orderbook.tsx
│       ├── TradingChart.tsx
│       ├── OrderForm.tsx
│       └── RecentTrades.tsx
│
├── hooks/                 # Custom React hooks
│   └── index.ts
│
├── lib/                   # Utilities and helpers
│   ├── utils.ts
│   ├── mock-data.ts
│   └── websocket.ts       # WebSocket abstraction
│
└── types/                 # TypeScript types
    └── index.ts
```

## 🎨 Design System

### Colors

- **Brand**: Teal gradient (`#14b8a6` → `#2dd4bf`)
- **Surfaces**: Dark grays (`#0a0b0c` → `#1e2028`)
- **Profit**: Green (`#22c55e`)
- **Loss**: Red (`#ef4444`)

### Typography

- **Display**: Clash Display (custom)
- **Sans**: Geist Sans
- **Mono**: Geist Mono

### Animations

- Page transitions: 200-300ms
- Micro-interactions: 150-200ms
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`

## 🚦 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/crypto4pro.git

# Navigate to project directory
cd crypto4pro

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

Create a `.env.local` file:

```env
# API Configuration
NEXT_PUBLIC_API_URL=https://api.crypto4.pro
NEXT_PUBLIC_WS_URL=wss://ws.crypto4.pro

# Analytics (optional)
NEXT_PUBLIC_GA_ID=
```

## 📊 Performance

The application is optimized for high performance:

- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Frame Rate**: 50-60 FPS
- **Lighthouse Score**: 90+

### Optimizations

- Lazy loading for Three.js components
- Virtualized orderbook lists
- Memoized components
- GPU-accelerated animations (transform, opacity)
- WebSocket connection pooling
- Automatic performance monitoring with graceful degradation

## 🔧 Development

### Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Code Style

- ESLint + Prettier configuration
- TypeScript strict mode
- Component-based architecture
- Barrel exports for clean imports

## 🧪 Testing

```bash
npm run test        # Run unit tests
npm run test:e2e    # Run E2E tests
npm run test:cov    # Generate coverage report
```

## 📦 Deployment

### Vercel (Recommended)

```bash
npm i -g vercel
vercel
```

### Docker

```bash
docker build -t crypto4pro .
docker run -p 3000:3000 crypto4pro
```

## 🔐 Security Features

- Two-factor authentication UI
- Session management
- API key management
- Security alerts
- Password strength indicators
- Secure login with encryption notices

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Framer Motion](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com/)

---

Built with ❤️ by the Crypto4Pro Team

