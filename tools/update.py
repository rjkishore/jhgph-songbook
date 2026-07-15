"""
NJP Songs — one-command updater.
Re-run this whenever the chord sites may have added new songs.

It ONLY looks at NJP songs that still have no chords, tries to match them
against the two chord sites (validating by Tamil lyrics), stores any new
finds, and regenerates songs.json for the app.

Usage:
    python update.py

Safe to run repeatedly — already-chorded songs are skipped, and every new
match is validated by Tamil-lyric overlap so wrong chords never get stored.
After it runs, redeploy songs.json (or let the app auto-refresh it when the
device is next online — the service worker pulls the new songs.json).
"""
import subprocess, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))   # tools/

STEPS = [
    ("churchspot.com (2200+ Tamil songs)", "churchspot_scraper.py"),
    ("thegodsmusic.com (deep Tamil match)", "godsmusic_deep.py"),
    ("tamilchristiansongs.in (fuzzy match)", "fuzzy_chords.py"),
]

def main():
    print("NJP chord updater - scanning sites for newly added songs\n")
    for label, script in STEPS:
        path = os.path.join(HERE, script)
        if not os.path.exists(path):
            print(f"  ! missing {script}, skipping")
            continue
        print(f"=== {label} ===")
        subprocess.run([sys.executable, path], check=False)
        print()
    print("Update complete. songs.json regenerated.")
    print("Deploy the updated songs.json (git push), and devices will pull the")
    print("new chords automatically when online.")

if __name__ == "__main__":
    main()
