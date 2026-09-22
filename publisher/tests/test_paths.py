import os, tempfile, unittest
from pathlib import Path
from unittest import mock
import collection_paths as P


class TestCandidateRoots(unittest.TestCase):
    def test_windows_uses_appdata(self):
        with mock.patch.object(P.sys, "platform", "win32"), \
             mock.patch.dict(os.environ, {"APPDATA": r"C:\Users\JP\AppData\Roaming"}):
            self.assertEqual([str(p) for p in P.candidate_roots()],
                             [str(Path(r"C:\Users\JP\AppData\Roaming") / "Anki2")])

    def test_macos_uses_application_support(self):
        with mock.patch.object(P.sys, "platform", "darwin"):
            self.assertTrue(str(P.candidate_roots()[0]).endswith(
                os.path.join("Library", "Application Support", "Anki2")))

    def test_linux_checks_local_share(self):
        with mock.patch.object(P.sys, "platform", "linux"):
            self.assertTrue(any(".local" in str(p) for p in P.candidate_roots()))


class TestFindCollections(unittest.TestCase):
    def test_finds_every_profile_sorted(self):
        root = Path(tempfile.mkdtemp()) / "Anki2"
        for profile in ("User 1", "Alt Profile"):
            (root / profile).mkdir(parents=True)
            (root / profile / "collection.anki2").write_bytes(b"x")
        with mock.patch.object(P, "candidate_roots", return_value=[root]):
            found = P.find_collections()
        self.assertEqual([p.parent.name for p in found], ["Alt Profile", "User 1"])

    def test_missing_root_is_not_an_error(self):
        with mock.patch.object(P, "candidate_roots",
                               return_value=[Path(tempfile.mkdtemp()) / "nope"]):
            self.assertEqual(P.find_collections(), [])


if __name__ == "__main__":
    unittest.main()
