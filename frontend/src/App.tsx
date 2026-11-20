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

const statusLabels: Record<string, string> = {
  Draft: "Entwurf",
  "To Deliver and Bill": "Auszuliefern und abzurechnen",
}

const postingDateFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" })

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
                    <time dateTime={item.posting_date}>
                      {postingDateFormat.format(new Date(item.posting_date))}
                    </time>
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
  const [search, setSearch] = useState("")
  const [hideDrafts, setHideDrafts] = useState(false)
  const [onlyOpen, setOnlyOpen] = useState(false)
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

    loadOrders()
  }, [])

  const filteredItems = items.filter((item) => {
    const query = search.trim().toLowerCase()

    const matchesSearch =
      item.order_number.toLowerCase().includes(query) ||
      item.customer_name.toLowerCase().includes(query)

    const matchesDraftFilter = !hideDrafts || item.status !== "Draft"

    const matchesOpenFilter = !onlyOpen || item.remaining_quantity > 0

    return matchesSearch && matchesDraftFilter && matchesOpenFilter
  })

  return (
    <main>
      <h1>Auftragspositionen</h1>
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
                  <tr>
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
                    <td>{statusLabels[item.status] ?? item.status}</td>
                    <td>{item.item_name}</td>
                    <td>{item.ordered_quantity}</td>
                    <td>{item.delivered_quantity}</td>
                    <td>{item.remaining_quantity}</td>
                  </tr>
                  {expanded && (
                    <tr className="delivery-row">
                      <td colSpan={7}>
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
