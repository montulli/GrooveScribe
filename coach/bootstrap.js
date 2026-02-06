import { CoachController } from './CoachController.js';

/**
 * Bootstraps the Drum Coach and attaches it to the global window object
 */
async function bootstrap() {
    console.log('[Drum Coach] Bootstrapping...');

    // Wait for myGrooveWriter to be available
    if (!window.myGrooveWriter) {
        console.warn('[Drum Coach] myGrooveWriter not found, waiting...');
        setTimeout(bootstrap, 500);
        return;
    }

    const controller = new CoachController(window.myGrooveWriter);
    window.coachController = controller;

    await controller.init();

    // Add a toggle button to the UI
    addCoachToggleButton();

    console.log('[Drum Coach] Ready');
}

function addCoachToggleButton() {
    // Try multiple possible containers if upperRight is missing or cleared
    const topNav = document.getElementById('upperRight') || document.getElementById('TopNav');
    if (!topNav) {
        console.warn('[Drum Coach] Navigation container not found, retrying button injection...');
        setTimeout(addCoachToggleButton, 1000);
        return;
    }

    if (document.getElementById('coachToggleBtn')) return; // Already added

    const btn = document.createElement('span');
    btn.className = 'rightButtons';
    btn.id = 'coachToggleBtn';
    btn.style.cursor = 'pointer';
    btn.style.marginLeft = '10px';
    btn.style.color = '#00BFFF'; // Bright blue to make it visible
    btn.innerHTML = '<i class="fa fa-graduation-cap"></i> Coach';

    btn.onclick = () => {
        const controller = window.coachController;
        if (!controller) return;

        if (controller.isCoachingActive) {
            controller.stopSession();
            if (controller.grooveWriter.myGrooveUtils.isPlaying()) {
                controller.grooveWriter.myGrooveUtils.startOrPauseMIDI_playback();
            }
        } else {
            controller.dialog.show();
        }
    };

    topNav.insertBefore(btn, topNav.firstChild);
    console.log('[Drum Coach] Button injected into UI');
}

// Inject CSS
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'css/coach.css';
document.head.appendChild(link);

// Start
bootstrap();
