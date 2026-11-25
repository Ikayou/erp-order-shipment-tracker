import json
import os
from decimal import Decimal
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import psycopg


API_BASE = os.environ["ERP_BASE_URL"].rstrip("/") + "/api/resource"
API_KEY = os.environ["ERP_API_KEY"]
API_SECRET = os.environ["ERP_API_SECRET"]
PAGE_SIZE = 20


def get_from_erpnext(url):
    """Eine JSON-Antwort von der ERPNext-API abrufen."""
    request = Request(
        url,
        headers={
            "Authorization": f"token {API_KEY}:{API_SECRET}",
        },
    )

    with urlopen(request, timeout=30) as response:
        return json.load(response, parse_float=Decimal)["data"]


def get_documents(doctype, filters=None):
    """Dokumente samt Positionen seitenweise aus ERPNext laden."""
    resource_url = f"{API_BASE}/{quote(doctype, safe='')}"
    documents = []
    offset = 0

    while True:
        parameters = {
            "limit_start": offset,
            "limit_page_length": PAGE_SIZE,
            "order_by": "name asc",
        }
        if filters is not None:
            parameters["filters"] = json.dumps(filters)
        page = get_from_erpnext(f"{resource_url}?{urlencode(parameters)}")

        for entry in page:
            name = quote(entry["name"], safe="")
            documents.append(get_from_erpnext(f"{resource_url}/{name}"))

        if len(page) < PAGE_SIZE:
            return documents

        offset += PAGE_SIZE


def save_order(connection, order):
    """Einen Auftrag und seine Positionen in PostgreSQL speichern."""
    connection.execute(
        """
        INSERT INTO sales_orders (order_number, customer_name, status)
        VALUES (%s, %s, %s)
        ON CONFLICT (order_number) DO UPDATE
        SET customer_name = EXCLUDED.customer_name,
            status = EXCLUDED.status
        """,
        (order["name"], order["customer_name"], order["status"]),
    )

    # Die Positionen für diesen Auftrag durch den aktuellen Stand ersetzen
    connection.execute(
        "DELETE FROM sales_order_items WHERE order_number = %s",
        (order["name"],),
    )

    for item in order["items"]:
        connection.execute(
            """
            INSERT INTO sales_order_items (
                item_id,
                order_number,
                item_code,
                item_name,
                ordered_quantity,
                delivered_quantity,
                delivery_date
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                item["name"],
                order["name"],
                item["item_code"],
                item["item_name"],
                item["qty"],
                item["delivered_qty"],
                # Liefertermin der Position, ersatzweise der des Auftrags
                item.get("delivery_date") or order.get("delivery_date"),
            ),
        )


def get_delivery_rows(deliveries, order_items):
    """Lieferpositionen den importierten Auftragspositionen zuordnen."""
    rows = []

    for delivery in deliveries:
        if delivery["docstatus"] != 1:
            continue

        for item in delivery["items"]:
            order_item_id = item.get("so_detail")
            order_number = order_items.get(order_item_id)
            if order_number is None or order_number != item.get("against_sales_order"):
                continue

            rows.append((
                item["name"],
                order_item_id,
                delivery["name"],
                delivery["posting_date"],
                item["qty"],
                item["uom"],
            ))

    return rows


def sync_orders():
    with psycopg.connect(
        host="127.0.0.1",
        port=5433,
        dbname="erp_tracker",
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    ) as connection:
        # Gleichzeitige Importe nacheinander ausführen. Abfragen bleiben möglich.
        connection.execute("LOCK TABLE delivery_items IN SHARE ROW EXCLUSIVE MODE")
        orders = get_documents("Sales Order")
        deliveries = get_documents("Delivery Note", [["docstatus", "=", 1]])
        order_items = {
            item["name"]: order["name"]
            for order in orders
            for item in order["items"]
        }
        delivery_rows = get_delivery_rows(deliveries, order_items)

        # Die Lieferpositionen vor den Auftragspositionen ersetzen, da sie darauf verweisen.
        connection.execute("DELETE FROM delivery_items")
        for order in orders:
            save_order(connection, order)

        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO delivery_items (
                    delivery_item_id, sales_order_item_id, delivery_note_number,
                    posting_date, quantity, unit
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                delivery_rows,
            )

        connection.execute(
            """
            INSERT INTO sync_status (id, synced_at)
            VALUES (TRUE, now())
            ON CONFLICT (id) DO UPDATE SET synced_at = EXCLUDED.synced_at
            """
        )

    print(f"Synchronisierte Aufträge: {len(orders)}")
    print(f"Synchronisierte Lieferpositionen: {len(delivery_rows)}")


if __name__ == "__main__":
    sync_orders()
