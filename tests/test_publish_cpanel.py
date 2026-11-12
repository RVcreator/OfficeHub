import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publish', Path(__file__).parents[1] / 'scripts/publish_cpanel.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeFTP:
    def __init__(self, fail=None):
        self.files = {'index.html': b'old entry', 'assets/old-page.js': b'old page'}
        self.renamed = []
        self.fail = fail

    def pwd(self): return '/'
    def mkd(self, name): pass
    def storbinary(self, command, source):
        if self.fail == 'upload': raise IOError('disconnected')
        self.files[command[5:]] = source.read()
    def size(self, name): return 0 if self.fail == 'size' else len(self.files[name])
    def rename(self, source, target):
        self.files[target] = self.files.pop(source)
        self.renamed.append(target)


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'assets').mkdir()
        (self.root / 'assets/new-page.js').write_text('new page')
        (self.root / 'index.html').write_text('new entry')

    def tearDown(self): self.temp.cleanup()

    def test_new_release_keeps_old_tabs_working_and_entry_last(self):
        ftp = FakeFTP()
        module.publish(ftp, self.root)
        self.assertEqual(ftp.files['assets/old-page.js'], b'old page')
        self.assertEqual(ftp.files['assets/new-page.js'], b'new page')
        self.assertEqual(ftp.renamed[-1], 'index.html')
        self.assertEqual(ftp.files['index.html'], b'new entry')

    def test_failed_upload_or_size_check_preserves_live_entry(self):
        for failure in ['upload', 'size']:
            ftp = FakeFTP(failure)
            with self.assertRaises(IOError): module.publish(ftp, self.root)
            self.assertEqual(ftp.files['index.html'], b'old entry')
            self.assertEqual(ftp.files['assets/old-page.js'], b'old page')

    def test_empty_build_does_not_touch_host(self):
        (self.root / 'index.html').unlink()
        ftp = FakeFTP()
        with self.assertRaises(ValueError): module.publish(ftp, self.root)
        self.assertEqual(ftp.renamed, [])


if __name__ == '__main__': unittest.main()
