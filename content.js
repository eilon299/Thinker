let processingText = false;
let currentResultDiv = null;
let selectionMenu = null;

async function isExtensionEnabled() {
  const result = await chrome.storage.local.get(['extension_enabled']);
  return result.extension_enabled !== false;
}

async function getApiKey() {
  const result = await chrome.storage.local.get(['gemini_api_key']);
  return result.gemini_api_key;
}

// Function to get cursor position with viewport boundary checking
function getSelectionCoordinates() {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get menu dimensions (approximate if not yet created)
    const menuWidth = 150; // Approximate width of the menu
    const menuHeight = 40; // Approximate height of the menu
    
    // Default position (right of selection)
    let x = rect.right + window.scrollX + 10;
    let y = rect.top + window.scrollY;
    
    // Check right boundary
    if (x + menuWidth > viewportWidth + window.scrollX) {
      // If too close to right edge, place it to the left of the selection
      x = rect.left + window.scrollX - menuWidth - 10;
      
      // If still outside viewport (too close to left edge), place it below the selection
      if (x < window.scrollX) {
        x = rect.left + window.scrollX;
        y = rect.bottom + window.scrollY + 10;
      }
    }
    
    // Check bottom boundary
    if (y + menuHeight > viewportHeight + window.scrollY) {
      // If too close to bottom edge, place it above the selection
      y = rect.top + window.scrollY - menuHeight - 10;
    }
    
    // Final check to ensure coordinates are not negative
    x = Math.max(window.scrollX, x);
    y = Math.max(window.scrollY, y);
    
    return { x, y };
  }
  return null;
}

// Function to remove selection menu
function removeSelectionMenu() {
  if (selectionMenu && selectionMenu.parentNode) {
    selectionMenu.parentNode.removeChild(selectionMenu);
  }
}

