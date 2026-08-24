# Society Maintenance Tracker

This release keeps the existing hostel backend intact and adds the Society Maintenance Tracker as an additive FastAPI/React application layer.

## Stack

Frontend: React + Vite, deployable to Vercel.
Backend: existing FastAPI + PostgreSQL backend.
Images: Cloudinary signed upload flow.
Email: existing Gmail SMTP configuration.

## Database

Run `backend/society_schema.sql` once against the same PostgreSQL database. It is additive and creates only Society tables/indexes.

## Backend integration

Copy the `backend/*.py` Society files into the FastAPI backend and apply `backend/main_additions.py` to the existing `main.py`. Do not replace the existing hostel routes.

## Environment

Copy `backend/.env.example` to your backend environment and set real secrets.

Frontend Vercel environment:

`VITE_API_URL=https://YOUR-BACKEND.example.com`

Backend:

`FRONTEND_ORIGINS=https://YOUR-VERCEL-APP.vercel.app`

`FRONTEND_URL=https://YOUR-VERCEL-APP.vercel.app`

`JWT_SECRET=...`

Cloudinary credentials are required for production photo uploads.

## Photo flow

The backend authorizes a signed Cloudinary upload. The browser uploads the image directly to Cloudinary, then sends the returned URL/public ID to the complaint API. The API validates that the URL/public ID belongs to the configured Cloudinary account/folder.

Accepted formats: JPEG, PNG, WEBP. Frontend limit: 5 MB.

## Email flow

Status changes and IMPORTANT notices create unique notification events in PostgreSQL before attempting delivery. Email failure changes the event to `failed` and does not roll back the complaint or notice transaction. Admins can call the retry endpoint to attempt pending/failed events again.

## Authorization

The frontend hides admin controls for residents, but this is not a security boundary. Every protected endpoint also checks the JWT role on the backend. Resident complaint queries are additionally scoped to the authenticated resident ID.

## Vercel deployment

From `frontend/`:

```bash
npm install
npm run build
```

Deploy the `frontend/` directory as a Vercel project and set `VITE_API_URL` to the deployed backend URL.

The FastAPI backend should remain on a server runtime such as Render/Railway rather than being moved into Vercel serverless functions because the existing application uses a PostgreSQL connection pool.
