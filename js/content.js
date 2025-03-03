let processingText = false;
let currentResultDiv = null;
let selectionMenu = null;
let popupDialog = null;
let thinkerActivated = false; // Flag to track if thinker is activated and avoid double opening


// Get the integration object
const { websites, getArticleBodyForUrl, isSupportedNewsSite } = window.WebsitesIntegration;

// Add this near the top of the file with other message listeners
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "activateThinker") {
    thinkerActivated = true;
    closeOpenDialog(); // Close any existing dialog first
    processArticle();
  }
});

async function isExtensionEnabled() {
  const result = await chrome.storage.local.get(['extension_enabled']);
  return result.extension_enabled !== false;
}

async function getApiKey() {
  const result = await chrome.storage.local.get(['gemini_api_key']);
  return result.gemini_api_key;
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
    closeButton.style.fontSize = '18px';
    closeButton.style.color = 'rgb(180, 205, 244)';
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

    // Add YouTube video
    const videoContainer = document.createElement('div');
    videoContainer.style.cssText = `
        margin: 10px 0;
        position: relative;
        padding-bottom: 56.25%; /* 16:9 Aspect Ratio */
        height: 0;
        overflow: hidden;
        max-width: 350px;
        margin: 0 auto;
    `;

    const videoIframe = document.createElement('iframe');
    videoIframe.src = 'https://www.youtube.com/embed/m9coOXt5nuw?autoplay=1&controls=0&showinfo=0&showtitle=0&showbyline=0&showbranding=0';
    videoIframe.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
        border-radius: 8px;
    `;
    videoIframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    videoIframe.allowFullscreen = true;
    videoIframe.autoplay = true;
    videoContainer.appendChild(videoIframe);
    contentContainer.appendChild(videoContainer);

    // Add loading bar
    const loadingBar = document.createElement('div');
    loadingBar.innerHTML = `
      <div class="loading-bar" style="
        width: 200px;
        height: 3px;
        background: #f0f0f0;
        border-radius: 3px;
        overflow: hidden;
        margin: 10px auto;
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
        'You are an expert in Israeli politics and geo-politics. You have an understanding of the history of the region and the current events. You know the different stand points of the different parties and politicians and other interests holders. Using all those, you are a critical thinking assistant, tasked with analyzing news articles for political bias and providing an objective assessment of the content. Your responsibilities include: \
      1. Critical Thinking Framework: Use established critical thinking guidelines such as identifying assumptions, evaluating evidence, detecting logical fallacies, and assessing the tone and language of the article. \
      2. Bias Detection: Analyze the article for signs of political bias, including word choice, framing of events, omission of facts, and one - sided reporting.\
      3. Comparative Analysis: Search the web for other reports of the same event and compare how different sources depict the event.Highlight differences in tone, emphasis, and omitted or included details.\
      4. Balanced Perspective: Provide a summary of the event that synthesizes the information from multiple sources, aiming for neutrality and balance.\
      5. Transparency: Clearly explain your reasoning and cite specific examples from the articles to support your analysis.Include links to the sources you reference.\
      If you cannot find a clear bias state it at the beginning of your answer.Do not make up a bias.Do not Tell the user to go and search other sources.Always remain neutral, avoid injecting personal opinions, and prioritize factual accuracy.Your goal is to help users develop a deeper understanding of media bias and improve their critical thinking skills.\
      You will answer in hebrew.You will answer in a brief, fluent manner of up to 2 paragraphs.You will try to be as intreseting to read as possible.The text you are processing is the following:'


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
      closeButton.style.fontSize = '18px';
      closeButton.style.color = 'rgb(180, 205, 244)';
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
          maskGradient = 'linear-gradient(to bottom, transparent 0%, black 0%, black 100%)';
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
        console.error('Thinker Error:', error);
        alert('Error processing text: ' + error.message);
      }
      processingText = false;
    }
  } catch (error) {
    if (currentResultDiv && currentResultDiv.parentNode) {
      document.body.removeChild(currentResultDiv);
      currentResultDiv = null;
    }
    console.error('Thinker Error:', error);
    alert('An unexpected error occurred. Please try again.');
  } finally {
    processingText = false;
    thinkerActivated = false; // Reset the flag when processing is complete
  }
}

async function processArticle() {
  const url = window.location.href;
  if (!isSupportedNewsSite(url)) {
    alert('This is not a supported news site or the article is not supported. Please go to a supported news site and try again.');
    return;
  }

  let articleBody = await getArticleBodyForUrl(url);
  if (!articleBody) {
    alert('Problem with getting the article body');
    return;
  }
  processWithLLM(articleBody);
}

async function popDialogAndProcess() {
  if (thinkerActivated) return;

  const isEnabled = await isExtensionEnabled();
  if (!isEnabled) return;

  const url = window.location.href;
  if (!isSupportedNewsSite(url)) {
    return;
  }


  // Create container for icon and dialog
  const container = document.createElement('div');
  // Save the container to the popupDialog variable for global use
  popupDialog = container;
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

    let articleBody = await getArticleBodyForUrl(url);
    if (!articleBody) {
      alert('Problem with getting the article body');
      return;
    }
    processWithLLM(articleBody);
  };


  document.getElementById('noOpinion').onclick = () => {
    document.body.removeChild(container);
  };
}

// Function to close any open dialog
function closeOpenDialog() {
  if (popupDialog && popupDialog.parentNode) {
    popupDialog.parentNode.removeChild(popupDialog);
  }
}

function closeCurrentResultDiv() {
  if (currentResultDiv && currentResultDiv.parentNode) {
    currentResultDiv.parentNode.removeChild(currentResultDiv);
  }
}

// Function to handle URL changes
function handleUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    closeOpenDialog();
    closeCurrentResultDiv();
    setTimeout(popDialogAndProcess, 1000); // Small delay to ensure content has updated
  }
}

// Track URL changes
let lastUrl = window.location.href;

// Create URL change observer
const urlObserver = new MutationObserver(() => {
  handleUrlChange();
});

// Start observing the document with the configured parameters
urlObserver.observe(document, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true
});

// Handle traditional navigation events
window.addEventListener('popstate', handleUrlChange);
window.addEventListener('hashchange', handleUrlChange);
window.addEventListener('pushState', handleUrlChange);
window.addEventListener('replaceState', handleUrlChange);

// Monitor History API changes
const originalPushState = history.pushState;
history.pushState = function () {
  originalPushState.apply(this, arguments);
  handleUrlChange();
};

const originalReplaceState = history.replaceState;
history.replaceState = function () {
  originalReplaceState.apply(this, arguments);
  handleUrlChange();
};

// Initial check
if (document.readyState === 'complete') {
  popDialogAndProcess();
} else {
  window.addEventListener('load', popDialogAndProcess);
}
