import sys,re,json
s=sys.stdin.read().replace('\n',' ')
ev=re.search(r'"ev":\s*(\{[^}]*\})',s); mr=re.search(r'"minR":\s*(\d+)',s); tl=re.search(r'TIMELINE (\{[^}]*\})',s)
e={k.replace(' ',''):v for k,v in (json.loads(ev.group(1)) if ev else {}).items()}; T=json.loads(tl.group(1)) if tl else {}
print('hostile', T.get('HOSTILE'), '| gun-quality track', T.get('track good for guns (q>=0.15)'), '| first burst', e.get('firstburst'), '|', 'SHOT DOWN at %s' % e.get('SHOTDOWN') if 'SHOTDOWN' in e else 'got through', '| closest', mr.group(1) if mr else '?', 'm')
