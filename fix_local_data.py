content = open('/app/routers/local_data.py').read()
old = '''        pipeline = [
            {"$match": query},
            {"$sort": {"hour": -1, "minute": -1}},
            {"$group": {
                "_id": {"store_id": "$store_id", "date": "$date"},
                "latest": {"$first": "$$ROOT"}
            }},
            {"$replaceRoot": {"newRoot": "$latest"}},
            {"$project": {"_id": 0}}
        ]
        snapshots = await db.counter_snapshots.aggregate(pipeline).to_list(10000)

        # Aggregate by store across all days
        store_data = {}
        for snap in snapshots:
            sid = snap["store_id"]'''
new = '''        pipeline = [
            {"$match": query},
            {"$sort": {"date": -1, "hour": -1, "minute": -1}},
            {"$group": {
                "_id": {"store_id": "$store_id", "date": "$date"},
                "total_in": {"$max": "$total_in"},
                "total_out": {"$max": "$total_out"},
                "current_visitors": {"$last": "$current_visitors"},
                "store_name": {"$first": "$store_name"}
            }}
        ]
        snapshots = await db.counter_snapshots.aggregate(pipeline).to_list(10000)

        # Aggregate by store across all days
        store_data = {}
        for snap in snapshots:
            sid = snap["_id"]["store_id"]'''
content = content.replace(old, new)
open('/app/routers/local_data.py', 'w').write(content)
print('Tamam' if old in open('/app/routers/local_data.py').read() == False else 'Degistirildi')
