let monitoring = false;
let port = null;
const MAX_COURSES = 4;

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const addCourseBtn = document.getElementById('addCourseBtn');
  const courseCounter = document.querySelector('.course-counter');
  const refreshInput = document.getElementById('refreshInterval');
  const statusSpan = document.getElementById('monitorStatus');
  const lastCheckedSpan = document.getElementById('lastChecked');
  const errorSpan = document.getElementById('generalError');
  const activityLog = document.getElementById('activityLog');
  const courseEntries = document.getElementById('courseEntries');

  // Connect to background script
  port = chrome.runtime.connect({ name: 'popup' });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'status':
        updateStatus(msg.data);
        break;
      case 'seat_found':
        handleSeatFound(msg.data);
        break;
      case 'error':
        showError(msg.error);
        break;
    }
  });

  // Set up the Add Course button
  addCourseBtn.addEventListener('click', () => {
    const currentCount = document.querySelectorAll('.course-entry').length;
    
    if (currentCount < MAX_COURSES) {
      addCourseEntry();
      updateCourseCounter();
    }
    
    // Disable add button if max is reached
    if (currentCount + 1 >= MAX_COURSES) {
      addCourseBtn.disabled = true;
    }
  });

  // Initial setup for course removal buttons
  setupCourseRemovalButtons();

  startBtn.addEventListener('click', () => {
    const courseConfigs = collectCourseData();
    const refreshInterval = parseInt(refreshInput.value);

    if (!validateInput(courseConfigs, refreshInterval)) {
      return;
    }

    monitoring = true;
    updateUI();
    
    // Log which courses are being monitored
    const courseList = courseConfigs.map(course => {
      const sectionText = course.sections.length > 0 ? 
        `Sections ${course.sections.join(', ')}` : 
        'All sections';
      return `${course.courseCode} (${sectionText})`;
    }).join(', ');
    
    addToLog(`Started monitoring: ${courseList} (refreshing every ${refreshInterval} seconds)`);

    port.postMessage({
      type: 'start_monitoring',
      data: {
        courses: courseConfigs,
        refreshInterval
      }
    });
  });

  stopBtn.addEventListener('click', () => {
    monitoring = false;
    updateUI();
    addToLog(`Stopped monitoring`);
    port.postMessage({ type: 'stop_monitoring' });
  });

  function collectCourseData() {
    const courseEntries = document.querySelectorAll('.course-entry');
    const coursesData = [];

    courseEntries.forEach(entry => {
      const courseInput = entry.querySelector('.course-code');
      const sectionsInput = entry.querySelector('.section-numbers');
      
      const courseCode = courseInput.value.trim().toUpperCase();
      const sectionText = sectionsInput.value.trim();
      
      // Parse sections - if empty, it means "all sections"
      const sections = sectionText ? 
        sectionText.split(',').map(s => s.trim()).filter(s => s) : 
        [];
      
      if (courseCode) {
        coursesData.push({
          courseCode,
          sections
        });
      }
    });

    return coursesData;
  }

  function validateInput(courseConfigs, refreshInterval) {
    errorSpan.textContent = '';
    
    // Check if there are any valid courses
    if (courseConfigs.length === 0) {
      errorSpan.textContent = 'Please enter at least one course code';
      return false;
    }
    
    // Check refresh interval
    if (!refreshInterval || refreshInterval < 3) {
      errorSpan.textContent = 'Minimum refresh interval is 3 seconds';
      return false;
    }
    
    return true;
  }

  function updateUI() {
    startBtn.disabled = monitoring;
    stopBtn.disabled = !monitoring;
    addCourseBtn.disabled = monitoring || document.querySelectorAll('.course-entry').length >= MAX_COURSES;
    refreshInput.disabled = monitoring;
    
    // Disable all course inputs during monitoring
    document.querySelectorAll('.course-code, .section-numbers').forEach(input => {
      input.disabled = monitoring;
    });
    
    // Hide remove buttons during monitoring
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.style.display = monitoring ? 'none' : 'flex';
    });

    statusSpan.textContent = monitoring ? 'Monitoring' : 'Not monitoring';
  }

  function updateStatus(status) {
    lastCheckedSpan.textContent = new Date().toLocaleTimeString();
    
    // Add each section's status to the log
    if (status.message) {
      // If it's a single course message
      const sections = status.message.split('\n');
      sections.forEach(section => {
        if (section.trim()) {
          addToLog(`${status.courseCode} - ${section}`);
        }
      });
    } else if (status.courseStatuses) {
      // If it's multiple course statuses
      status.courseStatuses.forEach(courseStatus => {
        const sections = courseStatus.message.split('\n');
        sections.forEach(section => {
          if (section.trim()) {
            addToLog(`${courseStatus.courseCode} - ${section}`);
          }
        });
      });
    }
  }

  function handleSeatFound(data) {
    if (data.availableSections && data.availableSections.length > 0) {
      data.availableSections.forEach(sectionInfo => {
        // Construct notification message
        const sectionMessage = `Seat found for ${data.courseCode} Section ${sectionInfo.section}! ${sectionInfo.availableSeats} seats available`;
        addToLog(sectionMessage, true);
        
        // Create notification with section info
        new Notification('Seat Available!', {
          body: `${data.courseCode} Section ${sectionInfo.section}: ${sectionInfo.availableSeats} seats available`,
          icon: 'icons/icon128.png'
        });
      });
    } else {
      // Fallback if section information is not available
      addToLog(`Seat found for ${data.courseCode}!`, true);
      new Notification('Seat Available!', {
        body: `A seat is available for ${data.courseCode}`,
        icon: 'icons/icon128.png'
      });
    }
  }

  function showError(error) {
    errorSpan.textContent = error;
    addToLog(`Error: ${error}`);
  }

  function addToLog(message, important = false) {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    if (important) {
      li.style.color = '#2563eb';
      li.style.fontWeight = 'bold';
    }
    activityLog.insertBefore(li, activityLog.firstChild);

    // Keep only last 50 entries
    while (activityLog.children.length > 50) {
      activityLog.removeChild(activityLog.lastChild);
    }
  }

  function addCourseEntry() {
    const newEntry = document.createElement('div');
    newEntry.className = 'course-entry';
    newEntry.innerHTML = `
      <div class="close-btn">×</div>
      <div class="input-row">
        <div class="input-group">
          <input type="text" class="course-code" placeholder="Course Code">
        </div>
        <div class="input-group">
          <input type="text" class="section-numbers" placeholder="Sections (e.g. 1,2,3)">
        </div>
      </div>
    `;
    courseEntries.appendChild(newEntry);
    
    // Add event listener to the new close button
    const closeBtn = newEntry.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
      courseEntries.removeChild(newEntry);
      updateCourseCounter();
      
      // Re-enable add button if we're below max
      if (document.querySelectorAll('.course-entry').length < MAX_COURSES) {
        addCourseBtn.disabled = false;
      }
    });
  }

  function setupCourseRemovalButtons() {
    const courseEntries = document.querySelectorAll('.course-entry');
    
    // First course's close button should be hidden
    if (courseEntries.length > 0) {
      const firstCloseBtn = courseEntries[0].querySelector('.close-btn');
      if (firstCloseBtn) {
        firstCloseBtn.style.display = 'none';
      }
    }
    
    // Set up event listeners for all close buttons
    courseEntries.forEach((entry, index) => {
      const closeBtn = entry.querySelector('.close-btn');
      if (closeBtn) {
        if (index === 0) {
          closeBtn.style.display = 'none'; // Hide the first course's close button
        }
        
        closeBtn.addEventListener('click', () => {
          entry.parentNode.removeChild(entry);
          updateCourseCounter();
          
          // Re-enable add button if we're below max
          if (document.querySelectorAll('.course-entry').length < MAX_COURSES) {
            addCourseBtn.disabled = false;
          }
        });
      }
    });
  }

  function updateCourseCounter() {
    const currentCount = document.querySelectorAll('.course-entry').length;
    courseCounter.textContent = `${currentCount}/${MAX_COURSES} Courses`;
    
    // Disable add button if max is reached
    addCourseBtn.disabled = monitoring || currentCount >= MAX_COURSES;
  }

  // Initialize course counter and update UI
  updateCourseCounter();
  
  // If we already have 4 courses, disable the add button
  if (document.querySelectorAll('.course-entry').length >= MAX_COURSES) {
    addCourseBtn.disabled = true;
  }
});