"""Check publishable source and all Git history without printing secret values."""
import argparse, base64, io, json, pathlib, re, subprocess, tarfile, zipfile

patterns = [
    ('Google API key', re.compile(rb'AIza[0-9A-Za-z_-]{35}')),
    ('GitHub credential', re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})')),
    ('AWS access key', re.compile(rb'(?:AKIA|ASIA)[A-Z0-9]{16}')),
    ('private key', re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----')),
    ('Slack credential', re.compile(rb'xox[baprs]-[0-9A-Za-z-]{20,}')),
    ('OpenAI credential', re.compile(rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}')),
    ('credential URL', re.compile(rb'https?://[^\s/@:]+:[^\s/@]{8,}@')),
    ('Cloudflare credential', re.compile(rb'(?i)(?:cloudflare_api_token|cloudflare_api_key|cf_api_token)\s*[=:]\s*[\"\x27][A-Za-z0-9_-]{30,}[\"\x27]')),
]
failures, archives, expanded = [], 0, 0

def private_path(name):
    parts=pathlib.PurePosixPath(name.replace('\\','/')).parts
    return any(p in {'private-config','feedback-export'} for p in parts) or any(p in {'.env','.dev.vars'} for p in parts) or name.endswith(('.sqlite','.sqlite3','.db','.pem','.p12','.pfx'))

def scan(name, data, depth=0):
    global archives, expanded
    if private_path(name): failures.append({'path':name,'reason':'private or credential file'})
    for kind, pattern in patterns:
        if pattern.search(data): failures.append({'path':name,'reason':kind})
    if depth>3: raise ValueError('Nested archive requires manual review: '+name)
    if name.lower().endswith('.zip.b64'):
        scan(name[:-4],base64.b64decode(b''.join(data.split()),validate=True),depth+1)
        return
    if name.lower().endswith(('.zip','.tar.gz','.tgz')):
        archives+=1
        if name.lower().endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for entry in archive.infolist():
                    if entry.is_dir(): continue
                    expanded+=entry.file_size
                    if expanded>300_000_000: raise ValueError('Archive expansion exceeds audit budget')
                    scan(name+'!'+entry.filename,archive.read(entry),depth+1)
        else:
            with tarfile.open(fileobj=io.BytesIO(data),mode='r:*') as archive:
                for entry in archive:
                    if not entry.isfile(): continue
                    expanded+=entry.size
                    if expanded>300_000_000: raise ValueError('Archive expansion exceeds audit budget')
                    scan(name+'!'+entry.name,archive.extractfile(entry).read(),depth+1)

def git(*args): return subprocess.check_output(['git',*args])

parser=argparse.ArgumentParser();parser.add_argument('--worktree-only',action='store_true');args=parser.parse_args()
root=pathlib.Path.cwd();files=0;commits=[]
if not args.worktree_only:
    commits=git('rev-list','--all').decode().splitlines();objects={}
    for commit in commits:
        for entry in git('ls-tree','-rz',commit).split(b'\0'):
            if not entry: continue
            meta,path=entry.split(b'\t',1);mode,kind,oid=meta.split();name=path.decode('utf8',errors='replace')
            if private_path(name): failures.append({'path':name,'reason':'private file in Git history'})
            if kind==b'blob': objects.setdefault(oid.decode(),name)
    for oid,name in objects.items(): scan('history/'+name,git('cat-file','blob',oid));files+=1
    scan('commit messages',git('log','--all','--format=%B'))
    current=git('ls-files','-z').decode().split('\0')
else:
    ignored={'.git','node_modules','.cloudflare','.wrangler','.sites-runtime','private-config','feedback-export'}
    current=[str(p.relative_to(root)).replace('\\','/') for p in root.rglob('*') if p.is_file() and not any(part in ignored for part in p.relative_to(root).parts) and p.name not in {'.env','.dev.vars'}]
for name in current:
    if name and (root/name).is_file(): scan(name,(root/name).read_bytes());files+=1
result={'passed':not failures,'commits':len(commits),'filesChecked':files,'archivesChecked':archives,'findings':list({(f['path'],f['reason']):f for f in failures}.values())}
print(json.dumps(result,ensure_ascii=False))
if failures: raise SystemExit(1)
