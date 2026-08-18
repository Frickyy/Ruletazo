import urllib.request
import urllib.parse
import json
import traceback

def make_req(url, params=None, method='GET'):
    if params:
        url += '?' + urllib.parse.urlencode({k: str(v) for k, v in params.items()})
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            body = resp.read()
            return status, json.loads(body)
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read()
        try:
            return status, json.loads(body)
        except Exception:
            return status, body.decode('utf-8', errors='ignore')

def main():
    base_url = "http://localhost:8001"
    
    print("--- STEP 1 ---")
    status1, data1 = make_req(f"{base_url}/api/games/library", {
        "steamid": "gaben",
        "search": "counter",
        "sort_by": "price",
        "sort_direction": "asc"
    })
    print(f"Status: {status1}")
    if isinstance(data1, list):
        print(f"Count: {len(data1)}")
        for game in data1:
            name = game.get("name")
            price_cents = game.get("price_cents")
            release_date = game.get("release_date")
            print(f"({name!r}, {price_cents}, {release_date!r})")
    else:
        print(f"Unexpected response library: {data1}")

    print("--- STEP 2 ---")
    status2, data2 = make_req(f"{base_url}/api/games/library", {
        "steamid": "gaben",
        "search": "counter",
        "sort_by": "price",
        "sort_direction": "desc"
    })
    print(f"Status: {status2}")
    if isinstance(data2, list):
        names = [g.get("name") for g in data2]
        print(f"Names: {names}")
    else:
        print(f"Unexpected response library: {data2}")

    print("--- STEP 3 ---")
    # Wrap in try/finally to ensure cleanup
    try:
        # Add favorite appid 10
        print("Adding favorite appid 10...")
        add_status, add_data = make_req(f"{base_url}/api/games/favorites", {
            "steamid": "gaben",
            "appid": 10
        }, method='POST')
        print(f"Add status: {add_status}, Response: {add_data}")

        # GET /library?collection=favorites&search=counter
        status_fav1, data_fav1 = make_req(f"{base_url}/api/games/library", {
            "steamid": "gaben",
            "collection": "favorites",
            "search": "counter"
        })
        print(f"Get Favorites 1 Status: {status_fav1}")
        if isinstance(data_fav1, list):
            print(f"Count: {len(data_fav1)}")
            print(f"Appids: {[g.get('appid') for g in data_fav1]}")
        else:
            print(f"Unexpected response favorites: {data_fav1}")

    finally:
        # DELETE favorite appid 10
        print("Cleaning up (DELETE favorite appid 10)...")
        del_status, del_data = make_req(f"{base_url}/api/games/favorites", {
            "steamid": "gaben",
            "appid": 10
        }, method='DELETE')
        print(f"Delete status: {del_status}, Response: {del_data}")

        # GET /library?collection=favorites&search=counter again
        status_fav2, data_fav2 = make_req(f"{base_url}/api/games/library", {
            "steamid": "gaben",
            "collection": "favorites",
            "search": "counter"
        })
        print(f"Get Favorites 2 Status: {status_fav2}")
        if isinstance(data_fav2, list):
            print(f"Count: {len(data_fav2)}")
            print(f"Appids: {[g.get('appid') for g in data_fav2]}")
        else:
            print(f"Unexpected response favorites: {data_fav2}")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
