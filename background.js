// تتبع تثبيت الامتداد
self.addEventListener('install', (event) => {
    console.log('تم تثبيت Google Maps Data Scraper');
    event.waitUntil(
        Promise.all([
            self.skipWaiting(),
            chrome.storage.local.set({
                lastExtraction: null,
                totalExtractions: 0
            })
        ]).then(() => {
            console.log('تم تهيئة الإعدادات الافتراضية');
        })
    );
});

// معالجة تنشيط Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            new Promise((resolve) => {
                console.log('تم تنشيط Service Worker');
                resolve();
            })
        ])
    );
});

// معالجة الرسائل من content script و popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('تم استلام رسالة في background:', message);

    // إنشاء نسخة من الرسالة لتجنب مشاكل التزامن
    const messageClone = JSON.parse(JSON.stringify(message));

    if (messageClone.action === 'updateProgress') {
        console.log(`تحديث التقدم: ${messageClone.current}/${messageClone.total}`);
        chrome.runtime.sendMessage(messageClone);
    }
    
    else if (messageClone.action === 'extractionComplete') {
        console.log('اكتمل الاستخراج:', messageClone.data);
        chrome.storage.local.get(['totalExtractions'], (result) => {
            chrome.storage.local.set({
                lastExtraction: new Date().toISOString(),
                totalExtractions: (result.totalExtractions || 0) + 1
            });
        });
        chrome.runtime.sendMessage(messageClone);
    }
    
    else if (messageClone.action === 'extractionError') {
        console.error('خطأ في الاستخراج:', messageClone.error);
        chrome.runtime.sendMessage(messageClone);
    }

    // إرجاع true للإشارة إلى أن الرد سيتم بشكل غير متزامن
    return true;
}); 