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

-- Gebuchte Lieferpositionen mit Bezug zu einer Auftragsposition
CREATE TABLE IF NOT EXISTS delivery_items (
    delivery_item_id TEXT PRIMARY KEY,
    sales_order_item_id TEXT NOT NULL
        REFERENCES sales_order_items(item_id),
    delivery_note_number TEXT NOT NULL,
    posting_date DATE NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS delivery_items_sales_order_item_id_idx
    ON delivery_items (sales_order_item_id);
