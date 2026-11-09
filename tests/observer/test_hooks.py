import importlib.util,json,tempfile,pathlib,unittest,tomllib,time
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("hooks",ROOT/"scripts/observer-hooks.py")
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class HooksTests(unittest.TestCase):
 def test_all_tools_strip_private_payload_and_missing_identity(self):
  raw={"hook_event_name":"PermissionRequest","session_id":"session","cwd":"/tmp/project","tool_name":"Bash","tool_input":{"command":"SECRET"},"prompt":"SECRET"}
  for tool in ("claude","codex","kimi"):
   e=h.normalize_hook(tool,raw);self.assertEqual(e["event"],"PermissionRequest");self.assertEqual(e["sessionId"],"session");self.assertNotIn("SECRET",json.dumps(e))
  self.assertIsNone(h.normalize_hook("codex",{"hook_event_name":"Stop"}))
 def test_subagent_metadata_and_lifecycle_are_kept_without_content(self):
  for tool in ("codex","claude"):
   for event in ("SubagentStart","SubagentStop","PreToolUse"):
    raw={"session_id":"parent","agent_id":"child","agent_type":"reviewer","cwd":"/tmp/p","hook_event_name":event,"last_assistant_message":"PRIVATE","tool_input":{"secret":"PRIVATE"}}
    e=h.normalize_hook(tool,raw)
    self.assertIsNotNone(e);self.assertEqual(e["agentId"],"child");self.assertEqual(e["sessionId"],"parent");self.assertEqual(e["agentType"],"reviewer");self.assertNotIn("PRIVATE",json.dumps(e))
  self.assertIsNone(h.normalize_hook("codex",{"session_id":"parent","cwd":"/tmp/p","hook_event_name":"SubagentStart"}))
 def test_installer_preserves_json_hooks_is_idempotent_and_removes_only_owned(self):
  with tempfile.TemporaryDirectory() as root:
   home=pathlib.Path(root);p=home/".claude/settings.json";p.parent.mkdir()
   old={"model":"keep","hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo existing"}]}]}}
   p.write_text(json.dumps(old))
   h.install("claude",home,home/"state");a=json.loads(p.read_text());h.install("claude",home,home/"state")
   self.assertEqual(a,json.loads(p.read_text()));self.assertEqual(a["hooks"]["Stop"][0],old["hooks"]["Stop"][0])
   h.uninstall("claude",home);self.assertEqual(json.loads(p.read_text()),old)
 def test_kimi_preserves_original_text_and_toml_structure(self):
  with tempfile.TemporaryDirectory() as root:
   home=pathlib.Path(root);p=home/".kimi-code/config.toml";p.parent.mkdir()
   old='default_model = "keep"\n\n[[hooks]]\nevent = "Stop"\ncommand = "existing"\n'
   p.write_text(old);h.install("kimi",home,home/"state");a=p.read_text();h.install("kimi",home,home/"state")
   self.assertEqual(a,p.read_text());self.assertEqual(tomllib.loads(a)["hooks"][0]["command"],"existing")
   h.uninstall("kimi",home);self.assertEqual(p.read_text(),old)
 def test_kimi_without_trailing_newline_roundtrips(self):
  with tempfile.TemporaryDirectory() as root:
   home=pathlib.Path(root);p=home/".kimi-code/config.toml";p.parent.mkdir()
   old='default_model = "keep"'
   p.write_text(old);h.install("kimi",home,home/"state");tomllib.loads(p.read_text())
   h.uninstall("kimi",home);self.assertEqual(p.read_text(),old)
 def test_kimi_root_inline_hooks_preserved(self):
  for original in ['hooks = []\n', 'hooks = [{event="Stop", command="keep"}]\n']:
   with tempfile.TemporaryDirectory() as root:
    home=pathlib.Path(root);p=home/".kimi-code/config.toml";p.parent.mkdir();p.write_text(original)
    before=tomllib.loads(original)["hooks"];h.install("kimi",home,home/"state")
    self.assertEqual(tomllib.loads(p.read_text())["hooks"][:len(before)],before)
    h.install("kimi",home,home/"state");h.uninstall("kimi",home);self.assertEqual(p.read_text(),original)
 def test_codex_config_only_managed_entries_removed(self):
  with tempfile.TemporaryDirectory() as root:
   home=pathlib.Path(root);h.install("codex",home,home/"state");p=home/".codex/hooks.json"
   self.assertIn("PermissionRequest",json.loads(p.read_text())["hooks"]);h.uninstall("codex",home)
   self.assertEqual(json.loads(p.read_text()).get("hooks",{}),{})
 def test_offline_and_nonlocal_receiver_fail_open(self):
  with tempfile.TemporaryDirectory() as root:
   state=pathlib.Path(root);(state/"connection.json").write_text(json.dumps({"url":"http://127.0.0.1:1/api/observer/events","token":"x"}))
   e=h.normalize_hook("kimi",{"hook_event_name":"Stop","session_id":"s","cwd":"/tmp/p"})
   t=time.monotonic();self.assertFalse(h.send(e,state));self.assertLess(time.monotonic()-t,1.5)
   (state/"connection.json").write_text(json.dumps({"url":"http://example.com/events","token":"x"}));self.assertFalse(h.send(e,state))
if __name__=="__main__":unittest.main()
