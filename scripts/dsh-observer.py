#!/usr/bin/env python3
"""Install only AgentCrew's native DSH observer entry; preserve other plugins."""
import argparse,json,os,re,time,uuid
from pathlib import Path
BEGIN='# BEGIN agentcrew-dsh-observer-v1\n'
END='# END agentcrew-dsh-observer-v1\n'

def update(profile_dir,plugin,state_dir,uninstall=False):
    target=Path(profile_dir)/'cordis.patch.yml'
    old=target.read_text() if target.exists() else ''
    if old.count(BEGIN)!=old.count(END) or old.count(BEGIN)>1:
        raise ValueError('Invalid managed block; configuration left unchanged')
    if BEGIN in old:
        before,rest=old.split(BEGIN,1);_,after=rest.split(END,1);base=before+after
    else:base=old
    if uninstall:new=base
    else:
        first=next((line.strip() for line in base.splitlines() if line.strip() and not line.lstrip().startswith('#')),'')
        if first and not first.startswith('-'):
            raise ValueError('Expected a YAML patch list; configuration left unchanged')
        if base and not base.endswith('\n'):raise ValueError('Patch must end with newline; configuration left unchanged')
        block=BEGIN+'- insert:\n    - id: agentcrew-dsh-observer\n      name: '+json.dumps(Path(plugin).resolve().as_uri())+'\n      config:\n        stateDir: '+json.dumps(str(Path(state_dir).expanduser().resolve()))+'\n'+END
        new=base+block
    if old==new:return False
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():
        backup=target.with_name(target.name+'.observer-backup-'+str(time.time_ns()))
        fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:f.write(old)
    tmp=target.with_name(target.name+'.observer-tmp-'+uuid.uuid4().hex)
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(new)
    os.replace(tmp,target)
    return True

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['install','uninstall'])
    p.add_argument('--profile',default='desktop')
    p.add_argument('--dsh-home',type=Path,default=Path.home()/'.dsh')
    p.add_argument('--state-dir',type=Path,default=Path.home()/'.hermes3d-observer')
    a=p.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+',a.profile):p.error('Invalid profile name')
    plugin=Path(__file__).resolve().parent.parent/'plugins/dsh-observer/index.mjs'
    changed=update(a.dsh_home/'profiles'/a.profile,plugin,a.state_dir,a.action=='uninstall')
    print('DSH observer configuration updated.' if changed else 'No configuration change needed.')
    print('Reload the DSH profile to activate changes; existing agent runs are not restarted by this installer.')
if __name__=='__main__':main()
