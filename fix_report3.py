content = open('/app/server.py').read()
old = '''            for snap in snapshots:
                sid = snap["store_id"]'''
new = '''            for snap in snapshots:
                sid = snap.get("store_id") or snap.get("_id", {}).get("store_id") if isinstance(snap.get("_id"), dict) else snap.get("store_id")'''
content = content.replace(old, new)
open('/app/server.py', 'w').write(content)
print('Tamam')