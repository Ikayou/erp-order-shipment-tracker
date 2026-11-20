import os

import psycopg
from fastapi import FastAPI
from psycopg.rows import dict_row


app = FastAPI(title="ERP Order Shipment Tracker")


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
                    AS remaining_quantity
            FROM sales_orders AS o
            JOIN sales_order_items AS i
                ON o.order_number = i.order_number
            ORDER BY o.order_number, i.item_code, i.item_id
            """
        ).fetchall()


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
