# يوصل — لوحة المورّد (Usil Vendor Dashboard)

Standalone vendor console for Usil. React 19 + Vite + Tailwind 4, Arabic-first and
RTL, talking to the existing Express API in `../usil backend`. Like `../usil-owner`
it adds nothing to the backend — every screen is built on vendor routes that
already ship.

## Running

The backend must be running first (`npm run dev` in `../usil backend`, port 43147).

```bash
npm install
npm run dev       # http://127.0.0.1:5190
```

Sign in with an account whose role is `vendor`. Supervisors (`admin` /
`accounts_manager`) are let in too, because `requireRole(['vendor', 'admin'])`
accepts them — but they land on their *own* workspace, which is normally empty.
To inspect a specific vendor as an admin, use the owner console; this dashboard
never sends the `?vendorId=` override. Any other role is shown a "no permission"
screen rather than an empty dashboard.

### Making a vendor account

There is no self-serve path to a `vendor` role: `POST /api/auth/register` always
creates a `client`, and the role is granted either by admin approval of a vendor
application or by `POST /api/admin/users`.

**Do not name the account `vendor@usil.app`.** `createAuth` runs
`purgeLiveDummyData` on the first user read of every boot, and that address is on
the hard-coded `DUMMY_EMAILS` list in `server/auth/dummy-accounts.ts` — the account
is deleted on the next restart, and the login then fails with «لا يوجد حساب بهذا
البريد الإلكتروني» as though it had never been created. The same purge also drops
any local part starting with `demo`, `test`, `launch`, `photo`, `qa` or `verify`,
and anything at `example.com`, `mithyaf.sa` or `usil-qa.invalid`.

A vendor with no application row also has no storefront profile, so
`GET /api/me/vendor-file` answers all-null and ملفي التجاري shows its empty state.
Seeding `workspaces[<userId>].profile` in `data/vendor-workspaces.json` is enough
to populate it — `ownProfile` reports that copy as `approved`.

(One more thing to know about that file: `wipeAllVendorsAndDummyMedia` deletes
*every* vendor account, application and workspace. It is guarded by the
`data/vendors-wiped-v4.json` marker, so it is inert as long as that file exists —
deleting the marker wipes every vendor on the next boot.)

Point it at a different backend with `USIL_API=http://host:port npm run dev`.

```bash
npm run build     # tsc --noEmit && vite build
npm run lint      # tsc --noEmit
npm run preview   # serve the build on 5190
```

## Why a Vite proxy

The session is an HttpOnly `midyaf_sid` cookie with `SameSite=Lax`. Dev proxies
`/api` **and `/uploads`** to the backend so the browser treats everything as one
origin — the cookie rides along without any CORS work, and listing photos (served
from `/uploads/…`) resolve. In production, serve this build behind the same
hostname as the API.

## Layout

```
src/
  api/          client.ts (fetch + error envelope), endpoints.ts (typed calls), types.ts
  state/        session, toasts, unread-chat badge
  components/
    ui/         Button, Card, Badge, Table, Modal, StatTile, form controls
    charts/     AreaChart, BarChart, Sparkline — hand-rolled SVG/CSS
    listings/   ImagesPicker, CityPicker, ListingModal
    layout/     Shell (sidebar + topbar), nav definition
    chat/       ChatInbox, ChatThread, useChat — the vendor side of in-app chat
  screens/      one file per section
  data/         saudiPlaces.ts — MIRRORED, see below
  lib/          format (Arabic + SAR), router (hash), theme, useResource, usePoll, labels
```

### Screens → endpoints

| Screen | Endpoints |
|---|---|
| نظرة عامة | `GET /api/vendor/workspace`, `GET /api/me/vendor-file` |
| التقويم والحجوزات | `GET /api/vendor/workspace`, `POST/PATCH/DELETE /api/vendor/bookings`, `POST/DELETE /api/vendor/blocked-dates` |
| منتجاتي | `GET/POST/PATCH/DELETE /api/vendor/listings`, `POST /api/uploads` |
| ملفي التجاري | `GET /api/me/vendor-file` (read-only — see below) |
| حسابات التواصل | `GET/PUT /api/vendor/socials` |
| المحادثات | `GET /api/chats`, `GET /api/chats/unread`, `GET /api/chats/:id?after=`, `POST /api/chats` (team thread only), `POST /api/chats/:id/messages`, `POST /api/chats/:id/read` |

## Four API shapes worth knowing

All four cost real debugging time, so they are commented at the call site too.

- **Login sends `identifier`, not `email`.** `loginHandler` rejects a body with no
  phone unless `identifier` contains an `@`, so `{email, password}` alone is a 400.

