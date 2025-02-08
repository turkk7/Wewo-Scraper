document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const progressBar = document.querySelector('.progress');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const currentStage = document.getElementById('currentStage');
    const stageDetails = document.getElementById('stageDetails');
    const statusDiv = document.getElementById('status');
    let extractedData = [];
    let isExtracting = false;

    const STAGES = {
        'processing_item': 'معالجة العنصر',
        'cached_item': 'استخدام البيانات المخزنة',
        'clicking_item': 'فتح تفاصيل العنصر',
        'extracting_details': 'استخراج البيانات',
        'saving_data': 'حفظ البيانات'
    };

    function showStatus(message, type = '') {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;
    }

    function updateProgressUI(progress) {
        if (progress.stage) {
            currentStage.textContent = STAGES[progress.stage] || progress.stage;
            stageDetails.textContent = progress.details || '';
            document.querySelector('.progress-details').classList.add('active');
        }
        
        const percentage = (progress.current / progress.total) * 100;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${progress.current} / ${progress.total}`;
    }

    function resetUI() {
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        progressBar.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = '0 / 0';
        currentStage.textContent = '-';
        stageDetails.textContent = '-';
        document.querySelector('.progress-details').classList.remove('active');
        isExtracting = false;
    }

    function downloadData(format) {
        if (extractedData.length === 0) {
            showStatus('لا توجد بيانات للتحميل', 'error');
            return;
        }

        try {
            let content, mimeType, extension;

            switch (format) {
                case 'json':
                    content = JSON.stringify(extractedData, null, 2);
                    mimeType = 'application/json';
                    extension = 'json';
                    break;

                case 'excel':
                    // تحويل البيانات إلى تنسيق Excel (CSV مع BOM للدعم العربي)
                    content = '\ufeff' + convertToCSV(extractedData);
                    mimeType = 'application/vnd.ms-excel';
                    extension = 'xls';
                    break;

                default: // csv
                    content = convertToCSV(extractedData);
                    mimeType = 'text/csv';
                    extension = 'csv';
                    break;
            }

            const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
            const url = URL.createObjectURL(blob);
            
            chrome.downloads.download({
                url: url,
                filename: `google_maps_data_${new Date().toISOString().split('T')[0]}.${extension}`
            });

            showStatus('تم بدء تحميل الملف', 'success');
        } catch (error) {
            console.error('Error downloading file:', error);
            showStatus('حدث خطأ أثناء تحميل الملف', 'error');
        }
    }

    function convertToCSV(data) {
        if (data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const rows = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    let cell = row[header] || '';
                    // معالجة خاصة للخلايا التي تحتوي على فواصل أو أسطر جديدة
                    if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
                        cell = `"${cell.replace(/"/g, '""')}"`;
                    }
                    return cell;
                }).join(',')
            )
        ];
        
        return rows.join('\n');
    }

    startBtn.addEventListener('click', async () => {
        const config = {
            limit: parseInt(document.getElementById('limit').value),
            fields: {
                name: document.getElementById('name').checked,
                address: document.getElementById('address').checked,
                phone: document.getElementById('phone').checked,
                email: document.getElementById('email').checked,
                website: document.getElementById('website').checked,
                rating: document.getElementById('rating').checked,
                reviews: document.getElementById('reviews').checked
            }
        };

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('google.com/maps')) {
                showStatus('الرجاء الانتقال إلى صفحة خرائط Google أولاً', 'error');
                return;
            }

            isExtracting = true;
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            downloadBtn.disabled = true;
            progressBar.style.display = 'block';
            showStatus('جاري استخراج البيانات...');
            
            chrome.tabs.sendMessage(tab.id, {
                action: 'startExtraction',
                config: config
            });
        } catch (error) {
            console.error('Error:', error);
            showStatus('حدث خطأ أثناء بدء الاستخراج', 'error');
            resetUI();
        }
    });

    stopBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'stopExtraction' });
            showStatus('تم إيقاف عملية الاستخراج');
            resetUI();
        } catch (error) {
            console.error('Error stopping extraction:', error);
            showStatus('حدث خطأ أثناء إيقاف الاستخراج', 'error');
        }
    });

    downloadBtn.addEventListener('click', () => {
        const format = document.querySelector('input[name="format"]:checked').value;
        downloadData(format);
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateProgress') {
            updateProgressUI(message);
        }
        
        else if (message.action === 'extractionComplete') {
            extractedData = message.data;
            downloadBtn.disabled = false;
            showStatus(`تم استخراج ${extractedData.length} نتيجة بنجاح`, 'success');
            resetUI();
        }

        else if (message.action === 'extractionError') {
            showStatus(message.error || 'حدث خطأ أثناء استخراج البيانات', 'error');
            resetUI();
        }
    });
}); 