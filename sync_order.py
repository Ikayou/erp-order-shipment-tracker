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


def get_order_numbers():
    """Auftragsnummern seitenweise aus ERPNext laden."""
    order_numbers = []
    offset = 0

    while True:
        parameters = urlencode({
            "limit_start": offset,
            "limit_page_length": PAGE_SIZE,
            "order_by": "name asc",
        })
        url = f"{API_BASE}/Sales%20Order?{parameters}"
        page = get_from_erpnext(url)

        for order in page:
            order_numbers.append(order["name"])

        if len(page) < PAGE_SIZE:
            break

        offset += PAGE_SIZE

    return order_numbers


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
                delivered_quantity
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                item["name"],
                order["name"],
                item["item_code"],
                item["item_name"],
                item["qty"],
                item["delivered_qty"],
            ),
        )


order_numbers = get_order_numbers()

# Erst alle Aufträge abrufen, dann die Datenbank aktualisieren
orders = []

for order_number in order_numbers:
    encoded_number = quote(order_number, safe="")
    url = f"{API_BASE}/Sales%20Order/{encoded_number}"
    orders.append(get_from_erpnext(url))

with psycopg.connect(
    host="127.0.0.1",
    port=5433,
    dbname="erp_tracker",
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
) as connection:
    for order in orders:
        save_order(connection, order)

print(f"Synchronisierte Aufträge: {len(orders)}")