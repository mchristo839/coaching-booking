# CLAUDE.md Audit — Week 1 Cleanup

Audit date: 2026-04-16
Auditor: Claude Code

## Claims in CLAUDE.md that don't match code

### Database schema
| Claim | Reality |
|-------|---------|
| `providers` — business accounts | **Does not exist.** The app uses `coaches` table directly. |
| `coaches_v2` — coach profiles, includes `whatsapp_bot_status` | **Does not exist.** Table is `coaches` with columns: id, email, name, password_hash, invite_code, is_tester. No `whatsapp_bot_status`. |
| `programmes` — full programme config with schedule, venue, pricing, capacity | **Table is called `programs`**, not `programmes`. Schema is: id, coach_id, program_name, knowledgebase (JSONB), whatsapp_group_id, is_active, created_at. No separate schedule/venue/pricing columns — all stored in knowledgebase JSONB. |
| `members` — parents/players | **Does not exist** in code or migrations. |
| `faqs` — knowledge base, `source` is `coach`/`preloaded`/`learned` | **Does not exist.** FAQs are stored as `customFaqs` array inside the knowledgebase JSONB field on `programs`. |
| `signup_sessions` — DM signup state machine | **Does not exist** in code or migrations. |

### Auth
| Claim | Reality |
|-------|---------|
| "JWT with HTTP-only cookies (jose library)" | **Auth is localStorage-based.** Login/signup routes return JSON, client stores coachId/email/name in localStorage. No JWT, no cookies, no jose library. |

### Project structure
| Claim | Reality |
|-------|---------|
| `api/auth/` — "login, logout, register, verify-email" | Only `login` and `signup` exist. No `logout`, `register`, or `verify-email` routes. |
| `api/coaches/` — "coach profile CRUD" | **Does not exist.** |
| `api/members/` — "member list and signup" | **Does not exist.** |
| `api/programmes/` — "programme CRUD" | Routes are at `api/programs/` (American spelling). Contains `create`, `list`, `update`. No `public` sub-route. |
| `api/faqs/` — "FAQ CRUD + approval" | **Does not exist.** |
| `api/dashboard/` — "stats" | **Does not exist.** |
| `register/` — "5-stage registration wizard" | **Does not exist.** Registration is at `auth/signup/` — a single-page form. |
| `join/[id]/` — "public programme signup" | **Does not exist.** |
| `dashboard/members/` — "member list" | **Does not exist.** |
| `dashboard/learning/` — "FAQ approval queue" | **Does not exist.** |
| `lib/auth.ts` — "JWT helpers" | **Does not exist.** Auth is inline in route handlers using bcryptjs. |
| "db.ts — db functions (40+)" | db.ts has ~15 functions, not 40+. |

### Known quirks
| Claim | Reality |
|-------|---------|
| "5 fallback detection strategies for @mentions" | **Not implemented.** Bot responds to all group messages, no @mention detection. |
| "Uses `sql.query()` everywhere, not tagged templates" | **Opposite is true.** Code uses tagged template literals (`sql\`...\``), not `sql.query()`. |

### Environment variables
| Claim | Reality |
|-------|---------|
| `BOT_JID` | Not referenced anywhere in code. |
| `JWT_SECRET` | Not referenced anywhere in code (no JWT auth). |

### Other claims
| Claim | Reality |
|-------|---------|
| "handles signups" | No signup/member registration system exists. |
| "learns from coach responses" | No learning/FAQ auto-learn system exists. |

## Features in code not documented in CLAUDE.md

| Feature | Location |
|---------|----------|
| Health endpoint with 6 checks + Telegram alerts | `app/api/health/route.ts`, `app/lib/health-checks.ts`, `app/lib/alerts.ts` |
| Conversation logging with classification | `safeLogConversation()` in `app/lib/db.ts`, called from webhook |
| Message dedup (processed_messages) | `isMessageProcessed()` in `app/lib/db.ts` |
| Bot reply dedup (bot_replies) | `trackBotReply()` in `app/lib/db.ts` |
| Invite code system | `app/api/admin/invites/`, `app/admin/invites/page.tsx`, invite validation in signup |
| Maintenance cleanup endpoint | `app/api/maintenance/cleanup/route.ts` |
| Shared ProgrammeForm component | `app/components/ProgrammeForm.tsx` |
| Dedicated create programme page | `app/dashboard/programmes/new/page.tsx` |
| Message classification (escalation/question/social/general) | `classifyMessage()` in webhook handler |
| Tables: alert_log, conversations, bot_replies, processed_messages, health_state, invite_codes | In db-migrate but not documented |

## Env vars in code not listed in CLAUDE.md

| Variable | Used in |
|----------|---------|
| `ADMIN_EMAIL` | `app/api/admin/invites/route.ts` |

## Additional issues found (not fixed)

1. `app/lib/evolution.ts` default URL is still `http://35.239.224.242:8080` (old GCP IP). Should be `http://161.97.176.176:8080`.
2. `api/programs/list` route uses `request.url` which causes Next.js static render warning (pre-existing).
3. No `.env.example` file in the repo (only `.env.local` which is gitignored).
4. Stripe dependencies (`stripe@^17.5.0`) still in `package.json` but no Stripe code exists.
