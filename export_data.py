import urllib.request, json, sys, os

port = sys.argv[1] if len(sys.argv) > 1 else "5000"
base = f"http://127.0.0.1:{port}/api/"

# save into a "frontend" folder next to this script
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "frontend")
os.makedirs(out, exist_ok=True)

files = {
    "explorer-data": "explorer-data",
    "etl": "etl",
    "eda": "eda",
    "rejected": "rejected",
    "preview": "preview?limit=1000&offset=0",
}

for name, path in files.items():
    try:
        with urllib.request.urlopen(base + path) as r:
            obj = json.loads(r.read().decode("utf-8"))
        with open(os.path.join(out, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(obj, f, separators=(",", ":"))
        print("Saved", name + ".json")
    except Exception as e:
        print("FAILED", name, e)

print("\nDone. Files are in:", out)
