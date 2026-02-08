import { Controller } from './Controller.js';

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

    const controller = new Controller(window.myGrooveWriter);
    window.coachController = controller;

    await controller.init();

    // Add a toggle button to the UI
    addCoachToggleButton();

    // Auto-start coach mode if Mode=coach in URL
    const mode = window.myGrooveWriter.myGrooveUtils.getQueryVariableFromURL('Mode', '');
    if (mode === 'coach') {
        console.log('[Drum Coach] Mode=coach detected, auto-starting session');
        try {
            controller.startSession({ autoPlay: false });
        } catch (e) {
            console.error('[Drum Coach] Auto-start failed:', e);
        }
    }

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
    btn.innerHTML = '<i class="fa fa-graduation-cap"></i> Coach';

    btn.onclick = () => {
        const controller = window.coachController;
        if (!controller || controller.isCoachingActive) return; // disabled during coaching
        controller.dialog.show();
    };

    topNav.insertBefore(btn, topNav.firstChild);
    console.log('[Drum Coach] Button injected into UI');
}

// Inject CSS
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'coach/css/coach.css';
document.head.appendChild(link);

// Start
bootstrap();
