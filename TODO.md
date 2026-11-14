# Things to do (noted 12 Nov 2026 — not started; remind the owner before building)

1. **Expense detail** — a fuller expense record, including picture / PDF upload (bills, receipts).
2. **Stitching link for vendors** — a link the stitching vendor can open (to see their queue).
3. **Detailed reports for actionable insights.**
4. **Picture upload for shippers other than Delhivery** (e.g. ST Courier receipts / proof of dispatch).
5. ~~Add sales order: selectable items~~ (done on preview: item table, sizes, custom pricing, GST, shipping) — pick the product and its variant from a list, with an option
   for custom pricing; add shipping charges (currently missing from the entry form).
6. ~~"Add to Home Screen" has no logo~~ — done (round logo on cream; on preview).
7. **Inventory stages + Shopify stock from Core** (rule agreed 13 Nov 2026 — owner will give permission
   later; do NOT write Shopify stock until then).
   - Stages, each physical piece in exactly one: Waiting for fabric (ordered from vendor) → Unstitched
     stock (main stock) → At stitching → Ready for dispatch (stitched, by size).
   - Order-side figures: Uncommitted orders (ordered, not yet sent for stitching); Short by
     (uncommitted orders beyond unstitched stock).
   - Pieces move with order status: Stitching → Unstitched to At stitching; QC/Ready → Ready for
     dispatch; Dispatched → leaves stock. Manual +/− stays for corrections.
   - Shopify: sellable = unstitched stock we HOLD minus uncommitted orders (fabric on the way is NOT
     sellable). Core sets every size and Unstitched to that number, and lowers all together when any
     size is ordered; a ready-stitched piece adds to its own size only.
   - Have Shopify notify Core on each new order so the numbers update within seconds.
   - Build first as a "what Core would set vs what Shopify shows" list for the owner to check, then
     switch on real updates. This reverses the earlier "Core never changes Shopify stock" rule, so
     update CLAUDE.md when permission is given.

8. **Inventory spec (14 Nov 2026: Fabric Sets & Size Variants)** — being built in stages on preview.
   - Stage 1 (done on preview): stock by stage, stitching orders (commit → sent to tailor → received),
     per-item order stages with spec names, On Hand stock auto-committed to received orders, Closed =
     7 days after delivery, Delivered read from Shopify's delivery status.
   - Stage 2 (not built): purchase orders + goods receipt notes under Purchase (sub-tabs Purchase
     orders / Expenses); opening PO per design for fabric on the way. Open: does receiving a PO create an
     expense entry? (suggested: keep separate).
   - Stage 3 (not built): returns → inspection → On Hand / Not Sellable; MSQ alerts with suggested
     order quantity; Sellable switch.
   - Orders ship as one parcel; each item has its own stage and the order shows its slowest item.
