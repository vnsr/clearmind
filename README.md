# Clear Mind: offline journal app

This is a private web app you can install on your phone. It works completely offline. Your entries are stored only in the browser on your phone. There are no accounts and no servers, and nothing is ever uploaded.

## Put it online (GitHub Pages, free)

1. Create a new **public** repository, for example `clear-mind`. The app contains no personal data. Your entries never leave your phone.
2. Upload everything in this folder to the root of the repository: `index.html`, `app.js`, `content.js`, `sw.js`, `manifest.webmanifest`, and the `fonts/` and `icons/` folders.
3. Go to Settings → Pages → Deploy from branch → `main` / root, then save.
4. On your iPhone, open `https://<your-username>.github.io/clear-mind/` in Safari. Tap Share → Add to Home Screen.
5. Open it once from the home screen while you're online. After that it works offline.

## Updating the app later
If you change any file, increase `VERSION` in `sw.js` (for example to `clearmind-v2`) so phones pick up the new files. Your journal data is not affected.

## Backups
Go to Tools → Backup, reminder & privacy → **Export backup**. On iPhone this opens the share sheet, where you can save the file to iCloud Drive. **Import backup** merges the file into the journal on any device: for each entry, the newer version wins.

Clearing Safari's website data deletes the journal. Export a backup every week or so.

## What the app tracks for you
- **Check-in trends:** mood, calm, confidence, energy and sleep. After 10 entries, the lines switch to a rolling average.
- **WHO-5 well-being index:** days 1, 14 and 30. The app flags a score below 50, and a change of 10 points or more counts as meaningful.
- **Thinking traps:** a heat grid of the traps you tagged, week by week.
- **Language lens:** the rate of absolutist words (always, never, nothing), should/must, painful-feeling and positive-feeling words, hopeful words and self-focus, measured in your writing in English and German. It compares your earliest entries with your most recent ones, and shows which topics you've been writing about more lately.
- **Thought records:** how much your belief in a painful thought dropped.
- **Then and now:** your first free writing next to your latest.

These are mirrors, not diagnoses.
