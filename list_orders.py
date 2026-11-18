import json
import os
from urllib.request import Request, urlopen


api_key = os.environ["ERP_API_KEY"]
api_secret = os.environ["ERP_API_SECRET"]

base_url = os.environ["ERP_BASE_URL"].rstrip("/")
url = (
    f"{base_url}/api/resource/"
    "Sales%20Order?limit_page_length=20"
)

request = Request(
    url,
    headers={
        "Authorization": f"token {api_key}:{api_secret}",
    },
)

# Auftragsliste aus ERPNext abrufen
with urlopen(request, timeout=30) as response:
    result = json.load(response)

orders = result["data"]

print(f"Gefundene Aufträge: {len(orders)}")

for order in orders:
    print(order["name"])