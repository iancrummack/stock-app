# Changelog

All notable changes to the 7F Stock & Asset app are recorded here.

## [0.10.2] - 2026-07-06
### Added
- Locations admin screen: add, edit, and manage warehouse bays with a route position field controlling the pick-walk order independently of the database id

## [0.10.1] - 2026-07-04
### Fixed
- Revoked unauthenticated (public) execute access on all security-definer database functions, so only logged-in users can call them
- Removed an unused early-experiment view (stock_on_hand_by_location) that was flagged as a critical security concern

## [0.10.0] - 2026-07-03
### Added
- Transactions view: consumable stock movements with product, type, and date-range filters, searchable by product name or code, with Excel export and the person's full name against each movement
- Stock take: count by owner, bay, or category, informed counting with expected figures shown, review discrepancies before confirming, adjustments written as ledger movements visible in Transactions
- Forgot password: reset link on the login screen, branded in-app password-change page
- Full names on user profiles, shown on transactions and available app-wide

## [0.9.1] - 2026-07-02
### Added
- Site Manager Box rule on upload: if the master list header's Site Manager Box field reads "Need", the sector (TA, BD, MF) automatically adds the matching box as an asset line, flagged if the sector is missing or unrecognised

### Changed
- Flagged rows on the upload summary now start collapsed, showing a count and a breakdown by reason, with a click to expand the full table, so a small pick isn't buried under validation rows
- Flagged summary heading now shown in red to match the flagged styling

## [0.9.0] - 2026-07-02
### Added
- Roles and access control: four configurable roles (super user, warehouse, operations, buyer)
- Roles admin screen (super user only) to tick which screens each role can see and to assign roles to logins
- Sidebar now filters to show each person only the screens their role allows
- Bespoke item procurement details: PO number, delivered or collect-locally, and supplier name and location, editable after adding

## [0.8.1] - 2026-07-02
### Added
- Part-picked status: save progress on a pick when stock is short, then return to it once more stock arrives
- Picks can now be worked in multiple passes, each pass issues only what was picked that pass, and reopening shows the outstanding amounts
- "Complete & dispatch" finalises a pick (final, not amendable), separate from "Save progress"
- Export a pick's shortfall items to Excel, to send to the buyer or suppliers
- Availability now counts part-picked picks' outstanding amounts as committed, so they aren't double-allocated

### Changed
- Pick list button reads "Open pick" rather than "Pick this"

## [0.8.0] - 2026-07-01
### Added
- Upload pick list: create a trackable pick from the buyer's master list Excel file, reading the Site Set Up & Signage tab
- The upload matches items by I.D, reads project, job number and collection date by their labels, and shows a full summary before creating anything
- Problem rows (no I.D, unknown I.D, bad quantity, unmatched kit code) are flagged with their sheet row and reason, so nothing is silently dropped
- Kits: define a lettered kit code (e.g. FT2) as a bundle of asset types, managed on a new admin screen
- Kit codes on an upload expand automatically into their component asset lines
- Kit items can be marked "fixed" so they don't scale with quantity (e.g. one WES base per job regardless of how many trolleys)

### Fixed
- Collection date now reads correctly from the spreadsheet (was mis-parsing the year and slipping a day)

## [0.7.1] - 2026-07-01
### Added
- Search, category filter, and sort (by name or warehouse position) on the Products screen, with a Position column showing each consumable's home bay

## [0.7.0] - 2026-06-30
### Added
- Pick lists: upload-ready pick system where a job reserves stock until it's picked or cancelled
- Stock availability now accounts for what's committed to open picks, so concurrent jobs see each other's reservations
- Warehouse pick screen: work a job's lines in warehouse-route order, enter picked quantities, tick specific asset units, assign a holder, and commit
- Picks complete cleanly or "with issues" if anything fell short, and the buyer sees the status
- Cancel a job to release its reserved stock, with a confirmation
- Bay contents view: pick a bay to see the consumables homed there and the assets currently in it
- Excel export on the compliance screen
- Asset/consumable filter on the Products screen
- Holder permission warnings when assigning assets to someone not set up to hold them

### Changed
- Re-coding an asset is now a single atomic operation
- Re-testing a service overwrites the existing date rather than adding a duplicate, with the change recorded in history

## [0.6.0] - 2026-06-30
### Added
- Service types: a managed list of service/compliance types (admin screen)
- Asset service rules: define which service types each asset type requires, managed by ticking
- Add service/compliance dates to an asset from the detail panel, with a warning if the service isn't one the asset type needs
- Change an asset's code from the detail panel (for re-stickering), with a confirm step and the change recorded in the asset's history

### Fixed
- Asset intake form now clears fully after logging a batch
- Removed duplicated Admin menu groups in the sidebar
- Changing an asset no longer resets the screen or loses your filters (replaced the full page reload with a quiet background refresh)

## [0.5.0] - 2026-06-29
### Added
- Projects admin screen: create, edit, and make projects dormant (hidden from pickers, history preserved)
- People admin screen: create and edit people, role and the can-hold-assets and active flags
- Warning when deactivating a person who still holds assets, and when making a project dormant with assets still on site
- Asset detail panel (slide-in on desktop, full screen on phone): current state, service and compliance dates, and full event history / itinerary
- Asset detail actions: change condition, reassign holder/location/site, send for repair, write off — each writing an event to the asset history
- Excel export on the asset register, respecting the active filters
- 7F prefix pre-filled on asset coding

### Fixed
- Asset event history now displays in the detail panel (missing read policy on asset_events)
- Owner column now shows correctly on the stock-levels export and the products list

### Changed
- Single-asset changes go through a new atomic update function that enforces the location-or-site rule

## [0.4.0] - 2026-06-28
### Added
- Excel export of stock levels, with owner and category columns for buyer filtering
- Responsive sidebar: mobile hamburger menu, grouped headings
- Filterable asset register (search plus type, condition, status, position, holder)
- 7Formation branding and version badge in the header
- Product code unique constraint
- 7F prefix pre-fill on asset coding

### Fixed
- Owner names now display on the products list
- Netlify build failures caused by filename casing

## [0.3.0] - 2026-06
### Added
- Asset side: two-stage intake, uncoded-assets list, asset move (assign/return/condition)
- Compliance screen with on-site recall filter

## [0.2.0] - 2026-06
### Added
- Consumables: header-and-lines receive, issue and return with atomic stock movements
- Stock on hand and stock levels views, products control screen

## [0.1.0] - 2026-06
### Added
- Initial app: login, stock and asset read screens, Supabase backend