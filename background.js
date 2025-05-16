let monitoringInterval = null;
let currentTab = null;
let activePort = null;
let coursesToMonitor = [];

chrome.runtime.onConnect.addListener((port) => {
  activePort = port;

  port.onMessage.addListener(async (msg) => {
    switch (msg.type) {
      case 'start_monitoring':
        await startMonitoring(msg.data);
        break;
      case 'stop_monitoring':
        stopMonitoring();
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    activePort = null;
    stopMonitoring();
  });
});

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });

    // Wait for content script to be ready
    let retries = 0;
    while (retries < 5) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'ping' });
        return true; // Content script is ready
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
    }
    throw new Error('Content script not responding after multiple attempts');
  } catch (error) {
    console.error('Content script injection error:', error);
    throw new Error('Failed to initialize content script. Please refresh the page and try again.');
  }
}

async function startMonitoring({ courses, refreshInterval }) {
  stopMonitoring();
  coursesToMonitor = courses || [];

  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }
    currentTab = tab;

    // Ensure content script is injected and ready
    await injectContentScript(currentTab.id);

    // Start monitoring interval
    monitoringInterval = setInterval(async () => {
      if (!currentTab || coursesToMonitor.length === 0) {
        stopMonitoring();
        return;
      }

      try {
        // Refresh the page
        await chrome.tabs.reload(currentTab.id);

        // Wait for page load and check availability
        setTimeout(async () => {
          try {
            // Re-inject content script after page reload
            await injectContentScript(currentTab.id);

            // Check each course
            const courseStatuses = [];
            let foundSeats = false;

            for (const course of coursesToMonitor) {
              const result = await chrome.tabs.sendMessage(currentTab.id, {
                type: 'check_availability',
                courseCode: course.courseCode,
                sections: course.sections
              });

              courseStatuses.push({
                courseCode: course.courseCode,
                message: result.message
              });

              if (result.seatFound) {
                foundSeats = true;
                // Send notification for this course
                handleSeatFound(course.courseCode, result.availableSections);
              }
            }
            
            // Send consolidated status update
            sendStatus({
              courseStatuses
            });
            
          } catch (error) {
            console.error('Check availability error:', error);
            sendError('Failed to check availability. Please refresh the page and try again.');
          }
        }, 2000);
      } catch (error) {
        console.error('Page refresh error:', error);
        sendError('Failed to refresh the page. Please check your connection.');
        stopMonitoring();
      }
    }, refreshInterval * 1000);

  } catch (error) {
    console.error('Start monitoring error:', error);
    sendError(error.message || 'Failed to start monitoring. Please try again.');
    stopMonitoring();
  }
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  coursesToMonitor = [];
}

function handleSeatFound(courseCode, availableSections) {
  if (activePort) {
    activePort.postMessage({
      type: 'seat_found',
      data: { 
        courseCode,
        availableSections
      }
    });
  }
}

function sendStatus(status) {
  if (activePort) {
    activePort.postMessage({
      type: 'status',
      data: status
    });
  }
}

function sendError(error) {
  if (activePort) {
    activePort.postMessage({
      type: 'error',
      error
    });
  }
}