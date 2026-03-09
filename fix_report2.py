content = open('/app/server.py').read()
old = '''"$group": {
                    "_id": {"store_id": "$store_id", "date": "$date"},
                    "latest": {"$first": "$$ROOT"}
                }},
                {"$replaceRoot": {"newRoot": "$latest"}},'''
new = '''"$group": {
                    "_id": {"store_id": "$store_id", "date": "$date"},
                    "total_in": {"$max": "$total_in"},
                    "total_out": {"$max": "$total_out"},
                    "current_visitors": {"$last": "$current_visitors"},
                    "store_name": {"$first": "$store_name"},
                    "store_id": {"$first": "$store_id"},
                    "date": {"$first": "$date"}
                }},'''
content = content.replace(old, new)
open('/app/server.py', 'w').write(content)
print('Tamam')