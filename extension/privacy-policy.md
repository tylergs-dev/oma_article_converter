# Privacy Policy — Article to Print Extension

Last updated: June 2025

## Summary

Article to Print converts web articles into clean, printable text in your browser. We do not sell data, run advertising trackers, or collect analytics in this extension.

## Data the extension processes

- **Article URLs and page HTML** you choose to convert are processed locally in the extension when possible (from the active browser tab).
- If you paste a URL for a page that is not open, or if local extraction fails, the extension may fetch that URL from your browser.
- When **Jina Reader fallback** is enabled (default), the extension may send the article URL to `https://r.jina.ai/` so Jina can return readable article text. See [Jina Reader](https://jina.ai/reader/) for their terms and privacy policy.

## Data stored on your device

- Optional **Jina API key** and fallback preference are stored in Chrome/Edge `storage.sync` on your device only.
- Converted article previews are held temporarily in `storage.session` until you close the preview tab or the session ends.

## Data we do not collect

- No account is required.
- No usage analytics or crash reporting are built into this extension.
- No article content is sent to the developer's servers (the optional web app at Render is separate and not used by the extension unless you use it directly).

## Permissions

- **activeTab / scripting**: read the current page when you click Convert.
- **optional host permissions**: fetch a pasted URL only after you approve access for that site.
- **storage**: save your optional Jina API key and temporary preview data.
- **tabs**: open the print preview tab and read the active tab URL.
- **r.jina.ai**: Jina Reader fallback only.

## Contact

For questions about this policy, contact the extension developer through the repository listed on the Edge Add-ons store listing.
