# Deployment Runbook

This service uses Prisma Migrate for production schema management.

## Deploy Order

1. Install dependencies.
2. Build the API.
3. Run `npm run start:prod`.
4. The `prestart:prod` lifecycle hook runs `npm run prisma:deploy`.
5. Prisma applies any pending migrations with `prisma migrate deploy`.
6. Only after migrations succeed does `node dist/main` start the new API version.

## Migration Tracking

Prisma records migration history in the `_prisma_migrations` table.
That table is the source of truth for which migrations have already been applied
in a given environment.

## Rollback Plan

Prisma does not automatically roll back applied production migrations.
Use this order of operations instead:

1. Stop the newly deployed API version.
2. Redeploy the previous known-good application release.
3. If the schema change was backward-compatible, keep the database as-is and
   rely on the older app version.
4. If the migration was not backward-compatible, restore the last database
   backup or snapshot taken before the deployment window.
5. Once the database state matches the restored application version, reconcile
   migration metadata if needed with Prisma commands such as
   `prisma migrate resolve`.

## Operational Rules

- Use `prisma migrate dev` only in local development.
- Never use `prisma migrate reset` in production.
- Prefer additive, backward-compatible migrations so rollbacks only require an
  application redeploy.
