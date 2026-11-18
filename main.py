from decimal import Decimal
import os
import psycopg
from fastapi import FastAPI
from psycopg.rows import dict_row


app = FastAPI(title="ERP Order Shipment Tracker")


@app.get("/api/orders")
def get_orders():
    # Kundenaufträge mit ihren Positionen aus PostgreSQL lesen
    with psycopg.connect(
        host="127.0.0.1",
        port=5433,
        dbname="erp_tracker",
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        row_factory=dict_row,
    ) as connection:
        rows = connection.execute(
            """
            SELECT
                o.order_number,
                o.customer_name,
                o.status,
                i.item_code,
                i.item_name,
                i.ordered_quantity,
                i.delivered_quantity,
                i.ordered_quantity - i.delivered_quantity
                    AS remaining_quantity
            FROM sales_orders AS o
            JOIN sales_order_items AS i
                ON o.order_number = i.order_number
            ORDER BY o.order_number, i.item_code
            """
        ).fetchall()

    return rows