import { useEffect, useState } from "react"
import "./App.css"

type OrderItem = {
  order_number: string
  customer_name: string
  status: string
  item_code: string
  item_name: string
  ordered_quantity: number
  delivered_quantity: number
  remaining_quantity: number
}

const statusLabels: Record<string, string> = {
  Draft: "Entwurf",
  "To Deliver and Bill": "Auszuliefern und abzurechnen",
}

function App() {
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [hideDrafts, setHideDrafts] = useState(false)
  const [onlyOpen, setOnlyOpen] = useState(false)

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
            {filteredItems.map((item) => (
              <tr key={`${item.order_number}-${item.item_code}`}>
                <td>{item.order_number}</td>
                <td>{item.customer_name}</td>
                <td>{statusLabels[item.status] ?? item.status}</td>
                <td>{item.item_name}</td>
                <td>{item.ordered_quantity}</td>
                <td>{item.delivered_quantity}</td>
                <td>{item.remaining_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

export default App