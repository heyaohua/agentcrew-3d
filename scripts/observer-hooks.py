#!/usr/bin/env python3
"""Additive local observation hooks. Python 3.11+. Never returns agent decisions."""
import argparse
import base64
import re
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time
import tomllib
import urllib.request
import urllib.parse
import uuid

MARKER = "# hermes3d-observer-v1"
BEGIN = "# BEGIN hermes3d-observer-v1\n"
END = "# END hermes3d-observer-v1\n"
COMMON = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop"]
EVENTS = {
    "codex": COMMON + ["Interrupt", "SessionEnd", "SubagentStart", "SubagentStop"],
    "claude": COMMON + ["PostToolUseFailure", "StopFailure", "SessionEnd", "Elicitation", "ElicitationResult", "SubagentStart", "SubagentStop"],
    "kimi": COMMON + ["PostToolUseFailure", "StopFailure"],
}

def clean(value, limit):
    return value if isinstance(value, str) and 0 < len(value) <= limit and not any(ord(c)<32 or ord(c)==127 for c in value) else None

def normalize_hook(tool, raw):
    if tool not in EVENTS or not isinstance(raw, dict):
        return None
    event = raw.get("hook_event_name") or raw.get("event")
    if event not in EVENTS[tool]:
        return None
    session = clean(raw.get("session_id") or raw.get("thread_id") or raw.get("sessionId"), 200)
    project = clean(raw.get("cwd") or raw.get("work_dir"), 4096)
    if not session or not project:
        return None
    agent_id = clean(raw.get("agent_id"), 200) or ""
    if event in ("SubagentStart", "SubagentStop") and not agent_id:
        return None
    return {"agentId":agent_id, "agentType":clean(raw.get("agent_type"),100) or "", "tool":tool, "sessionId":session, "project":project, "event":event,
            "toolName":clean(raw.get("tool_name"),100) or "",
            "toolUseId":clean(raw.get("tool_use_id") or raw.get("tool_call_id"),200) or "",
            "occurredAt":int(time.time()*1000), "eventId":str(uuid.uuid4())}

def owner_process(tool):
    """Read only ancestor process metadata; never send commands or environment."""
    try:
        pid=os.getppid()
        for _ in range(12):
            row=subprocess.check_output(["/bin/ps","-p",str(pid),"-o","ppid=,lstart=,comm="],text=True,timeout=.15).strip().split(None,6)
            if len(row)<7:return None
            parent=int(row[0]);start=" ".join(row[1:6]);executable=Path(row[6]).name.lower()
            if executable in {tool,tool+"-cli"}:
                return {"pid":pid,"start":start}
            if parent<=1:return None
            pid=parent
    except (OSError,ValueError,subprocess.SubprocessError):pass
    return None

def send(event, state_dir):
    if not event:
        return False
    try:
        config = json.loads((Path(state_dir)/"connection.json").read_text())
        parsed = urllib.parse.urlparse(config["url"])
        if parsed.scheme not in ("http","https") or parsed.hostname not in ("127.0.0.1","localhost","::1") or parsed.path != "/api/observer/events":
            return False
        req = urllib.request.Request(config["url"], data=json.dumps(event).encode(),
             headers={"Content-Type":"application/json","Authorization":"Bearer "+config["token"]},method="POST")
        # Never route local status through user-configured HTTP proxies.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=0.6) as response:
            return response.status == 202
    except Exception:
        return False

def config_path(tool, home):
    return Path(home)/{"claude":".claude/settings.json","codex":".codex/hooks.json","kimi":".kimi-code/config.toml"}[tool]

def write_config(p, text):
    p.parent.mkdir(parents=True,exist_ok=True)
    if p.exists():
        if p.read_text() == text:
            return
        backup = p.with_name(p.name+".observer-backup-"+time.strftime("%Y%m%d%H%M%S")+"-"+uuid.uuid4().hex[:8])
        fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"wb") as f: f.write(p.read_bytes())
    temp=p.with_name(p.name+".observer-tmp-"+uuid.uuid4().hex)
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as f:f.write(text)
    os.replace(temp,p)

def strip_toml(text):
    if BEGIN not in text:
        return text
    before, rest = text.split(BEGIN,1)
    if END not in rest:
        raise ValueError("Incomplete observer block; leave configuration unchanged")
    _, after = rest.split(END,1)
    if rest.startswith("# original-base64: "):
        original=rest.split("\n",1)[0].removeprefix("# original-base64: ")
        return before+base64.b64decode(original).decode()+after
    return before+after