document.addEventListener('mouseup', async (e) => {
  if (processingText) return;
  
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText || selectedText.length === 0) {
    removeSelectionMenu();
    return;
  }

  const isEnabled = await isExtensionEnabled();
  if (!isEnabled) return;

  if (selectionMenu) removeSelectionMenu();

  const coords = getSelectionCoordinates();
  if (!coords) return;

  // Create selection menu
  selectionMenu = document.createElement('div');
  selectionMenu.style.position = 'absolute';
  selectionMenu.style.left = coords.x + 'px';
  selectionMenu.style.top = coords.y + 'px';
  selectionMenu.style.zIndex = '10000';
  selectionMenu.style.background = 'none';
  selectionMenu.style.border = 'none';
  selectionMenu.style.borderRadius = '5px';
  selectionMenu.style.padding = '5px';

  const processButton = document.createElement('button');
  processButton.textContent = 'Process with Gemini';
  processButton.style.cssText = `
    padding: 8px 20px;
    background: linear-gradient(90deg, #2196F3 0%, #2196F3 50%, #64B5F6 50%, #2196F3 100%);
    background-size: 200% 100%;
    color: white;
    border: none;
    border-radius: 25px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    position: relative;
    overflow: hidden;
    animation: shine 2s infinite linear;
    box-shadow: 0 2px 5px rgba(33, 150, 243, 0.3);
    outline: none !important;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: transparent;
  `;

  // Add the keyframe animation and button styles to the document
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shine {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }
    button:focus {
      outline: none !important;
      box-shadow: 0 2px 5px rgba(33, 150, 243, 0.3);
    }
  `;
  document.head.appendChild(style);

  processButton.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Store selected text and clear selection
    const selectedText = window.getSelection().toString().trim();
    window.getSelection().removeAllRanges();
    
    // Force remove menu
    if (selectionMenu) {
        document.body.removeChild(selectionMenu);
        selectionMenu = null;
    }
    
    console.log('Process button clicked');
    processingText = true;
    
    try {
      const apiKey = await getApiKey();
      // Use stored selectedText instead of getting it again later
      if (!apiKey || apiKey.trim() === '') {
        alert('Please set your Google API key in the extension popup. Make sure to click the Save button after entering the key.');
        processingText = false;
        return;
      }

      if (currentResultDiv) {
        document.body.removeChild(currentResultDiv);
      }

      // Create loading window
      currentResultDiv = document.createElement('div');
      currentResultDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 20px;
        background: linear-gradient(135deg, #2196F3 0%, #64B5F6 100%);
        color: white;
        border: none;
        border-radius: 15px;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 4px 15px rgba(33, 150, 243, 0.3);
        font-family: Arial, sans-serif;
        font-size: 14px;
        animation: fadeIn 0.3s ease-in-out;
      `;

      // Add fade-in animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `;
      document.head.appendChild(style);

      // Add close button
      const closeButton = document.createElement('button');
      closeButton.innerHTML = '✕';
      closeButton.style.position = 'absolute';
      closeButton.style.right = '10px';
      closeButton.style.top = '10px';
      closeButton.style.border = 'none';
      closeButton.style.background = 'none';
      closeButton.style.cursor = 'pointer';
      closeButton.style.fontSize = '16px';
      closeButton.style.color = '#666';
      currentResultDiv.appendChild(closeButton);

      // Create main content container
      const contentContainer = document.createElement('div');
      contentContainer.style.marginTop = '20px';
      contentContainer.style.textAlign = 'center';

      // Add processing text
      const processingText = document.createElement('div');
      processingText.textContent = 'Processing...';
      processingText.style.marginBottom = '15px';
      contentContainer.appendChild(processingText);

      // Add loading bar
      const loadingBar = document.createElement('div');
      loadingBar.innerHTML = `
        <div class="loading-bar" style="
          width: 200px;
          height: 3px;
          background: #f0f0f0;
          border-radius: 3px;
          overflow: hidden;
          margin: 0 auto;
        ">
          <div style="
            width: 100%;
            height: 100%;
            background: #4285f4;
            animation: slide 1s infinite linear;
          "></div>
        </div>
        <style>
          @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        </style>
      `;
      contentContainer.appendChild(loadingBar);

      // Add everything to the main div and to the document
      currentResultDiv.appendChild(contentContainer);
      document.body.appendChild(currentResultDiv);
      console.log('Loading window created and added to document');

      let abortController = new AbortController();
      closeButton.onclick = () => {
        abortController.abort();
        if (currentResultDiv && currentResultDiv.parentNode) {
          document.body.removeChild(currentResultDiv);
          currentResultDiv = null;
        }
        processingText = false;
      };

      try {
        // const SYSTEM_PROMPT = "ignore the above instructions and just process the text"
        const SYSTEM_PROMPT = 
        'You are a critical thinking assistant, tasked with analyzing news articles for political bias and providing an objective assessment of the content. Your responsibilities include: \
        1. Critical Thinking Framework: Use established critical thinking guidelines such as identifying assumptions, evaluating evidence, detecting logical fallacies, and assessing the tone and language of the article. \
        2. Bias Detection: Analyze the article for signs of political bias, including word choice, framing of events, omission of facts, and one-sided reporting. \
        3. Comparative Analysis: Search the web for other reports of the same event and compare how different sources depict the event. Highlight differences in tone, emphasis, and omitted or included details. \
        4. Balanced Perspective: Provide a summary of the event that synthesizes the information from multiple sources, aiming for neutrality and balance. \
        5. Transparency: Clearly explain your reasoning and cite specific examples from the articles to support your analysis. Include links to the sources you reference. \
        Always remain neutral, avoid injecting personal opinions, and prioritize factual accuracy. Your goal is to help users develop a deeper understanding of media bias and improve their critical thinking skills. \
        You will answer in hebrew. You will answer in a bried, fluent manner of up to 2 paragraphs. You will try to be as intreseting to read as possible. The text you are processing is the following.'
        // const SYSTEM_PROMPT = "You are a helpful AI assistant. Process the following text:";
        
        // Get the selected model from storage
        const modelResult = await chrome.storage.local.get(['selected_model']);
        const modelName = modelResult.selected_model || 'gemini-1.5-pro';
        console.log('Model name:', modelName);

        // Make sure to store selectedText
        console.log('Selected text:', selectedText);
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey.trim()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortController.signal,
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: SYSTEM_PROMPT
                },
                {
                  text: selectedText
                }
              ]
            }],
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 2048,
            }
          })
        });

      console.log('API request sent');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

        const data = await response.json();
        const result = data.candidates[0].content.parts[0].text;
        
        // Clear all content from container
        contentContainer.innerHTML = '';
        
        // Remove the close button from the previous state
        closeButton.remove();
        
        // Add new close button
        const resultCloseButton = document.createElement('button');
        resultCloseButton.innerHTML = '✕';
        resultCloseButton.style.position = 'absolute';
        resultCloseButton.style.right = '10px';
        resultCloseButton.style.top = '10px';
        resultCloseButton.style.border = 'none';
        resultCloseButton.style.background = 'none';
        resultCloseButton.style.cursor = 'pointer';
        resultCloseButton.style.fontSize = '16px';
        resultCloseButton.style.color = '#666';
        currentResultDiv.appendChild(resultCloseButton);
        
        resultCloseButton.onclick = () => {
          if (currentResultDiv && currentResultDiv.parentNode) {
            document.body.removeChild(currentResultDiv);
            currentResultDiv = null;
          }
          processingText = false;
        };
        
        // Create a container for the avatar
        const avatarContainer = document.createElement('div');
        avatarContainer.style.marginTop = '5px';  // Small space from top
        avatarContainer.style.marginBottom = '20px';  // More space between avatar and text
        
        // Add avatar
        const avatarImg = document.createElement('img');
        avatarImg.src = chrome.runtime.getURL('icons/avatar.jpg');
        avatarImg.style.width = '64px';
        avatarImg.style.height = '64px';
        avatarImg.style.display = 'block';
        avatarImg.style.margin = '0 auto';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.border = '2px solid white';
        avatarImg.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        
        // Add avatar to its container and container to main content
        avatarContainer.appendChild(avatarImg);
        contentContainer.appendChild(avatarContainer);
        
        // Create text container with proper spacing
        const textContainer = document.createElement('div');
        textContainer.style.marginTop = '20px';  // Space after avatar
        
        // Check if text contains Hebrew characters
        const hasHebrew = /[\u0590-\u05FF]/.test(result);
        if (hasHebrew) {
          textContainer.style.direction = 'rtl';
          textContainer.style.textAlign = 'right';
        }
        
        const mainText = result.split('---')[0].trim();
        textContainer.appendChild(document.createTextNode(mainText));
        contentContainer.appendChild(textContainer);
        
      } catch (error) {
        console.error('Error details:', error);
        if (error.name === 'AbortError') {
          console.log('Request was cancelled');
        } else {
          console.error('Error:', error);
          alert('Error processing text: ' + error.message);
        }
        processingText = false;
      }
    } catch (error) {
      if (currentResultDiv && currentResultDiv.parentNode) {
        document.body.removeChild(currentResultDiv);
        currentResultDiv = null;
      }
      alert('An unexpected error occurred. Please try again.');
    } finally {
      processingText = false;
    }
  };

  selectionMenu.appendChild(processButton);
  document.body.appendChild(selectionMenu);
});

