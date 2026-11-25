import os

import psycopg
from fastapi import FastAPI
from psycopg.rows import dict_row


app = FastAPI(title="ERP Order Shipment Tracker")

# Status, bei denen ein verstrichener Liefertermin nicht als überfällig gilt
NOT_OVERDUE_STATUSES = ("Draft", "Closed", "Cancelled", "Completed")


def connect_to_database():
    return psycopg.connect(
        host="127.0.0.1",
        port=5433,
        dbname="erp_tracker",
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        row_factory=dict_row,
    )


@app.get("/api/orders")
def get_orders():
    # Kundenaufträge mit ihren Positionen aus PostgreSQL lesen
    with connect_to_database() as connection:
        return connection.execute(
            """
            SELECT
                o.order_number,
                o.customer_name,
                o.status,
                i.item_id,
                i.item_code,
                i.item_name,
                i.ordered_quantity,
                i.delivered_quantity,
                i.ordered_quantity - i.delivered_quantity
                    AS remaining_quantity,
                i.delivery_date,
                COALESCE(
                    i.ordered_quantity > i.delivered_quantity
                    AND i.delivery_date < CURRENT_DATE
                    AND o.status <> ALL(%s),
                    FALSE
                ) AS is_overdue
            FROM sales_orders AS o
            JOIN sales_order_items AS i
                ON o.order_number = i.order_number
            ORDER BY o.order_number, i.item_code, i.item_id
            """,
            (list(NOT_OVERDUE_STATUSES),),
        ).fetchall()


@app.get("/api/sync-status")
def get_sync_status():
    # Zeitpunkt des letzten Imports, None falls noch nie importiert wurde
    with connect_to_database() as connection:
        row = connection.execute(
            "SELECT synced_at FROM sync_status WHERE id"
        ).fetchone()
        return {"synced_at": row["synced_at"] if row else None}


@app.get("/api/orders/{order_number:path}/deliveries")
def get_order_deliveries(order_number: str):
    with connect_to_database() as connection:
        return connection.execute(
            """
            SELECT
                d.delivery_item_id,
                d.delivery_note_number,
                d.posting_date,
                i.item_name,
                d.quantity,
                d.unit
            FROM delivery_items AS d
            JOIN sales_order_items AS i
                ON d.sales_order_item_id = i.item_id
            WHERE i.order_number = %s
            ORDER BY d.posting_date DESC, d.delivery_note_number, d.delivery_item_id
            """,
            (order_number,),
        ).fetchall()
