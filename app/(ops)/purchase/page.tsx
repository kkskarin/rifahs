"use client";

import Link from "next/link";

export default function PurchasePage() {
  return (
    <>
      <div className="page-head">
        <h1>Purchase</h1>
        <p>Fabric and printing purchase orders, vendors and what&apos;s on its way.</p>
      </div>
      <div className="panel">
        <h3>Coming next</h3>
        <p className="hint">
          This is where purchase orders will live — raise a PO to the printer, track it until the fabric arrives, and have it
          land straight into Inventory. Until then, fabric that&apos;s been ordered is tracked as <b>Waiting for fabric</b> on the{" "}
          <Link className="link" href="/inventory">
            Inventory
          </Link>{" "}
          page.
        </p>
      </div>
    </>
  );
}
