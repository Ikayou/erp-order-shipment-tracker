import { Fragment, useEffect, useState } from "react"
import "./App.css"

type OrderItem = {
  item_id: string
  order_number: string
  customer_name: string
  status: string
  item_code: string
  item_name: string
  ordered_quantity: number
  delivered_quantity: number
  remaining_quantity: number
  delivery_date: string | null
  is_overdue: boolean
}

type DeliveryItem = {
  delivery_item_id: string
  delivery_note_number: string
  posting_date: string
  item_name: string
  quantity: number
  unit: string
}

type DeliveryResult = { items: DeliveryItem[] } | { error: string }

type SortKey = "order_number" | "delivery_date"

const statusLabels: Record<string, string> = {
  Draft: "Entwurf",
  "On Hold": "Angehalten",
  "To Deliver and Bill": "Auszuliefern und abzurechnen",
  "To Deliver": "Auszuliefern",
  "To Bill": "Abzurechnen",
  Completed: "Abgeschlossen",
  Closed: "Geschlossen",
  Cancelled: "Storniert",
}

// Reine Datumswerte (YYYY-MM-DD) werden als UTC gelesen und so auch formatiert.
const dateFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" })
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
})
const quantityFormat = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 3,
  useGrouping: false,
})

function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : ""
}

function statusLabel(status: string) {
  return statusLabels[status] ?? status
}

function compareItems(a: OrderItem, b: OrderItem, sortKey: SortKey) {
  if (sortKey === "delivery_date" && a.delivery_date !== b.delivery_date) {
    // Positionen ohne Liefertermin ans Ende stellen
    if (!a.delivery_date) return 1
    if (!b.delivery_date) return -1
    return a.delivery_date < b.delivery_date ? -1 : 1
  }
  return a.order_number.localeCompare(b.order_number)
}

