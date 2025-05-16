// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ping') {
        // Respond to ping to verify content script is loaded
        sendResponse({ status: 'ok' });
        return true;
    }

    if (request.type === 'check_availability') {
        const result = checkCourseAvailability(request.courseCode, request.sections);
        sendResponse(result);
    }
    return true;
});

function checkCourseAvailability(courseCode, sectionsToCheck = []) {
    try {
        // Find the course table
        const table = findCourseTable();
        if (!table) {
            return {
                seatFound: false,
                message: 'Course table not found on page',
                availableSections: []
            };
        }

        // Find course sections - filter by section numbers if provided
        const sections = findCourseSections(table, courseCode, sectionsToCheck);
        if (sections.length === 0) {
            let notFoundMessage;
            if (sectionsToCheck && sectionsToCheck.length > 0) {
                notFoundMessage = `Course ${courseCode} (Sections ${sectionsToCheck.join(', ')}) not found`;
            } else {
                notFoundMessage = `Course ${courseCode} not found in table`;
            }
            
            return {
                seatFound: false,
                message: notFoundMessage,
                availableSections: []
            };
        }

        // Check availability for all sections
        const sectionStatuses = sections.map(section => {
            const seatStatus = checkSeatStatus(section.row);
            return {
                section: section.sectionNumber,
                ...seatStatus
            };
        });

        // Check if any section has available seats
        const availableSections = sectionStatuses.filter(status => status.available);
        const seatFound = availableSections.length > 0;

        // Create detailed message
        const message = sectionStatuses
            .map(status => `Section ${status.section}: ${status.message}`)
            .join('\n');

        return {
            seatFound,
            message,
            availableSections // Return the available sections data
        };
    } catch (error) {
        console.error('Availability check error:', error);
        return {
            seatFound: false,
            message: 'Error checking availability',
            availableSections: []
        };
    }
}

function findCourseTable() {
    // Look for table with specific ID
    const table = document.getElementById('courseList');
    if (!table) {
        console.warn('Course table not found');
        return null;
    }
    return table;
}

function findCourseSections(table, searchedCourse, sectionsToCheck = []) {
    const sections = [];
    const rows = table.querySelectorAll('tr');

    // Convert section numbers to strings for comparison
    const sectionFilters = sectionsToCheck.map(s => String(s).trim());

    for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 1) {
            // Get the course code and section from first column
            const courseCell = cells[0].textContent.trim();
            const [courseCode, sectionNumber] = courseCell.split('.');

            // Check if this is the course we're looking for
            if (courseCode === searchedCourse) {
                const section = sectionNumber || '1'; // Default to section 1 if no section number
                
                // If sections filter is empty, include all sections
                // Otherwise, only include matching sections
                if (sectionFilters.length === 0 || sectionFilters.includes(section)) {
                    sections.push({
                        row,
                        sectionNumber: section
                    });
                }
            }
        }
    }

    return sections;
}

function checkSeatStatus(row) {
    const cells = row.querySelectorAll('td');

    if (cells.length >= 2) {
        const enrollmentCell = cells[1].textContent.trim();
        const match = enrollmentCell.match(/(\d+)\((\d+)\)/);

        if (match) {
            const enrolled = parseInt(match[1]);
            const totalSeats = parseInt(match[2]);
            const availableSeats = totalSeats - enrolled;

            return {
                available: availableSeats > 0,
                message: availableSeats > 0 ?
                    `${availableSeats} seats available (${enrolled}/${totalSeats})` :
                    `Course is full (${enrolled}/${totalSeats})`,
                availableSeats  // Add available seats count
            };
        }
    }

    return {
        available: false,
        message: 'Unable to determine seat availability',
        availableSeats: 0
    };
}