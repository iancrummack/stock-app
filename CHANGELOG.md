# Changelog

All notable changes to the 7F Stock & Asset app are recorded here.

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