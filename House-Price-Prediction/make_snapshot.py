import json, pathlib, urllib.request

BASE = "http://127.0.0.1:5000"   # change the port if yours is different
out = pathlib.Path("frontend/data")
out.mkdir(parents=True, exist_ok=True)

endpoints = {
    "etl": "/api/etl",
    "eda": "/api/eda",
    "rejected": "/api/rejected",
    "preview": "/api/preview?limit=500&offset=0",
}
for name, path in endpoints.items():
    with urllib.request.urlopen(BASE + path) as r:
        data = json.loads(r.read().decode("utf-8"))
    (out / f"{name}.json").write_text(json.dumps(data), encoding="utf-8")
    print("saved", name)