// The toolbar menu: two switches the person controls. Nothing here talks to the network.
const $ = (id) => document.getElementById(id);
(async () => {
  const prefs = await chrome.storage.local.get({ enabled: true, disabledHosts: [] });
  $("enabled").checked = prefs.enabled !== false;
  $("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab && tab.url && new URL(tab.url);
    if (url && /^https?:$/.test(url.protocol)) {
      const h = url.hostname;
      $("hostName").textContent = h; $("siteRow").hidden = false;
      $("site").checked = (prefs.disabledHosts || []).includes(h);
      $("site").addEventListener("change", async (e) => {
        const cur = (await chrome.storage.local.get({ disabledHosts: [] })).disabledHosts;
        const next = e.target.checked ? [...new Set([...cur, h])] : cur.filter((x) => x !== h);
        await chrome.storage.local.set({ disabledHosts: next });
      });
    }
  } catch { /* no active tab to read: the per-site switch stays hidden */ }
})();