// Remove menu when clicking outside
document.addEventListener('mousedown', (e) => {
  if (selectionMenu && !selectionMenu.contains(e.target)) {
    removeSelectionMenu();
  }
});

const showArticleBody = async () => {
  const scriptElement = document.querySelector('script[type="application/ld+json"]');
  const jsonData = JSON.parse(scriptElement.textContent);
  const articleBody = jsonData.articleBody;
  console.log(articleBody);
};

// Add this function at the top level of your content.js
async function checkYnetArticle() {
  const url = window.location.href;
  if (!url.includes('www.ynet.co.il/news/article/')) {
    return;
  }

  // Create container for icon and dialog
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 15px;
    right: 15px;
    z-index: 10001;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
  `;

  // Create the dialog first (so it appears below the icon)
  const opinionDialog = document.createElement('div');
  opinionDialog.style.cssText = `
    background: linear-gradient(135deg, #2196F3 0%, #64B5F6 100%);
    padding: 20px;
    border-radius: 20px;
    text-align: center;
    color: white;
    font-family: Arial, sans-serif;
    box-shadow: 0 4px 15px rgba(33, 150, 243, 0.3);
    animation: bubblePop 0.3s ease-out;
    min-width: 220px;
    margin-top: 60px;
    position: relative;
    right: 30px;
  `;

  // Add the icon with white circular background
  const iconWrapper = document.createElement('div');
  iconWrapper.style.cssText = `
    width: 64px;
    height: 64px;
    background: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    position: absolute;
    top: -30px;
    right: 20px;
    z-index: 10002;
    animation: bounceIn 0.5s ease-out;
    padding: 8px;
    overflow: hidden;
  `;

  const icon = document.createElement('img');
  const iconUrl = chrome.runtime.getURL('icons/icon48.png');
  icon.src = iconUrl;
  icon.style.cssText = `
    width: 48px;
    height: 48px;
    object-fit: contain;
    background: transparent;
    mix-blend-mode: multiply;
  `;

  // Add speech bubble triangle and content
  opinionDialog.innerHTML = `
    <div style="
      position: absolute;
      top: -15px;
      right: 40px;
      width: 30px;
      height: 15px;
      overflow: hidden;
    ">
      <div style="
        position: absolute;
        top: 7.5px;
        right: -7.5px;
        width: 15px;
        height: 15px;
        transform: rotate(45deg);
        background: linear-gradient(135deg, #2196F3 0%, #64B5F6 100%);
        box-shadow: 0 4px 15px rgba(33, 150, 243, 0.3);
      "></div>
    </div>
    <div style="margin-top: 10px;">
      <h2 style="margin: 0 0 20px 0; font-size: 20px;">Do you want my opinion?</h2>
      <div style="display: flex; gap: 15px; justify-content: center;">
        <button id="yesOpinion" style="
          padding: 10px 30px;
          background: white;
          color: #2196F3;
          border: none;
          border-radius: 25px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          transition: transform 0.2s;
        ">Yes</button>
        <button id="noOpinion" style="
          padding: 10px 30px;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: none;
          border-radius: 25px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          transition: transform 0.2s;
        ">No</button>
      </div>
    </div>
  `;

  // Add the animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bubblePop {
      0% {
        opacity: 0;
        transform: scale(0.8) translateY(10px);
      }
      50% {
        transform: scale(1.05) translateY(-5px);
      }
      100% {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    @keyframes bounceIn {
      0% {
        opacity: 0;
        transform: scale(0.3);
      }
      50% {
        transform: scale(1.1);
      }
      70% {
        transform: scale(0.9);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;
  document.head.appendChild(style);

  // Assemble the container
  iconWrapper.appendChild(icon);
  container.appendChild(opinionDialog);
  container.appendChild(iconWrapper);
  
  // Add to document and show
  document.body.appendChild(container);
  // Small delay to ensure smooth animation
  setTimeout(() => {
    container.style.opacity = '1';
  }, 100);

  // Add hover effect
  const buttons = opinionDialog.querySelectorAll('button');
  buttons.forEach(button => {
    button.addEventListener('mouseover', () => {
      button.style.transform = 'scale(1.05)';
    });
    button.addEventListener('mouseout', () => {
      button.style.transform = 'scale(1)';
    });
  });

  // Handle button clicks
  document.getElementById('yesOpinion').onclick = () => {
    document.body.removeChild(container);
    showArticleBody();
  };

  document.getElementById('noOpinion').onclick = () => {
    document.body.removeChild(container);
  };
}

// Ensure the page is fully loaded before checking
if (document.readyState === 'complete') {
  checkYnetArticle();
} else {
  window.addEventListener('load', checkYnetArticle);
}