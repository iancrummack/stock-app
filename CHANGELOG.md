# Changelog

All notable changes to the 7F Stock & Asset app are recorded here.

## [0.12.0] - 2026-07-14

### Added
- **Dashboard** (Overview → Dashboard). A watchlist rather than a wall of charts. Key item stock levels shown as bars coloured against each item's own minimum, red below, amber close, green clear, covering both consumables and asset-tracked products in one view. Key item service status bucketed into overdue, under four weeks, under twelve weeks and clear, split by on site and in store, with a table of everything due inside four weeks. Cards for items below minimum, services due, services overdue and open picks.
- **Insights** (Overview → Insights). Notice lag per pick, creation to collection date, with bars in red where a pick arrived with no notice or already late, and an average line across. Warehouse turnaround per pick, creation to completion. Stock movement volume by week for the last eight weeks, issued out against received in. Ad-hoc picks are excluded by default and can be toggled in, since they are short notice by nature and would otherwise drag the notice average down.
- `is_key_item` and `min_level` on `products`, set with a tick box and a minimum field on the Products admin screen. Ticking a product puts it on the dashboard watchlist, so the watchlist is curated in the app and never needs a code change.
- `completed_at` on `picks`, stamped by a `stamp_pick_completed` trigger whenever a pick moves to completed or completed with issues. A trigger rather than an edit to `commit_pick`, so every path to completion is captured, including any added later.
- Recharts added as a dependency.

### Notes
- Turnaround starts measuring from this release. Picks completed before it have no completion timestamp and are correctly absent from the chart rather than reconstructed.
- The compliance watchlist matches assets to key items by product name, since `compliance_due` exposes the type name rather than a product id. Renaming a key product will detach its existing compliance rows from the dashboard.

## [0.11.0] - 2026-07-13

### Added
- **Create pick screen** (Movements → Create pick). Builds an ad-hoc pick by hand, for orders that arrive by phone, email or message rather than on the master list. Project and collection date, optional holder and note, then lines added three ways: from stock by product search, by kit code (expands into components, honouring the multiply flag exactly as an uploaded list does), and as bespoke buy-in items with PO number, supply method, supplier and location. Stock and bespoke lines sit side by side in one staging list, quantities editable and lines removable before creating. The result is an ordinary open pick that flows through the existing pick, commit, shortfall and cancel workflow.
- `source` column on `picks`, defaulting to `upload`. Manual picks record `manual`, so ad-hoc orders can be separated from planned ones when the insights screen measures notice lag.
- Visual tick boxes against each line on both the Create pick and Pick lists screens. A picker's crossing-off aid only, held in the browser and never saved.

### Changed
- Pick lists now shows collection dates as dd-mm-yyyy, on both the summary table and the open pick header.

## [0.10.6] - 2026-07-10
### Added
- "Where" filter on the Transactions screen, search by project or location to find a job's movements
- Zero-quantity picks allowed on Issue/return, recording that stock was needed but unavailable rather than silently missing

### Changed
- Site manager box rule now uses the kit system instead of hardcoded product IDs, managed through the Kits admin screen using sector codes (BD, MF, TA)

## [0.10.5] - 2026-07-09
### Added
- Position column on the Stock levels screen showing each product's home bay
- Owner dropdown filter on Stock levels, so held items per person are one click to view
- Product search box on the Issue/return screen, type to narrow the product list instead of scrolling

## [0.10.4] - 2026-07-06
### Added
- Search on the Stock levels screen, matching across name, owner and category, with export respecting the filter

### Changed
- Product dropdowns across the app now show names only (no codes) and sort alphabetically, making them easier to scan

## [0.10.3] - 2026-07-06
### Added
- Condition check on asset return: confirm or change each asset's condition before committing, with a per-asset comment (max 25 chars) when condition changes
- Condition report shown on screen after a return, highlighting any condition changes, with Excel export
- Comment field on the asset detail panel's condition-change and repair/write-off actions, recorded in the asset's event history

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