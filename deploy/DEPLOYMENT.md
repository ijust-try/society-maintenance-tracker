# Deployment plan

## Frontend

Deploy `frontend/` as a Vercel project.

Set:

`VITE_API_URL=https://<backend-domain>`

The included `vercel.json` rewrites SPA paths to `index.html`.

## Backend

Keep the existing FastAPI application on a normal Python web service. The included `render.yaml` is a deployment template and assumes the existing repository root already contains `main.py`, `backend.py`, and the existing hostel route files.

Set `FRONTEND_ORIGINS` to the exact Vercel origin. Do not use `*` with credentialed requests.

## Database

Run `backend/society_schema.sql` once. It is additive and does not drop existing hostel tables.

## Images

Create a Cloudinary account and set the three Cloudinary environment variables. The API validates MIME type and size before sending the image to Cloudinary and only accepts returned public IDs in the configured folder.

## Email

Use the existing Gmail SMTP setup with an app password. Email delivery failures are stored as failed notification events and can be retried by an admin.