def managed(command):
    return isinstance(command,str) and command.endswith(MARKER) and "observer-hooks.py" in command

def strip_json(data):
    hooks=data.get("hooks",{})
    if not isinstance(hooks,dict):raise ValueError("Unexpected hooks structure")
    for event, groups in list(hooks.items()):
        kept=[]
        for group in groups:
            items=group.get("hooks",[])
            if any(managed(item.get("command")) for item in items):
                remaining=[item for item in items if not managed(item.get("command"))]
                if remaining:kept.append({**group,"hooks":remaining})
            else:kept.append(group)
        if kept:hooks[event]=kept
        else:hooks.pop(event,None)
    return data

def install(tool, home, state_dir):
    p=config_path(tool,home)
    command=" ".join(shlex.quote(x) for x in [sys.executable,str(Path(__file__).resolve()),"send","--tool",tool,"--state-dir",str(Path(state_dir).resolve())])+" "+MARKER
    if tool=="kimi":
        original=p.read_text() if p.exists() else ""
        text=strip_toml(original)
        # Keep exactly the original prefix; a separator is part of the managed block.
        block=BEGIN
        for event in EVENTS[tool]:
            block+='[[hooks]]\nevent = '+json.dumps(event)+'\ncommand = '+json.dumps(command)+'\ntimeout = 2\n'
        # Root inline hooks arrays cannot be extended with [[hooks]].
        # Replace only that assignment, retaining the exact original for rollback.
        match=re.search(r"(?m)^hooks\s*=",text)
        inline=None
        if match:
            for end in [m.end() for m in re.finditer("\n",text[match.start():])] + [len(text)-match.start()]:
                fragment=text[match.start():match.start()+end]
                try:
                    parsed=tomllib.loads(fragment)
                    if isinstance(parsed.get("hooks"),list):
                        inline=(match.start(),match.start()+end,fragment,parsed["hooks"]);break
                except tomllib.TOMLDecodeError:pass
        if inline:
            start,end,original,old_hooks=inline
            def toml_value(value):
                if isinstance(value,dict):return "{"+", ".join(json.dumps(k)+" = "+toml_value(v) for k,v in value.items())+"}"
                if isinstance(value,list):return "["+", ".join(toml_value(v) for v in value)+"]"
                if isinstance(value,(str,bool,int,float)):return json.dumps(value,ensure_ascii=False)
                raise ValueError("Unsupported inline hook value")
            new_hooks=old_hooks+[{"event":event,"command":command,"timeout":2} for event in EVENTS[tool]]
            managed_block=BEGIN+"# original-base64: "+base64.b64encode(original.encode()).decode()+"\n"+"hooks = "+toml_value(new_hooks)+"\n"+END
            text=text[:start]+managed_block+text[end:]
        else:
            text+=block+END
        tomllib.loads(text)
        write_config(p,text)
    else:
        data=json.loads(p.read_text()) if p.exists() else {}
        strip_json(data)
        hooks=data.setdefault("hooks",{})
        for event in EVENTS[tool]:
            hooks.setdefault(event,[]).append({"hooks":[{"type":"command","command":command,"timeout":2}]})
        write_config(p,json.dumps(data,ensure_ascii=False,indent=2)+"\n")

def uninstall(tool,home):
    p=config_path(tool,home)
    if not p.exists():return
    if tool=="kimi":
        text=strip_toml(p.read_text());tomllib.loads(text)
    else:
        text=json.dumps(strip_json(json.loads(p.read_text())),ensure_ascii=False,indent=2)+"\n"
    write_config(p,text)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action",choices=["send","install","uninstall"])
    parser.add_argument("--tool",required=True,choices=EVENTS)
    parser.add_argument("--home",default=str(Path.home()))
    parser.add_argument("--state-dir",default=os.environ.get("OBSERVER_STATE_DIR",str(Path.home()/".hermes3d-observer")))
    args=parser.parse_args()
    if args.action=="send":
        try:
            raw=sys.stdin.buffer.read(1024*1024+1)
            if len(raw)<=1024*1024:
                event=normalize_hook(args.tool,json.loads(raw))
                if event:
                    owner=owner_process(args.tool)
                    if owner:event["processInfo"]=owner
                    send(event,args.state_dir)
        except Exception:pass
        # Empty stdout and exit 0 mean no decision and no intervention.
        return
    if args.action=="install":install(args.tool,args.home,args.state_dir)
    else:uninstall(args.tool,args.home)
    print(args.action+": "+str(config_path(args.tool,args.home)))

if __name__=="__main__":main()
