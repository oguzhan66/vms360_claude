content = open('/app/server.py').read()
old = '{"$sort": {"hour": -1, "minute": -1}},  # Sort by time descending'
new = '{"$sort": {"date": -1, "hour": -1, "minute": -1}},  # Sort by time descending'
content = content.replace(old, new)
open('/app/server.py', 'w').write(content)
print('Tamam')
