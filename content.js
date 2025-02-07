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

async function processWithLLM(selectedText) {
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
      padding: 25px;
      background: linear-gradient(135deg,rgb(16, 55, 95), #3498db);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      z-index: 10000;
      max-width: 400px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.8;
      letter-spacing: 0.3px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
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
        // Add padding for scrollbar on right side
        textContainer.style.paddingRight = '12px';
        textContainer.style.paddingLeft = '0';
      } else {
        // Keep padding for scrollbar on right side
        textContainer.style.paddingRight = '12px';
        textContainer.style.paddingLeft = '0';
      }

      const mainText = result.split('---')[0].trim();
      textContainer.appendChild(document.createTextNode(mainText));
      textContainer.style.overflowY = 'auto';
      textContainer.style.maxHeight = '300px';
      textContainer.style.cssText += `
        /* Webkit browsers (Chrome, Safari) */
        &::-webkit-scrollbar {
          width: 8px;
          background: transparent;
        }
        
        &::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
          transition: background 0.2s;
        }
        
        &::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        
        /* Firefox */
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
      `;

      // Add hover effect for Firefox
      textContainer.addEventListener('mouseenter', () => {
        textContainer.style.scrollbarColor = 'rgba(255, 255, 255, 0.5) transparent';
      });

      textContainer.addEventListener('mouseleave', () => {
        textContainer.style.scrollbarColor = 'rgba(255, 255, 255, 0.3) transparent';
      });

      // Add scroll event listener to adjust mask based on scroll position
      textContainer.addEventListener('scroll', () => {
        const scrollTop = textContainer.scrollTop;
        const isAtTop = scrollTop === 0;
        const isAtBottom = textContainer.scrollHeight - textContainer.scrollTop === textContainer.clientHeight;

        // Adjust mask based on scroll position
        let maskGradient;
        if (isAtTop && isAtBottom) {
          // No fades if content fits without scrolling
          maskGradient = 'linear-gradient(to bottom, black 0%, black 100%)';
        } else if (isAtTop) {
          // Only bottom fade when at top
          maskGradient = 'linear-gradient(to bottom, black 0%, black 95%, transparent 100%)';
        } else if (isAtBottom) {
          // Only top fade when at bottom
          maskGradient = 'linear-gradient(to bottom, transparent 0%, black 5%, black 100%)';
        } else {
          // Both fades when in middle
          maskGradient = 'linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)';
        }

        textContainer.style.mask = maskGradient;
      });

      contentContainer.appendChild(textContainer);

      // Create font size controls container
      const fontControls = document.createElement('div');
      fontControls.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 15px;
      `;

      // Create font size buttons
      const createFontButton = (text, action) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: none;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          transition: background 0.2s;
        `;

        button.addEventListener('mouseover', () => {
          button.style.background = 'rgba(255, 255, 255, 0.3)';
        });

        button.addEventListener('mouseout', () => {
          button.style.background = 'rgba(255, 255, 255, 0.2)';
        });

        button.onclick = () => {
          const currentSize = parseInt(window.getComputedStyle(textContainer).fontSize);
          const newSize = action === 'increase' ? currentSize + 2 : currentSize - 2;
          textContainer.style.fontSize = `${newSize}px`;
        };

        return button;
      };

      const decreaseButton = createFontButton('−', 'decrease');
      const increaseButton = createFontButton('+', 'increase');

      fontControls.appendChild(decreaseButton);
      fontControls.appendChild(increaseButton);
      contentContainer.appendChild(fontControls);

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

    processingText = true;

    await processWithLLM(selectedText);
    processingText = false;
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

const getYnetArticleBody = async () => {
  const scriptElement = document.querySelector('script[type="application/ld+json"]');
  const jsonData = JSON.parse(scriptElement.textContent);
  const articleBody = jsonData.articleBody;
  return articleBody
};

const getN12ArticleBody = async () => {
  const articleBody = document.querySelector('section.article-body');
  const paragraphElements = articleBody.querySelectorAll('p');
  const paragraphElementsArray = Array.from(paragraphElements);
  const paragraphsToProcess = paragraphElementsArray.slice(0, -1);
  const paragraphTexts = paragraphsToProcess.map(p => p.textContent.trim());
  const jointText = paragraphTexts.join(' ');
  return jointText;
};

const getChannel14ArticleBody = async () => {
  const articleContent = document.querySelector('.ArticleContent_articleContent__AdZEJ.false');
  let joinedText = "";
  const paragraphs = articleContent.querySelectorAll('p');
  const paragraphTexts = Array.from(paragraphs).map(p => p.textContent.trim());
  joinedText = paragraphTexts.join(' ');
  return joinedText;
};

