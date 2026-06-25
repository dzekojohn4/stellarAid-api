# SQL Injection Security Audit

## Summary

All database access in stellarAid-api goes through **Prisma ORM**, which parameterizes queries automatically. Raw SQL injection is not possible through the standard Prisma client API.

## Coverage

| Query Method | Parameterized | Notes |
|---|---|---|
| `prisma.<model>.findUnique()` | ✅ Yes | Prisma safe API |
| `prisma.<model>.findMany()` | ✅ Yes | Prisma safe API |
| `prisma.<model>.create()` | ✅ Yes | Prisma safe API |
| `prisma.<model>.update()` | ✅ Yes | Prisma safe API |
| `prisma.<model>.delete()` | ✅ Yes | Prisma safe API |
| `prisma.$queryRaw` | ✅ Yes | Uses tagged template literals (`Prisma.sql\`...\``) which are always parameterized |
| `prisma.$transaction` | ✅ Yes | Inherits parameterization from inner queries |

## Raw Query Usage

The only `$queryRaw` calls are in `src/campaigns/campaigns.service.ts` for full-text search. All use the `Prisma.sql` tagged template literal, e.g.:

```typescript
this.prisma.$queryRaw<{ count: number }[]>`
  SELECT COUNT(*)::int AS count FROM campaigns c
  WHERE ${filters.whereSql}
  AND to_tsvector('english', ...) @@ plainto_tsquery('english', ${search})
`
```

The `search` variable is passed as a parameterized value — Prisma never interpolates it into the SQL string.

## OWASP Top 10 — A03:2021 Injection Checklist

- [x] No string concatenation used to build SQL queries
- [x] All user inputs passed as bound parameters
- [x] ORM validates input types before passing to DB driver
- [x] Prisma client enforces typed schema — no dynamic table/column names from user input
- [x] `$queryRaw` only used with `Prisma.sql` tagged template literals
