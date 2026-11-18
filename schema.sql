-- Kundenaufträge aus ERPNext
CREATE TABLE IF NOT EXISTS sales_orders (
    order_number TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    status TEXT NOT NULL
);

-- Positionen der Kundenaufträge
CREATE TABLE IF NOT EXISTS sales_order_items (
    item_id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL
        REFERENCES sales_orders(order_number),
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    ordered_quantity NUMERIC NOT NULL,
    delivered_quantity NUMERIC NOT NULL
);