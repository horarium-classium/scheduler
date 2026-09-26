# Hosted development

Project: `horarium-classium-dev`
Reference: `soqjiqvapluubkibzrut`
Organization: `armenbadal`
Region: `eu-central-1` (Frankfurt)
Dashboard: https://supabase.com/dashboard/project/soqjiqvapluubkibzrut
API URL: https://soqjiqvapluubkibzrut.supabase.co

## Applied and verified

- Repository migrations through `202609260004_stable_join_code_allocation.sql` applied, including the publication and four-letter class join-code migrations, without seed data or test users.
- Local/remote migration history matches; remote database lint passed.
- Auth public signup disabled; site URL is https://armenbadal.github.io/horarium-classium/. Redirects retain the local development URLs and allow https://armenbadal.github.io/horarium-classium/activate.html. Updated 2026-09-23; other hosted Auth settings were left unchanged.
- Teacher Auth is verified by the user. The cloud data adapter and workspace RPCs are implemented; the frontend changes require publication. Publication RPCs and Student integration are implemented; no local-data import was performed.

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

The confirmed user account is linked as admin of the existing «Տնային դպրոց» (`ea6de536-fe82-48bf-8635-c2118cc56751`). No duplicate school was created. Import local data as a separate backed-up operation; do not use local seed accounts remotely.

## Account recreation — 2026-09-23

The requested existing Auth account was deleted and a fresh invitation sent to the same email. Activation and login/logout were subsequently verified. Account deletion cascaded to its old memberships; the new account has now been explicitly linked to «Տնային դպրոց» as admin.

## Publication migration (local implementation)

`202609240001_publication.sql`, `202609260001_class_join_codes.sql`, `202609260002_publication_uuid_compatibility.sql`, and `202609260003_join_code_generator_lint_fix.sql` are applied to this hosted project. The remote migration history matches the repository and linked database lint reports no schema errors. The publication contract now supports four-letter class join codes while the UUID RPC remains as a compatibility path for older Student builds. See `PUBLICATION.md` for the contract and validation limits.

## Invite flow fix — pending deployment

The activation page handles invite/recovery callbacks with isolated in-memory credentials; it does not replace an existing browser login. Old invitation callbacks landing at the main page are forwarded to `activate.html` before normal authentication. After password setup, use the normal login page (sign out first if another account is already logged in). Missing/expired links require a new invitation; a page refresh clears the transient activation credentials. School membership must be assigned separately.

The hosted configuration now declares `activate.html` as Site URL. This local declaration has NOT been applied remotely. First publish and verify the Teacher Pages build, including activation assets under `/horarium-classium/`; then inspect the linked project's hosted config diff and apply only the intended URL changes. Preserve the default Invite email `{{ .ConfirmationURL }}` template. Do not push the root local Supabase config.

Verify one new Dashboard invitation end to end, an old still-valid root redirect, expired/reused links, recovery, password rejection/network retry, and a browser already signed into a different account. Confirm that an unassigned user sees the membership message. Email rate limiting is separate; avoid repeated invitation sends.

## Join-code correction — 2026-09-26

Applied `202609260004_stable_join_code_allocation.sql` after checking the linked project and a dry run listing only this migration. Earlier deployed migration files were not rewritten. The transaction preserves existing codes, reserves them in a private table, prevents code updates/reuse and handles concurrent allocation collisions with bounded retries.

All nine existing public tables have identical row counts and content fingerprints before/after deployment. Read-only checks confirmed valid unique codes, publication/class identity, RLS, validated constraints, complete reservations, blocked client access to reservations, the immutable trigger and both UUID/text public RPCs. Remote lint passed and migration history matches. No hosted seed, test fixtures, reset or Auth configuration change was performed.

A proposed full public-data backup export was rejected by automatic approval review because it could copy sensitive data to local temporary storage; no dump was created. Verification used aggregate fingerprints and read-only integrity checks. This is not a backup/restore verification.
