// pwa-manager.js
// Handles PWA Installation flow and iOS onboarding

let deferredPrompt;

export function initPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        
        // Check if user has already dismissed the prompt in this session
        if (sessionStorage.getItem('pwa_prompt_dismissed')) return;

        showInstallBanner();
    });

    window.addEventListener('appinstalled', (evt) => {
        console.log('App was installed');
        hideInstallBanner();
    });

    // iOS Detection
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (isIos && !isStandalone) {
        if (!sessionStorage.getItem('ios_prompt_dismissed')) {
            showIosOnboarding();
        }
    }

    // Auto-reload on SW update
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('Service Worker updated, reloading...');
            window.location.reload();
        });
    }
}

function showInstallBanner() {
    let banner = document.getElementById('pwa-install-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.className = 'pwa-banner';
        banner.innerHTML = `
            <div class="pwa-content">
                <div class="pwa-text">
                    <strong>התקן את האפליקציה</strong>
                    <span>לחוויה מהירה ונוחה יותר, כולל עבודה לא מקוונת</span>
                </div>
                <div class="pwa-actions">
                    <button id="pwa-install-btn" class="primary">התקן</button>
                    <button id="pwa-close-btn">סגור</button>
                </div>
            </div>
        `;
        document.body.appendChild(banner);

        document.getElementById('pwa-install-btn').addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                deferredPrompt = null;
                hideInstallBanner();
            }
        });

        document.getElementById('pwa-close-btn').addEventListener('click', () => {
            hideInstallBanner();
            sessionStorage.setItem('pwa_prompt_dismissed', 'true');
        });
    }
}

function hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.add('hidden');
}

function showIosOnboarding() {
    let modal = document.getElementById('ios-onboarding-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ios-onboarding-modal';
        modal.className = 'ios-modal';
        modal.innerHTML = `
            <div class="ios-content">
                <h3>התקנת אפליקציה ב-iOS</h3>
                <p>כדי להתקין את האפליקציה ב-iPhone:</p>
                <ol>
                    <li>לחץ על כפתור <strong>שתף</strong> (הריבוע עם החץ למעלה)</li>
                    <li>גלול מטה ובחר <strong>הוסף למסך הבית</strong></li>
                </ol>
                <button id="ios-close-btn" class="primary">הבנתי</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('ios-close-btn').addEventListener('click', () => {
            modal.classList.add('hidden');
            sessionStorage.setItem('ios_prompt_dismissed', 'true');
        });
    }
}
