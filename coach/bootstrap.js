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
    const topNav = document.getElementById('upperRight');
    if (!topNav) return;

    const btn = document.createElement('span');
    btn.className = 'rightButtons';
    btn.id = 'coachToggleBtn';
    btn.innerHTML = '<i class="fa fa-graduation-cap"></i> Coach';
    btn.onclick = () => {
        const controller = window.coachController;
        if (controller.isCoachingActive) {
            // Stop the session
            controller.stopSession();
            // Also stop playback
            if (controller.grooveWriter.myGrooveUtils.isPlaying()) {
                controller.grooveWriter.myGrooveUtils.startOrPauseMIDI_playback();
            }
        } else {
            // Show settings dialog
            controller.dialog.show();
        }
    };

    topNav.insertBefore(btn, topNav.firstChild);
}

// Inject CSS
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'css/coach.css';
document.head.appendChild(link);

// Start
bootstrap();
