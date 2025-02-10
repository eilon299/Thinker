// Initialize state
document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.local.get(['extension_enabled', 'selected_model']);
  document.getElementById('powerToggle').checked = result.extension_enabled !== false;

  // Set selected model or default to gemini-1.5-pro
  const modelSelect = document.getElementById('modelSelect');
  modelSelect.value = result.selected_model || 'gemini-1.5-pro';
});

// Save settings
document.getElementById('saveKey').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value || await chrome.storage.local.get(['gemini_api_key']).then(result => result.gemini_api_key);
  const selectedModel = document.getElementById('modelSelect').value;

  chrome.storage.local.set({
    'gemini_api_key': apiKey,
    'selected_model': selectedModel
  }, () => {
    alert('Settings saved!');
    window.close(); // Close the popup after user clicks OK on the alert
  });
});

// Handle power toggle
document.getElementById('powerToggle').addEventListener('change', (e) => {
  chrome.storage.local.set({ 'extension_enabled': e.target.checked });
});

document.getElementById('activateBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: "activateThinker" });
  window.close(); // Close the extension popup
}); 