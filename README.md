# 🦅 NestLedger

> **100% Offline, Privacy-First Multi-Card & Household Financial Intelligence**

NestLedger is a modern personal finance web application built for complete privacy and deep spending insights. It parses PDF, CSV, and OFX bank statements locally on your machine—no bank logins, no cloud databases, and zero external trackers.

---

## ✨ Key Features

- 🔒 **100% Private & Offline**: All parsing and storage happen locally inside your browser (`IndexedDB`). Your financial records never touch any external server.
- 🛡️ **Zero Phone-Home (Enforced CSP)**: Strictly enforced Content Security Policy preventing all telemetry, tracking, and remote script execution.
- 📄 **Smart In-Browser Statement Parsing**: Drag and drop statements in PDF, CSV, or OFX formats from major issuers (Chase, Amex, Capital One, Citi, Discover, Bank of America, etc.).
- 🏷️ **Intelligent Categorization**: Rule-based transaction classifier with custom pattern matching and automatic merchant name normalization.
- 🔁 **Subscription Radar**: Automatically detects recurring monthly/annual subscriptions and streaming services.
- ⚠️ **Fee & Interest Analyzer**: Pinpoints avoidable bank fees, foreign transaction surcharges, and purchase interest.
- 📈 **Payoff Simulator**: Compare debt payoff methods (Avalanche vs. Snowball) with custom extra payment timelines.
- 📱 **Installable PWA**: Works offline as a desktop or mobile Progressive Web App.

---

## 🛠️ Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Modern CSS with clean dark/light themes
- **Icons**: Lucide React
- **PDF Engine**: PDF.js (in-browser extraction with locally bundled web worker)
- **Data Persistence**: IndexedDB / LocalStorage

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/rajith1981/NestLedger.git
cd NestLedger
```

### 2. Install dependencies & run
```bash
npm install
npm run dev
```

Or on Windows, simply double-click **`launch.bat`**.

---

## 🧪 Testing

Run the Vitest test suite:
```bash
npm test
```

Build for production:
```bash
npm run build
```

---

## 📄 License
MIT License — Free and open source for personal and community use.