- **Listing photos must be uploaded before the listing is saved.**
  `parseListingImages` keeps only `/uploads/…` URLs and drops a `data:` one
  silently — a form with two visible previews then fails with
  «أضف صورتين على الأقل لكل منتج», which reads as a bug in the form. So
  `ImagesPicker` POSTs each file to `/api/uploads` the moment it is picked and
  stores the returned URL. (`persistListingImages`, which *does* accept data URLs,
  is wired only into `POST /api/vendor-applications` — not into the listing routes.)

- **`PUT /api/vendor/socials` takes a FLAT body and is a full replace.**
  `parseVendorSocials` reads `body[network]`, not a `links` array, and rebuilds the
  whole set from what it receives. An omitted network is a removal, so the form
  always sends all six.

- **Cities are validated against the shared Saudi place list.**
  `validateVendorListing` drops any name `isSaudiPlaceName` rejects and falls back
  to الرياض without complaint, so a free-text city field would quietly publish the
  wrong coverage. `CityPicker` only emits names from the list.

## المحادثات — where «اسأل المورّد» lands

When a client taps «اسأل المورّد» on a listing (or «راسل المورّد» on the
storefront page), the message is stored by `server/chat/` as a `client_vendor`
thread. This screen is the vendor's side of it: `src/components/chat/` mirrors
the folder of the same name in `../usil` (inbox + thread + hooks), rebuilt on
this console's primitives and tokens.

Things the server decides that the screen leans on:

- **Scoping is server-side.** `GET /api/chats` returns only threads whose
  `vendorId` is the session user, so nothing here filters by id.
- **A vendor can start only the team thread.** `POST /api/chats` from a vendor
  ignores `vendorId` and opens their one `vendor_owner` thread with فريق يوصل.
  Client threads are created by the client; the vendor only replies. That is
  why the team row is pinned at the top before it exists and there is no
  "new conversation" button.
- **Messages carry a `context`** (`{type: 'listing' | 'booking', id, title}`)
  — the product the client was looking at. It renders as «بخصوص: …» above the
  bubble, so the vendor knows which product the question is about.
- **Supervisors see a pointer, not an inbox.** An `admin` signed in here is
  answered by `/api/chats` as the *owner* side (the team's shared inbox with
  every vendor), so the screen and the sidebar badge are gated on
  `user.role === 'vendor'`.

Delivery is polling (`src/lib/usePoll.ts`): the inbox every 15 s, an open
thread every 5 s, the sidebar badge every 15 s — all paused while the tab is
hidden. Opening a thread posts `/read`, which clears its unread count and
refreshes the badge through `UnreadContext`.

## Why ملفي التجاري is read-only

`GET /api/me/vendor-file` builds the profile from the vendor **application**
whenever one exists, and only falls back to the workspace copy when it does not.
`PUT /api/vendor/workspace` would accept a `profile` patch and store it — and the
vendor would then never see their edit reflected, because the application still
wins. Rather than ship a form whose saves silently vanish, the screen states that
changes go through Usil admin. Giving vendors real self-service here needs a
backend route that writes the application-backed profile.

The screen also handles the all-null case: a vendor account created directly by an
admin has no application and no seeded workspace profile, so the endpoint answers
`{application: null, profile: null, file: null}`.

## Two things this dashboard deliberately does not show

- **Platform orders (طلبات المنصة).** `GET /api/bookings` returns *every* booking
  to any vendor — `booking-routes.ts` filters only the `client` role and lets
  vendor and admin fall through to `store.list()`. `PATCH /api/bookings/:id` is
  likewise open to any vendor for any booking. A vendor-facing orders screen would
  expose rival vendors' customer names and phone numbers, so it is left out until
  the API scopes those two routes to the caller's own listings.

- **POS, payroll, expenses, ZATCA VAT, invoices, crew.** The SPA's `VendorHub`
  carries these, but they persist to `localStorage` only; the server workspace
  holds `inventoryItems` and `contracts` as untyped buckets and nothing at all for
  the rest. They need backend domains before a server-backed dashboard can show
  them.

## `src/data/saudiPlaces.ts` is a mirrored file

It is a copy of `../usil backend/core/data/saudiPlaces.ts` (itself a copy of
`../usil/src/data/saudiPlaces.ts`), following the duplication convention
`ARCHITECTURE.md` describes — and carrying the same drift risk it warns about. It
is the only shared file this project copies. `npm run check:core-sync` in the
backend does **not** cover this copy.

## Colour

All UI colour is CSS custom properties in `src/index.css`, shared verbatim with the
owner console — light and dark are each defined explicitly, never an automatic
flip. Chart colours are the validated categorical slots from the data-viz palette.
Numbers use `ar-SA-u-nu-latn` — Arabic formatting with Latin digits, so template
literals and `Intl` output never end up side by side in two numeral systems.
