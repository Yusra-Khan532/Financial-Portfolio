// Runs only on the FinLit website (see manifest.json). It sets one attribute on the page so the website can say "Installed" instead of "Add to Chrome".
// It reads nothing from the page and sends nothing anywhere.
document.documentElement.setAttribute("data-finlit-extension", chrome.runtime.getManifest().version);
