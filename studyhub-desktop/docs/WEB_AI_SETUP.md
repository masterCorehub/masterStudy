# Configuring the web AI service

The web app sends AI requests to the same-origin `/api/study-ai` Vercel function. The function verifies the signed-in user with Supabase Auth, checks the per-account quota, and calls Gemini. The browser never receives the provider key and does not download a model.

## Supabase setup

Apply `supabase/migrations/006_study_ai_quota.sql` to the production Supabase project. It adds a private usage counter and allows each account up to five requests per minute and sixty per UTC day. The function is executable only with the Supabase service role key; browser roles cannot query the usage table.

## Vercel environment variables

Set these in the Vercel project for Production, Preview, and Development as appropriate:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — private server variable; never prefix it with `VITE_`.
- `GEMINI_API_KEY` — private server variable; never prefix it with `VITE_`.
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`.

The client still needs the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables to sign users in. Do not put the service role key or Gemini key in any `VITE_` variable, app setting, or committed `.env` file.

After applying the migration and setting the variables, redeploy the Vercel project. The Estúdio de Estudo, note writing assistant, and journal assistant use this API when opened in the web app. The Electron app keeps its existing native AI providers.