function csvCell(value: string) {
  // Formeln beim Öffnen in Excel verhindern (CSV-Injection)
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

function downloadCsv(items: OrderItem[]) {
  const header = [
    "Auftrag",
    "Kunde",
    "Status",
    "Artikelnummer",
    "Artikel",
    "Liefertermin",
    "Bestellt",
    "Geliefert",
    "Offen",
    "Überfällig",
  ].map(csvCell)
  const rows = items.map((item) => [
    csvCell(item.order_number),
    csvCell(item.customer_name),
    csvCell(statusLabel(item.status)),
    csvCell(item.item_code),
    csvCell(item.item_name),
    formatDate(item.delivery_date),
    quantityFormat.format(item.ordered_quantity),
    quantityFormat.format(item.delivered_quantity),
    quantityFormat.format(item.remaining_quantity),
    item.is_overdue ? "ja" : "nein",
  ])

  // Semikolon und BOM, damit Excel mit deutschen Einstellungen die Datei direkt öffnet
  const csv = "﻿" + [header, ...rows].map((row) => row.join(";")).join("\r\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `auftragspositionen-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function DeliveryHistory({ orderNumber }: { orderNumber: string }) {
  const [result, setResult] = useState<DeliveryResult | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadDeliveries() {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(orderNumber)}/deliveries`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          throw new Error("Lieferhistorie konnte nicht geladen werden.")
        }

        const items: DeliveryItem[] = await response.json()
        if (!controller.signal.aborted) {
          setResult({ items })
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({ error: "Lieferhistorie konnte nicht geladen werden." })
        }
      }
    }

    void loadDeliveries()
    return () => controller.abort()
  }, [orderNumber])

  return (
    <section id="delivery-history" className="delivery-history" aria-labelledby="delivery-history-title">
      <h2 id="delivery-history-title">Lieferhistorie für {orderNumber}</h2>
      {!result && <p role="status">Lieferhistorie wird geladen …</p>}
      {result && "error" in result && <p role="alert">{result.error}</p>}
      {result && "items" in result && (
        result.items.length === 0 ? (
          <p>Keine gebuchten Lieferungen vorhanden.</p>
        ) : (
          <table aria-labelledby="delivery-history-title">
            <thead>
              <tr>
                <th scope="col">Lieferschein</th>
                <th scope="col">Buchungsdatum</th>
                <th scope="col">Artikel</th>
                <th scope="col">Menge</th>
                <th scope="col">Einheit</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.delivery_item_id}>
                  <td>{item.delivery_note_number}</td>
                  <td>
                    <time dateTime={item.posting_date}>{formatDate(item.posting_date)}</time>
                  </td>
                  <td>{item.item_name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  )
}

function App() {
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [hideDrafts, setHideDrafts] = useState(false)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("order_number")
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  useEffect(() => {
    async function loadOrders() {
      try {
        const response = await fetch("/api/orders")

        if (!response.ok) {
          throw new Error("Aufträge konnten nicht geladen werden.")
        }

        const data: OrderItem[] = await response.json()
        setItems(data)
      } catch {
        setError("Die Verbindung zur API ist fehlgeschlagen.")
      } finally {
        setLoading(false)
      }
    }

    async function loadSyncStatus() {
      // Der Datenstand ist eine Zusatzinformation, Fehler blenden ihn nur aus.
      try {
        const response = await fetch("/api/sync-status")
        if (response.ok) {
          const data: { synced_at: string | null } = await response.json()
          setSyncedAt(data.synced_at)
        }
      } catch {
        setSyncedAt(null)
      }
    }

    void loadOrders()
    void loadSyncStatus()
  }, [])

  const query = search.trim().toLowerCase()
  const filteredItems = items
    .filter((item) => {
      const matchesSearch =
        item.order_number.toLowerCase().includes(query) ||
        item.customer_name.toLowerCase().includes(query)

      const matchesDraftFilter = !hideDrafts || item.status !== "Draft"
      const matchesOpenFilter = !onlyOpen || item.remaining_quantity > 0
      const matchesOverdueFilter = !onlyOverdue || item.is_overdue

      return matchesSearch && matchesDraftFilter && matchesOpenFilter && matchesOverdueFilter
    })
    .sort((a, b) => compareItems(a, b, sortKey))

  const openCount = filteredItems.filter((item) => item.remaining_quantity > 0).length
  const overdueCount = filteredItems.filter((item) => item.is_overdue).length

  return (
    <main>
      <h1>Auftragspositionen</h1>
      {syncedAt && (
        <p className="sync-status">
          Datenstand: <time dateTime={syncedAt}>{dateTimeFormat.format(new Date(syncedAt))}</time>
        </p>
      )}

      <div className="controls">
        <label htmlFor="search">Auftrag oder Kunde suchen</label>
        <input
          id="search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={hideDrafts}
            onChange={(event) => setHideDrafts(event.target.checked)}
          />
          Entwürfe ausblenden
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(event) => setOnlyOpen(event.target.checked)}
          />
          Nur offene Positionen
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(event) => setOnlyOverdue(event.target.checked)}
          />
          Nur überfällige Positionen
        </label>
        <label htmlFor="sort">Sortieren nach</label>
        <select
          id="sort"
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
        >
          <option value="order_number">Auftragsnummer</option>
          <option value="delivery_date">Liefertermin</option>
        </select>
        <button
          type="button"
          className="export-button"
          disabled={filteredItems.length === 0}
          onClick={() => downloadCsv(filteredItems)}
        >
          Als CSV exportieren
        </button>
      </div>

      {!loading && !error && items.length > 0 && (
        <p className="summary" role="status">
          {filteredItems.length} Positionen angezeigt · {openCount} offen ·{" "}
          <span className={overdueCount > 0 ? "overdue-text" : undefined}>
            {overdueCount} überfällig
          </span>
        </p>
      )}

      {!loading && !error && items.length > 0 && filteredItems.length === 0 && (
        <p>Keine passenden Auftragspositionen gefunden.</p>
      )}

      {loading && <p>Daten werden geladen …</p>}
      {error && <p role="alert">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p>Keine Auftragspositionen vorhanden.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Auftrag</th>
              <th>Kunde</th>
              <th>Status</th>
              <th>Artikel</th>
              <th>Liefertermin</th>
              <th>Bestellt</th>
              <th>Geliefert</th>
              <th>Offen</th>
            </tr>
          </thead>

          <tbody>
            {filteredItems.map((item) => {
              const expanded = item.item_id === expandedItemId

              return (
                <Fragment key={item.item_id}>
                  <tr className={item.is_overdue ? "overdue" : undefined}>
                    <td>
                      <button
                        type="button"
                        className="order-link"
                        aria-expanded={expanded}
                        aria-controls={expanded ? "delivery-history" : undefined}
                        onClick={() => setExpandedItemId(expanded ? null : item.item_id)}
                      >
                        {item.order_number}
                      </button>
                    </td>
                    <td>{item.customer_name}</td>
                    <td>{statusLabel(item.status)}</td>
                    <td>{item.item_name}</td>
                    <td>
                      {item.delivery_date && (
                        <time dateTime={item.delivery_date}>{formatDate(item.delivery_date)}</time>
                      )}
                      {item.is_overdue && <span className="overdue-badge">überfällig</span>}
                    </td>
                    <td>{item.ordered_quantity}</td>
                    <td>{item.delivered_quantity}</td>
                    <td>{item.remaining_quantity}</td>
                  </tr>
                  {expanded && (
                    <tr className="delivery-row">
                      <td colSpan={8}>
                        <DeliveryHistory orderNumber={item.order_number} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}

export default App
