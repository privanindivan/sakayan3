# Sakayan

A community-powered public transit map app for Filipino commuters — covering jeepneys, buses, and UV Express routes.

## Overview

Sakayan lets commuters collaboratively map and discover public transit routes in the Philippines. Users can add transit stops, view and comment on routes, and search for places — all layered on top of an interactive map.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Neon (PostgreSQL serverless)
- **Auth**: JWT via HTTP-only cookies
- **Map**: Leaflet (client-side only, loaded dynamically)
- **Image uploads**: Cloudinary
- **Geocoding**: Geoapify (primary) + Nominatim OSM (fallback)
- **Deploy**: Vercel

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd sakayan
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `JWT_SECRET` | Random secret for signing JWTs (use a strong random string) |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `GEOAPIFY_KEY` | Geoapify geocoding API key (optional — falls back to Nominatim) |
| `NEXT_PUBLIC_DEFAULT_LAT` | Default map center latitude (default: 14.5995 — Manila) |
| `NEXT_PUBLIC_DEFAULT_LNG` | Default map center longitude (default: 120.9842 — Manila) |
| `NEXT_PUBLIC_DEFAULT_ZOOM` | Default map zoom level (default: 13) |

### 3. Run database migrations

```bash
npm run migrate
```

This runs `db/schema.sql` against your Neon database, creating all tables.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- Interactive Leaflet map centered on the Philippines
- Register/login with JWT auth (HTTP-only cookie)
- Click the map to add a transit stop (requires login)
- Stops can be associated with a route, include a photo and description
- Routes displayed as colored polylines (from stored GeoJSON)
- Route panel shows stops list, comments, edit/delete controls
- Comments and upvotes on routes and stops
- Place search (Geoapify or Nominatim) with a temporary blue pin
- Photo uploads via Cloudinary

## API Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/routes` | List all routes |
| POST | `/api/routes` | Create a route (auth required) |
| PUT | `/api/routes/[id]` | Update a route (owner or admin) |
| DELETE | `/api/routes/[id]` | Soft-delete a route (admin only) |
| GET | `/api/routes/[id]/stops` | List stops for a route |
| POST | `/api/stops` | Add a stop (auth required) |
| PUT | `/api/stops/[id]` | Update a stop (owner or admin) |
| DELETE | `/api/stops/[id]` | Delete a stop (owner or admin) |
| GET | `/api/comments` | Get comments for an entity |
| POST | `/api/comments` | Post a comment (auth required) |
| POST | `/api/comments/[id]/upvote` | Toggle upvote (auth required) |
| POST | `/api/reports` | Report content (auth required) |
| GET | `/api/search` | Search places in PH |
| POST | `/api/upload` | Upload an image to Cloudinary (auth required) |

## Deploy to Vercel

1. Push to a GitHub repository
2. Import the project in [vercel.com](https://vercel.com)
3. Add all environment variables from `.env.local.example` in the Vercel dashboard
4. Deploy — Vercel auto-detects Next.js

After first deploy, run migrations against your production Neon DB:

```bash
DATABASE_URL=<your-production-url> npm run migrate
```
