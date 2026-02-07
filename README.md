# Beds25 - Booking System with Zoho CRM Integration

A modern, Next.js-based booking management system for hotels and accommodations, integrated with Zoho CRM for centralized customer relationship management.

## Features

- 📅 **Interactive Calendar** - Tape chart view for room availability
- 🏨 **Room Management** - Configure rooms, pricing, and constraints
- 👥 **Guest Management** - Integrated with Zoho CRM Contacts
- 📊 **Reporting** - Occupancy and revenue reports
- 🔄 **Channel Integration** - iCal sync for Airbnb, Booking.com, etc.
- 🌐 **Zoho CRM Sync** - Automatic bidirectional data sync

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (local cache) + Zoho CRM (source of truth)
- **ORM**: Prisma
- **API**: Zoho CRM REST API v6

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Zoho CRM account with API credentials

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Beds25
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your Zoho CRM credentials:
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`
- `ZOHO_DOMAIN` (`.com` or `.eu`)

4. Initialize the database:
```bash
npx prisma generate
npx prisma db push
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Zoho CRM Setup

See [ZOHO_INTEGRATION.md](./ZOHO_INTEGRATION.md) for detailed setup instructions.

### Required Modules in Zoho CRM:
- **Contacts** (standard)
- **Bookings** (custom module)
- **Rooms** (custom module)

## Deployment

See deployment guides in `/docs` folder for:
- VPS deployment with PM2
- Cloud deployment (Vercel/Railway)
- GitHub Actions automation

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQLite database path | Yes |
| `ZOHO_CLIENT_ID` | Zoho OAuth Client ID | Yes |
| `ZOHO_CLIENT_SECRET` | Zoho OAuth Client Secret | Yes |
| `ZOHO_REFRESH_TOKEN` | Zoho OAuth Refresh Token | Yes |
| `ZOHO_DOMAIN` | `.com` or `.eu` | Yes |
| `ZOHO_ACCOUNTS_URL` | Zoho accounts URL | Yes |
| `ZOHO_API_DOMAIN` | Zoho API domain | Yes |

## Project Structure

```
Beds25/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities and services
│   │   ├── zoho.ts       # Zoho API client
│   │   ├── zoho-service.ts # Zoho service layer
│   │   └── prisma.ts     # Prisma client
│   └── styles/           # Global styles
├── prisma/
│   └── schema.prisma     # Database schema
├── public/               # Static assets
└── scripts/              # Utility scripts
```

## License

Proprietary - All rights reserved

## Support

For issues or questions, contact the development team.
