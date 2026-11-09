// Runs only on the FinLit website (see manifest.json). It does two small things, and reads nothing else from the page:
//   1. sets one attribute so the website can say "Installed" instead of "Add to Chrome";
//   2. tells the extension which FinLit address this browser uses (finlitventures.com, www or app), because the sign-in cookie belongs to that exact address.
document.documentElement.setAttribute("data-finlit-extension", chrome.runtime.getManifest().version);
try { chrome.runtime.sendMessage({ type: "seen-site", origin: location.origin }); } catch { /* the extension was just updated: the next page load tells it */ }
