import unittest,tempfile,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('dsh_installer',Path(__file__).resolve().parents[2]/'scripts/dsh-observer.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InstallerTests(unittest.TestCase):
 def test_preserves_plugins_and_uninstalls_exactly(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'cordis.patch.yml';original='# existing\n- id: other\n  config:\n    enabled: true\n';p.write_text(original)
   self.assertTrue(m.update(d,'/demo/plugin.mjs','/demo/state'))
   self.assertFalse(m.update(d,'/demo/plugin.mjs','/demo/state'))
   self.assertIn(original,p.read_text());self.assertEqual(len(list(Path(d).glob('*.observer-backup-*'))),1)
   self.assertTrue(m.update(d,'/demo/plugin.mjs','/demo/state',True));self.assertEqual(p.read_text(),original)
 def test_rejects_invalid_block_or_nonlist_without_writing(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'cordis.patch.yml'
   for original in [m.BEGIN+'broken\n','plugins: {}\n']:
    p.write_text(original)
    with self.assertRaises(ValueError):m.update(d,'/demo/plugin','/demo/state')
    self.assertEqual(p.read_text(),original)
