import glob, os, shutil, tempfile, unittest
from tests.fixtures import build_db, add_deck, set_config, set_schema_version
import anki_reader as R


def _path():
    return os.path.join(tempfile.mkdtemp(), "collection.anki2")


class TestSchemaGuard(unittest.TestCase):
    def test_accepts_version_18(self):
        con = build_db(_path())
        self.assertEqual(R.check_schema(con), 18)

    def test_rejects_older_schema_naming_both_versions(self):
        con = build_db(_path())
        set_schema_version(con, 11)
        with self.assertRaises(R.UnsupportedCollection) as ctx:
            R.check_schema(con)
        self.assertIn("11", str(ctx.exception))
        self.assertIn("18", str(ctx.exception))


class TestConfig(unittest.TestCase):
    def test_reads_json_encoded_bytes(self):
        con = build_db(_path())
        set_config(con, "rollover", 4)
        self.assertEqual(R.get_config(con, "rollover"), 4)

    def test_missing_key_returns_default(self):
        con = build_db(_path())
        self.assertEqual(R.get_config(con, "nope", "fallback"), "fallback")

    def test_rollover_defaults_to_4_when_absent(self):
        con = build_db(_path())
        self.assertEqual(R.rollover_hour(con), 4)

    def test_rollover_honours_a_custom_hour(self):
        con = build_db(_path())
        set_config(con, "rollover", 2)
        self.assertEqual(R.rollover_hour(con), 2)

    def test_nonsense_rollover_falls_back_to_4(self):
        con = build_db(_path())
        set_config(con, "rollover", 99)
        self.assertEqual(R.rollover_hour(con), 4)


class TestDeckNames(unittest.TestCase):
    def test_maps_id_to_name(self):
        con = build_db(_path())
        add_deck(con, 5, "Core 2k/6k")
        self.assertEqual(R.deck_names(con), {5: "Core 2k/6k"})

    def test_nested_decks_use_double_colon(self):
        # Schema 18 separates nesting levels with \x1f, not "::".
        con = build_db(_path())
        add_deck(con, 7, "Japanese\x1fListening")
        self.assertEqual(R.deck_names(con)[7], "Japanese::Listening")


class TestOpenCopy(unittest.TestCase):
    def test_copies_before_reading_and_leaves_original_untouched(self):
        src = _path()
        con = build_db(src)
        add_deck(con, 5, "Core 2k/6k")
        con.close()
        before = os.stat(src).st_mtime_ns

        copy_con, tmpdir = R.open_collection_copy(src)
        try:
            self.assertEqual(copy_con.execute("SELECT name FROM decks").fetchone()[0],
                             "Core 2k/6k")
            self.assertNotEqual(os.path.dirname(src), tmpdir)
            self.assertEqual(os.stat(src).st_mtime_ns, before)
        finally:
            copy_con.close()
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_a_failed_copy_leaves_no_temp_directory_behind(self):
        # The hourly task would otherwise litter a tmpdir on every run whose
        # collection path is wrong or locked.
        pattern = os.path.join(tempfile.gettempdir(), "ankicrew-*")
        before = set(glob.glob(pattern))
        with self.assertRaises(OSError):
            R.open_collection_copy(os.path.join(tempfile.mkdtemp(), "missing.anki2"))
        self.assertEqual(set(glob.glob(pattern)) - before, set())

    def test_copies_wal_sibling_when_present(self):
        src = _path()
        build_db(src).close()
        open(src + "-wal", "wb").write(b"")
        copy_con, tmpdir = R.open_collection_copy(src)
        try:
            self.assertTrue(os.path.exists(os.path.join(tmpdir, "collection.anki2-wal")))
        finally:
            copy_con.close()
            shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
