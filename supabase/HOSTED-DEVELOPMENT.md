# Hosted development

Project: `horarium-classium-dev`
Reference: `soqjiqvapluubkibzrut`
Organization: `armenbadal`
Region: `eu-central-1` (Frankfurt)
Dashboard: https://supabase.com/dashboard/project/soqjiqvapluubkibzrut
API URL: https://soqjiqvapluubkibzrut.supabase.co

## Applied and verified

- Three repository migrations applied, without seed data or test users.
- Local/remote migration history matches; remote database lint passed.
- Auth public signup disabled; site URL is https://armenbadal.github.io/horarium-classium/. Redirects retain the local development URLs and allow https://armenbadal.github.io/horarium-classium/activate.html. Updated 2026-09-23; other hosted Auth settings were left unchanged.
- Teacher still uses localStorage. No cloud login UI, data adapter, import, publication RPC or Student integration yet.

## Credentials

The generated database password is stored in repository-root `.env.supabase-dev.local`, excluded by Git and owner-readable only. It is not a frontend environment file. Move the password into your password manager; do not commit or send it in chat. Supabase CLI login is separate.

## Subsequent deployments

Run from repository root. Check the linked project before every remote operation. Export SUPABASE_DB_PASSWORD from the local credential file securely without printing it.

```sh
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase db lint --linked --fail-on error
```

Never pass `--include-seed` for this hosted project. Never run remote reset or the local test suite against it. Existing migrations are now deployed: use NEW migrations for subsequent schema changes.

Hosted Auth settings are intentionally separate from the local config:

```sh
npx supabase config diff --project-ref soqjiqvapluubkibzrut --workdir supabase/environments/development
npx supabase config push --project-ref soqjiqvapluubkibzrut --workdir supabase/environments/development
```

Inspect declared updates before pushing. Do not push the root local config: it enables local test signup.

Next: create the real development administrator account and school membership, then implement Teacher authentication and cloud persistence. Import local data as a separate backed-up operation; do not use local seed accounts remotely.

## Account recreation — 2026-09-23

The requested existing Auth account was deleted and a fresh invitation sent to the same email. Activation is pending. Account deletion cascades to its profile and school memberships; those are not automatically restored for the new user ID.
