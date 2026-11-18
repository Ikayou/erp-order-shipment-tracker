import json
import os
from urllib.parse import quote
from urllib.request import Request, urlopen


# Zugangsdaten aus den Umgebungsvariablen lesen
api_key = os.environ["ERP_API_KEY"]
api_secret = os.environ["ERP_API_SECRET"]

base_url = os.environ["ERP_BASE_URL"].rstrip("/")
order_number = quote(os.environ["ERP_ORDER_NUMBER"], safe="")
url = f"{base_url}/api/resource/Sales%20Order/{order_number}"

# Anfrage mit API-Schlüssel und API-Secret vorbereiten
request = Request(
    url,
    headers={
        "Authorization": f"token {api_key}:{api_secret}",
    },
)

# Antwort von ERPNext laden und JSON in ein Python-Dictionary umwandeln
with urlopen(request, timeout=30) as response:
    result = json.load(response)

order = result["data"]

print(f"Auftrag: {order['name']}")
print(f"Kunde: {order['customer_name']}")
print(f"Status: {order['status']}")
print()

# Die Positionen des Auftrags einzeln anzeigen
for item in order["items"]:
    ordered = item["qty"]
    delivered = item["delivered_qty"]
    remaining = ordered - delivered

    print(f"Artikel: {item['item_name']}")
    print(f"Bestellt: {ordered}")
    print(f"Geliefert: {delivered}")
    print(f"Offen: {remaining}")
    print()