// Add this function at the top level of your content.js

async function checkNewsArticle() {
  const url = window.location.href;
  if (!url.includes('www.ynet.co.il/news/article/') && !url.includes('www.mako.co.il/news') && !url.includes('www.now14.co.il/article')) {
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
    background: linear-gradient(135deg,rgb(16, 55, 95), #3498db);
    padding: 25px;
    border-radius: 12px;
    text-align: center;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.8;
    letter-spacing: 0.3px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
    animation: bubblePop 0.3s ease-out;
    min-width: 220px;
    margin-top: 60px;
    position: relative;
    right: 20px;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    direction: ltr;
  `;

  // Add the icon with white circular background
  const iconWrapper = document.createElement('div');
  iconWrapper.style.cssText = `
    width: 64px;
    height: 64px;
    // background: radial-gradient(circle,rgb(175, 175, 175),rgba(228, 228, 228, 0.56)); /* Circular gradient */
    // border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    position: absolute;
    top: -10px;
    right: 60px;
    z-index: 10002;
    animation: bounceIn 0.5s ease-out;
    padding: 2spx;
    overflow: hidden;
  `;

  const icon = document.createElement('img');
  const iconUrl = chrome.runtime.getURL('icons/icon48.png');
  icon.src = iconUrl;
  icon.style.cssText = `
    width: 48px;
    height: 48px;
    object-fit: contain;
    // background: radial-gradient(circle,rgb(175, 175, 175),rgba(228, 228, 228, 0.56)); /* Circular gradient */
    mix-blend-mode: multiply;
  `;

  // Add speech bubble triangle and content
  opinionDialog.innerHTML = `
    <div style="
      position: absolute;
      top: -15px;
      right: 80px;
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
        background: linear-gradient(135deg,rgb(16, 55, 95), #3498db);
        outline: none !important;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
      "></div>
    </div>
    <style>
      @keyframes shine {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      @keyframes glow {
        0% { box-shadow: 0 0 5px rgba(74, 157, 225, 0.5); }
        50% { box-shadow: 0 0 20px rgba(74, 155, 222, 0.8); }
        100% { box-shadow: 0 0 5px rgba(59, 142, 210, 0.5); }
      }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
      @keyframes wave {
        0% { transform: translateX(0); }
        50% { transform: translateX(5px); }
        100% { transform: translateX(0); }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }
      #yesOpinion {
        transition: all 0.3s ease;
        background: linear-gradient(90deg,rgb(137, 195, 242) 0%,rgb(96, 176, 242) 50%,rgb(86, 172, 243) 50%,rgb(75, 169, 246) 100%);
        background-size: 200% 100%;
        color: white;
      }
      #yesOpinion:hover {
        animation: shine 3s infinite linear, pulse 2s infinite ease-in-out, glow 2s infinite ease-in-out; /* Multiple animations */
      }
      #noOpinion {
        transition: all 0.45s ease;
      }
      #noOpinion:hover {
        background: rgba(53, 51, 51, 0.4);
      }
    </style>
    <div style="margin-top: 10px;">
      <h2 style="margin: 0 0 20px 0; font-size: 20px;">Do you want my opinion?</h2>
      <div style="display: flex; gap: 15px; justify-content: center; direction: ltr;">
        <button id="yesOpinion" style="
          padding: 10px 30px;
          border: none;
          border-radius: 25px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
          color: white;
        ">Yes</button>
        <button id="noOpinion" style="
          padding: 10px 30px;
          background: rgba(255, 255, 255, 0.28);
          color: white;
          border: none;
          border-radius: 25px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
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
  document.getElementById('yesOpinion').onclick = async () => {
    document.body.removeChild(container);
    if (url.includes('www.ynet.co.il/news/article/')) {
      const ynetArticleBody = await getYnetArticleBody();
      processWithLLM(ynetArticleBody);
    } else if (url.includes('www.mako.co.il/news')) {
      const n12ArticleBody = await getN12ArticleBody();
      processWithLLM(n12ArticleBody);
    } else if (url.includes('www.now14.co.il/article')) {
      const channel14ArticleBody = await getChannel14ArticleBody();
      processWithLLM(channel14ArticleBody);
    } else {
      alert('This is not a news article');
    }
  };


  document.getElementById('noOpinion').onclick = () => {
    document.body.removeChild(container);
  };
}

// Ensure the page is fully loaded before checking
if (document.readyState === 'complete') {
  checkNewsArticle();
} else {
  window.addEventListener('load', checkNewsArticle);
}