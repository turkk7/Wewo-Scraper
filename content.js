class GoogleMapsDataScraper {
    constructor(config) {
        this.config = config;
        this.extractedData = [];
        this.currentCount = 0;
        this.isRunning = true;
        this.stage = ''; // لتتبع مرحلة الاستخراج الحالية
        this.cache = new Map(); // للتخزين المؤقت
        
        // استعادة البيانات المخزنة مؤقتاً
        this.loadFromCache();
        
        console.log('تم إنشاء GoogleMapsDataScraper مع الإعدادات:', config);
    }

    // حفظ البيانات في التخزين المؤقت
    saveToCache() {
        try {
            const cacheData = {
                extractedData: this.extractedData,
                currentCount: this.currentCount,
                timestamp: new Date().getTime()
            };
            chrome.storage.local.set({ 'scraper_cache': cacheData });
            console.log('تم حفظ البيانات في التخزين المؤقت');
        } catch (error) {
            console.error('خطأ في حفظ البيانات في التخزين المؤقت:', error);
        }
    }

    // استعادة البيانات من التخزين المؤقت
    async loadFromCache() {
        try {
            const result = await chrome.storage.local.get('scraper_cache');
            const cache = result.scraper_cache;
            
            if (cache && cache.timestamp) {
                // التحقق من عمر البيانات المخزنة (24 ساعة كحد أقصى)
                const age = new Date().getTime() - cache.timestamp;
                if (age < 24 * 60 * 60 * 1000) {
                    this.extractedData = cache.extractedData || [];
                    this.currentCount = cache.currentCount || 0;
                    console.log('تم استعادة البيانات من التخزين المؤقت');
                } else {
                    // حذف البيانات القديمة
                    chrome.storage.local.remove('scraper_cache');
                }
            }
        } catch (error) {
            console.error('خطأ في استعادة البيانات من التخزين المؤقت:', error);
        }
    }

    updateProgress(stage, details = '') {
        const progress = {
            action: 'updateProgress',
            current: this.currentCount,
            total: this.config.limit,
            stage: stage,
            details: details
        };
        chrome.runtime.sendMessage(progress);
    }

    // تحديث أوقات الانتظار لتحسين السرعة
    async waitWithTimeout(ms, condition = null) {
        const timeout = new Promise(resolve => setTimeout(resolve, ms));
        if (condition) {
            return Promise.race([
                timeout,
                new Promise(resolve => {
                    const check = () => {
                        if (condition()) {
                            resolve();
                        } else {
                            requestAnimationFrame(check);
                        }
                    };
                    check();
                })
            ]);
        }
        return timeout;
    }

    // محددات CSS محسنة للدقة
    static SELECTORS = {
        name: [
            'h1.DUwDvf', // محدد جديد أكثر دقة
            'h1[class*="fontHeadlineLarge"]',
            'div[role="main"] div[role="heading"][class*="fontHeadlineLarge"]',
            'div[class*="fontHeadlineLarge"][role="heading"]'
        ],
        address: [
            'button[data-item-id*="address"][class*="fontBodyMedium"]',
            'div[class*="address"] button[class*="fontBodyMedium"]',
            'button[data-tooltip*="العنوان"][class*="fontBodyMedium"]'
        ],
        phone: [
            'button[data-item-id*="phone"][class*="fontBodyMedium"]',
            'div[class*="phone"] button[class*="fontBodyMedium"]',
            'button[data-tooltip*="الهاتف"][class*="fontBodyMedium"]'
        ],
        website: [
            'a[data-item-id*="authority"][class*="fontBodyMedium"]',
            'div[class*="website"] a[class*="fontBodyMedium"]',
            'a[data-tooltip*="الموقع"][class*="fontBodyMedium"]'
        ],
        rating: [
            'div[role="img"][aria-label*="تقييم"][class*="fontDisplayLarge"]',
            'span[class*="rating"][class*="fontDisplayLarge"]',
            'div[class*="rating-container"] span[class*="fontDisplayLarge"]'
        ],
        reviews: [
            'button[jsaction*="reviewChart.moreReviews"]',
            'div[class*="rating-container"] button[class*="fontBodyMedium"]',
            'button[jsaction*="pane.rating.moreReviews"]'
        ]
    };

    stop() {
        console.log('إيقاف عملية الاستخراج...');
        this.isRunning = false;
    }

    async start() {
        try {
            console.log('بدء عملية الاستخراج...');
            await this.waitForResults();
            await this.extractData();
        } catch (error) {
            console.error('خطأ خلال عملية الاستخراج:', error);
            chrome.runtime.sendMessage({ 
                action: 'extractionError',
                error: error.message 
            });
        }
    }

    async waitForResults() {
        console.log('انتظار ظهور نتائج البحث...');
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 20;
            
            const checkResults = () => {
                if (!this.isRunning) {
                    reject(new Error('تم إيقاف العملية'));
                    return;
                }

                // تحديث محددات البحث عن النتائج
                const results = document.querySelector('div[role="feed"], div[role="main"] div[role="region"]');
                if (results) {
                    console.log('تم العثور على نتائج البحث');
                    resolve(results);
                } else {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        reject(new Error('لم يتم العثور على نتائج البحث بعد عدة محاولات'));
                        return;
                    }
                    console.log(`محاولة ${attempts}/${maxAttempts} للعثور على النتائج`);
                    setTimeout(checkResults, 1000);
                }
            };
            checkResults();
        });
    }

    async extractData() {
        console.log('بدء استخراج البيانات...');
        let noNewResultsCount = 0;
        const maxNoNewResults = 5;

        while (this.currentCount < this.config.limit && this.isRunning) {
            // انتظر ظهور النتائج
            await this.waitForListItems();
            
            // البحث عن العناصر باستخدام محددات متعددة
            const items = this.findListItems();
            console.log(`تم العثور على ${items.length} عنصر`);
            
            if (items.length === 0) {
                noNewResultsCount++;
                if (noNewResultsCount >= maxNoNewResults) {
                    console.log('لم يتم العثور على نتائج جديدة بعد عدة محاولات');
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            noNewResultsCount = 0;

            for (let i = this.currentCount; i < items.length && this.currentCount < this.config.limit && this.isRunning; i++) {
                try {
                    await this.processItem(items[i]);
                    this.currentCount++;
                    
                    chrome.runtime.sendMessage({
                        action: 'updateProgress',
                        current: this.currentCount,
                        total: this.config.limit
                    });
                    
                    console.log(`تم معالجة العنصر ${this.currentCount}/${this.config.limit}`);
                } catch (error) {
                    console.error(`خطأ في معالجة العنصر ${i}:`, error);
                }
            }

            if (this.currentCount < this.config.limit && this.isRunning) {
                console.log('جاري التمرير للحصول على المزيد من النتائج...');
                await this.scrollToBottom();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (!this.isRunning) {
            console.log('تم إيقاف عملية الاستخراج');
        }

        console.log('اكتمل استخراج البيانات:', this.extractedData);
        chrome.runtime.sendMessage({
            action: 'extractionComplete',
            data: this.extractedData
        });
    }

    async waitForListItems() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 10;
            
            const check = () => {
                const items = this.findListItems();
                if (items.length > 0) {
                    resolve();
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(check, 1000);
                } else {
                    resolve(); // حل الوعد حتى لو لم نجد عناصر
                }
            };
            
            check();
        });
    }

    findListItems() {
        // تحديث محددات العناصر
        const selectors = [
            // محددات جديدة لخرائط Google
            'a[href^="/maps/place/"][class*="hfpxzc"]',
            'div[role="article"]',
            'div[jsaction*="placeCard.card"]',
            'div[jsaction*="mouseover:pane.placeCard"]',
            'a[href^="/maps/place/"]',
            // محددات احتياطية
            'div.section-result',
            'div.place-result'
        ];

        let items = [];
        for (const selector of selectors) {
            items = Array.from(document.querySelectorAll(selector));
            if (items.length > 0) {
                console.log(`تم العثور على ${items.length} عنصر باستخدام المحدد: ${selector}`);
                return items;
            }
        }

        // محاولة العثور على العناصر من خلال الروابط
        const links = Array.from(document.querySelectorAll('a')).filter(a => 
            a.href && a.href.includes('/maps/place/') && 
            !a.href.includes('utm_source=') && 
            a.offsetParent !== null
        );

        if (links.length > 0) {
            console.log(`تم العثور على ${links.length} رابط للأماكن`);
            return links;
        }

        return [];
    }

    formatData(data) {
        try {
            const formattedData = { ...data };

            // دالة لإزالة الإيموجي من النص
            const removeEmoji = (text) => {
                if (!text) return text;
                return text
                    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // إزالة الإيموجي
                    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // إزالة تعبيرات الوجه
                    .replace(/[\u{2600}-\u{26FF}]/gu, '') // إزالة الرموز المتنوعة
                    .replace(/[\u{2700}-\u{27BF}]/gu, '') // إزالة رموز ديكور
                    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // إزالة رموز النقل والأشياء
                    .replace(/[\u{2B50}]/gu, '') // إزالة النجوم
                    .replace(/[\u{2B06}-\u{2B07}]/gu, '') // إزالة الأسهم
                    .replace(/[‎‏]/g, '') // إزالة علامات التوجيه
                    .replace(/\s+/g, ' ') // تنظيف المسافات المتعددة
                    .trim();
            };

            // دالة لإزالة الأقواس والرموز غير المرغوب فيها
            const cleanText = (text) => {
                if (!text) return text;
                return text
                    .replace(/[()[\]{}]/g, '') // إزالة جميع أنواع الأقواس
                    .replace(/\s+/g, ' ') // تنظيف المسافات المتعددة
                    .trim();
            };

            // تنظيف الاسم من الإيموجي والأقواس
            if (formattedData.name) {
                formattedData.name = cleanText(removeEmoji(formattedData.name));
            }

            // تنسيق العنوان
            if (formattedData.address) {
                formattedData.address = removeEmoji(formattedData.address)
                    .replace(/[()[\]{}]/g, '') // إزالة جميع أنواع الأقواس
                    .replace(/,\s*/g, '، ') // استبدال الفواصل الإنجليزية بالعربية
                    .replace(/\s*،\s*/g, '، ') // تنظيم المسافات حول الفواصل العربية
                    .replace(/\s+/g, ' ') // تنظيف المسافات المتعددة
                    .trim();
            }

            // تنسيق رقم الهاتف
            if (formattedData.phone) {
                formattedData.phone = cleanText(removeEmoji(formattedData.phone))
                    .replace(/^0/, '+966') // تحويل الصفر إلى رمز الدولة
                    .replace(/\s+/g, '') // إزالة المسافات
                    .replace(/[^\d+\-]/g, ''); // إزالة أي حروف أو رموز غير الأرقام والشرطة وعلامة +
            }

            // تنسيق الموقع الإلكتروني
            if (formattedData.website) {
                formattedData.website = removeEmoji(formattedData.website)
                    .replace(/[()[\]{}]/g, '') // إزالة جميع أنواع الأقواس
                    .replace(/^(?!https?:\/\/)/, 'https://') // إضافة https إذا لم يكن موجوداً
                    .replace(/\s+/g, '') // إزالة المسافات
                    .toLowerCase() // تحويل إلى أحرف صغيرة
                    .trim();
            }

            // تنسيق التقييم
            if (formattedData.rating) {
                formattedData.rating = cleanText(formattedData.rating);
            }

            // تنسيق عدد المراجعات
            if (formattedData.reviews) {
                formattedData.reviews = cleanText(formattedData.reviews);
            }

            return formattedData;
        } catch (error) {
            console.error('خطأ في تنسيق البيانات:', error);
            return data;
        }
    }

    async processItem(item) {
        try {
            this.updateProgress('processing_item', 'جاري معالجة عنصر جديد');
            
            // التحقق من التخزين المؤقت
            const itemId = this.getItemId(item);
            if (this.cache.has(itemId)) {
                console.log('تم العثور على البيانات في التخزين المؤقت');
                const cachedData = this.cache.get(itemId);
                this.extractedData.push(cachedData);
                this.currentCount++;
                this.updateProgress('cached_item', 'تم استخدام البيانات المخزنة');
                return true;
            }

            console.log('معالجة عنصر جديد...');
            
            // حفظ البيانات المبدئية من العنصر نفسه
            const initialData = this.extractInitialData(item);
            console.log('البيانات المبدئية:', initialData);
            
            // محاولة النقر على العنصر مع إعادة المحاولة
            let clickAttempts = 0;
            const maxClickAttempts = 3;
            let clickSuccess = false;

            while (!clickSuccess && clickAttempts < maxClickAttempts && this.isRunning) {
                try {
                    await this.clickItem(item);
                    clickSuccess = true;
                } catch (error) {
                    clickAttempts++;
                    console.log(`محاولة النقر ${clickAttempts}/${maxClickAttempts}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (!clickSuccess) {
                console.log('تعذر النقر على العنصر بعد عدة محاولات');
                return false;
            }

            // انتظار استقرار الصفحة
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const data = { ...initialData };
            
            // انتظار ظهور تفاصيل المكان مع إعادة المحاولة
            let detailsAttempts = 0;
            const maxDetailsAttempts = 5;
            let detailsFound = false;

            while (!detailsFound && detailsAttempts < maxDetailsAttempts && this.isRunning) {
                try {
                    await this.waitForPlaceDetails();
                    detailsFound = true;
                } catch (error) {
                    detailsAttempts++;
                    console.log(`محاولة قراءة التفاصيل ${detailsAttempts}/${maxDetailsAttempts}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // محاولة استخراج البيانات عدة مرات
            let extractAttempts = 0;
            const maxExtractAttempts = 3;
            
            while (extractAttempts < maxExtractAttempts && this.isRunning) {
                // استخراج البيانات مع التحقق من صحتها
                if (this.config.fields.name && !data.name) {
                    const nameFromDetails = this.extractText([
                        'h1',
                        'h1.fontHeadlineLarge',
                        'h1[class*="title"]',
                        'div[role="main"] div[role="heading"]',
                        'div[class*="title"]',
                        'div[role="heading"]'
                    ]);
                    
                    if (nameFromDetails && nameFromDetails !== 'النتائج') {
                        data.name = nameFromDetails;
                    }
                }
                
                if (this.config.fields.address && !data.address) {
                    data.address = this.extractText([
                        'button[data-item-id*="address"]',
                        'button[aria-label*="العنوان"]',
                        'button[data-tooltip*="العنوان"]',
                        'div[data-tooltip*="العنوان"]',
                        'button[aria-label*="Address"]'
                    ]);
                }
                
                if (this.config.fields.phone && !data.phone) {
                    data.phone = this.extractText([
                        'button[data-item-id*="phone"]',
                        'button[aria-label*="الهاتف"]',
                        'button[data-tooltip*="الهاتف"]',
                        'div[data-tooltip*="الهاتف"]',
                        'button[aria-label*="Phone"]'
                    ]);
                }
                
                if (this.config.fields.website && !data.website) {
                    data.website = this.extractText([
                        'a[data-item-id*="authority"]',
                        'a[aria-label*="الموقع"]',
                        'a[data-tooltip*="الموقع"]',
                        'div[data-tooltip*="الموقع"]',
                        'a[aria-label*="Website"]'
                    ]);
                }
                
                if (this.config.fields.rating && !data.rating) {
                    data.rating = this.extractRating() || initialData.rating;
                }
                
                if (this.config.fields.reviews && !data.reviews) {
                    data.reviews = this.extractReviewCount() || initialData.reviews;
                }

                // التحقق من اكتمال البيانات
                const hasAllRequiredData = Object.entries(this.config.fields)
                    .filter(([_, isRequired]) => isRequired)
                    .every(([field]) => data[field]);

                if (hasAllRequiredData) {
                    break;
                }

                extractAttempts++;
                if (extractAttempts < maxExtractAttempts) {
                    console.log(`محاولة إضافية لاستخراج البيانات ${extractAttempts}/${maxExtractAttempts}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // تنسيق وتنظيف البيانات
            const formattedData = this.formatData(data);

            // التحقق من وجود بيانات صالحة
            const hasValidData = Object.values(formattedData).some(value => value && value.length > 0);
            if (hasValidData) {
                this.extractedData.push(formattedData);
                console.log('تم إضافة البيانات بنجاح:', formattedData);
                
                // العودة للقائمة الرئيسية
                try {
                    const backButton = document.querySelector('button[aria-label="Back"]') || 
                                     document.querySelector('button[jsaction*="back"]');
                    if (backButton) {
                        backButton.click();
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (error) {
                    console.error('خطأ في العودة للقائمة:', error);
                }
                
                // حفظ البيانات في التخزين المؤقت
                this.cache.set(itemId, formattedData);
                this.saveToCache();
                
                return true;
            } else {
                console.log('تم تجاهل العنصر لعدم وجود بيانات صالحة');
                return false;
            }
        } catch (error) {
            console.error('خطأ في معالجة العنصر:', error);
            return false;
        }
    }

    extractInitialData(item) {
        const data = {};
        
        try {
            // استخراج البيانات من العنصر مباشرة
            if (this.config.fields.name) {
                // محاولة استخراج الاسم من الرابط أولاً
                const href = item.href || item.querySelector('a')?.href;
                if (href) {
                    const match = decodeURIComponent(href).match(/\/maps\/place\/([^\/]+)/);
                    if (match && match[1]) {
                        data.name = match[1].split('/@')[0].replace(/\+/g, ' ');
                    }
                }

                // إذا لم نجد الاسم في الرابط، نبحث في العناصر
                if (!data.name) {
                    const nameSelectors = [
                        'div[role="heading"]',
                        'h3',
                        '.section-result-title',
                        'span[jsan*="fontHeadlineSmall"]',
                        'span[class*="fontHeadlineSmall"]',
                        'div[class*="fontHeadlineSmall"]',
                        'span.section-result-title'
                    ];

                    for (const selector of nameSelectors) {
                        const element = item.querySelector(selector);
                        if (element) {
                            const name = element.textContent.trim();
                            if (name && name !== 'النتائج') {
                                data.name = name;
                                break;
                            }
                        }
                    }
                }
            }

            if (this.config.fields.rating) {
                const ratingSelectors = [
                    'span[aria-label*="تقييم"]',
                    'span[aria-label*="rating"]',
                    'span[aria-label*="stars"]',
                    'span[class*="rating"]'
                ];

                for (const selector of ratingSelectors) {
                    const element = item.querySelector(selector);
                    if (element) {
                        const ariaLabel = element.getAttribute('aria-label');
                        const match = (ariaLabel || element.textContent).match(/\d+(\.\d+)?/);
                        if (match) {
                            data.rating = match[0];
                            break;
                        }
                    }
                }
            }

            if (this.config.fields.reviews) {
                const reviewSelectors = [
                    'span[aria-label*="تقييم"]',
                    'span[aria-label*="review"]',
                    'span[aria-label*="rating"]',
                    'button[aria-label*="review"]'
                ];

                for (const selector of reviewSelectors) {
                    const element = item.querySelector(selector);
                    if (element) {
                        const text = element.textContent.trim();
                        const match = text.match(/\d+/);
                        if (match) {
                            data.reviews = match[0];
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('خطأ في استخراج البيانات المبدئية:', error);
        }

        return data;
    }

    async waitForPlaceDetails() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 10;
            
            const check = () => {
                // تحديث محددات تفاصيل المكان
                const detailsPanel = document.querySelector([
                    'div[role="main"] div[role="region"]',
                    'div.section-layout',
                    'div[aria-label*="Information"]',
                    'div[aria-label*="معلومات"]'
                ].join(', '));

                if (detailsPanel) {
                    // التأكد من اكتمال تحميل التفاصيل
                    const hasContent = detailsPanel.textContent.length > 0;
                    if (hasContent) {
                        resolve();
                        return;
                    }
                }

                if (attempts >= maxAttempts) {
                    resolve(); // حل الوعد حتى لو لم نجد التفاصيل
                    return;
                }

                attempts++;
                setTimeout(check, 500);
            };
            
            check();
        });
    }

    async clickItem(item) {
        try {
            console.log('محاولة النقر على العنصر...');
            
            // تجنب التنقل المباشر عن طريق فتح التفاصيل في نفس النافذة
            const href = item.href || item.querySelector('a')?.href;
            if (href) {
                // استخراج معرف المكان من الرابط
                const placeId = href.match(/place\/([^\/]+)/)?.[1];
                if (placeId) {
                    // فتح التفاصيل في نفس النافذة بدون تنقل
                    const event = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        ctrlKey: false // تجنب فتح علامة تبويب جديدة
                    });
                    item.dispatchEvent(event);
                    
                    // انتظار ظهور تفاصيل المكان
                    await this.waitForPlaceDetails();
                    console.log('تم فتح تفاصيل المكان بنجاح');
                    return;
                }
            }

            // إذا لم نتمكن من العثور على معرف المكان، نستخدم الطريقة التقليدية
            try {
                item.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch {
                try {
                    const link = item.querySelector('a[href*="/maps/place/"]') || item;
                    if (link && typeof link.click === 'function') {
                        link.click();
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        const event = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        item.dispatchEvent(event);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (error) {
                    console.error('فشل في النقر على العنصر:', error);
                    throw error;
                }
            }
            
            console.log('تم النقر على العنصر بنجاح');
        } catch (error) {
            console.error('خطأ عند النقر على العنصر:', error);
            throw error;
        }
    }

    extractText(selectors) {
        if (typeof selectors === 'string') {
            selectors = [selectors];
        }

        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (element && element.textContent) {
                        const text = element.textContent.trim();
                        if (text) {
                            console.log(`استخراج النص من ${selector}:`, text);
                            return text;
                        }
                    }
                }
            } catch (error) {
                console.error(`خطأ في استخراج النص من ${selector}:`, error);
            }
        }
        return '';
    }

    extractRating() {
        try {
            const selectors = [
                // محددات التقييم الرئيسية
                'div[role="img"][aria-label*="تقييم"]',
                'div[role="img"][aria-label*="rating"]',
                'div[role="img"][aria-label*="stars"]',
                'div[role="img"][aria-label*="نجوم"]',
                // محددات احتياطية
                'span.fontDisplayLarge',
                'div.fontDisplayLarge',
                'span[class*="rating"]',
                'div[class*="rating"]',
                'span[aria-label*="تقييم"]',
                'span[aria-label*="rating"]',
                'span[aria-label*="stars"]',
                'span[aria-label*="نجوم"]'
            ];

            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent.trim();
                    const ariaLabel = element.getAttribute('aria-label');
                    const content = ariaLabel || text;
                    
                    // تحسين التعبير النمطي للعثور على التقييم
                    const patterns = [
                        /(\d+(?:\.\d+)?)\s*(?:نجوم|stars|★|⭐|\/\s*5)/i,
                        /rating\s*:\s*(\d+(?:\.\d+)?)/i,
                        /تقييم\s*:\s*(\d+(?:\.\d+)?)/i,
                        /^(\d+(?:\.\d+)?)\s*$/
                    ];

                    for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match) {
                            const rating = parseFloat(match[1]);
                            if (rating >= 0 && rating <= 5) {
                                console.log('تم استخراج التقييم:', rating);
                                return rating.toString();
                            }
                        }
                    }
                }
            }
            return '';
        } catch (error) {
            console.error('خطأ في استخراج التقييم:', error);
            return '';
        }
    }

    extractReviewCount() {
        try {
            // تنظيف الصفحة من أي نتائج سابقة
            const previousResults = document.querySelectorAll('[data-review-count="true"]');
            previousResults.forEach(el => el.removeAttribute('data-review-count'));

            // محددات جديدة أكثر دقة لعدد المراجعات
            const reviewCountSelectors = [
                // محددات رئيسية
                'button[jsaction*="reviewChart.moreReviews"]',
                'button[jsaction*="pane.rating.moreReviews"]',
                'button[jsaction*="reviews"]',
                // محددات العنوان
                'div.fontBodyMedium span',
                'div[role="button"] span',
                // محددات إضافية
                'span[aria-label*="مراجعة"]',
                'span[aria-label*="review"]',
                'span[aria-label*="تقييم"]',
                'button[aria-label*="مراجعة"]',
                'button[aria-label*="review"]',
                'button[aria-label*="تقييم"]'
            ];

            // البحث في العناصر المرئية فقط
            for (const selector of reviewCountSelectors) {
                const elements = Array.from(document.querySelectorAll(selector))
                    .filter(el => el.offsetParent !== null); // فقط العناصر المرئية

                for (const element of elements) {
                    // تجاهل العناصر التي تم فحصها مسبقاً
                    if (element.getAttribute('data-review-count')) continue;

                    const text = element.textContent.trim();
                    const ariaLabel = element.getAttribute('aria-label');
                    const content = ariaLabel || text;

                    // تجاهل النصوص التي لا تحتوي على أرقام
                    if (!content.match(/\d/)) continue;

                    // تجاهل النصوص التي تحتوي على كلمات غير مرتبطة
                    if (content.match(/صور[ة]?|image|photo|picture|upload|add|إضافة|رفع|km|متر|ساعة|hour|min|دقيقة|star|نجم/i)) {
                        continue;
                    }

                    // أنماط مختلفة لاستخراج عدد المراجعات
                    const patterns = [
                        // عدد المراجعات بين قوسين
                        /\((\d{1,3}(?:,\d{3})*|\d+)\s*(?:مراجعة|review|تقييم|reviews)\)/i,
                        // عدد المراجعات مع كلمة مراجعة/تقييم
                        /(\d{1,3}(?:,\d{3})*|\d+)\s*(?:مراجعة|review|تقييم|reviews)/i,
                        // عدد المراجعات بعد كلمة مراجعة/تقييم
                        /(?:مراجعة|review|تقييم|reviews)\s*[(:]\s*(\d{1,3}(?:,\d{3})*|\d+)/i
                    ];

                    for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match) {
                            const count = parseInt(match[1].replace(/,/g, ''));
                            // تجاهل الأرقام الصغيرة جداً (التي قد تكون تقييمات)
                            if (count > 5) {
                                element.setAttribute('data-review-count', 'true');
                                console.log('تم استخراج عدد المراجعات:', count, 'من النص:', content);
                                return count.toString();
                            }
                        }
                    }
                }
            }

            // البحث في العنصر الرئيسي للتفاصيل
            const mainElement = document.querySelector('div[role="main"]');
            if (mainElement) {
                const text = mainElement.textContent;
                const reviewMatch = text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:مراجعة|review|تقييم|reviews)/i);
                if (reviewMatch) {
                    const count = parseInt(reviewMatch[1].replace(/,/g, ''));
                    if (count > 5) {
                        console.log('تم استخراج عدد المراجعات من العنصر الرئيسي:', count);
                        return count.toString();
                    }
                }
            }

            return '';
        } catch (error) {
            console.error('خطأ في استخراج عدد المراجعات:', error);
            return '';
        }
    }

    async scrollToBottom() {
        try {
            const containers = [
                document.querySelector('div[role="feed"]'),
                document.querySelector('div[role="main"]'),
                document.querySelector('.section-layout'),
                document.querySelector('.section-scrollbox'),
                document.querySelector('div[role="region"]')
            ].filter(Boolean);

            for (const container of containers) {
                const previousHeight = container.scrollHeight;
                
                // التمرير باستخدام scrollIntoView
                const lastChild = container.lastElementChild;
                if (lastChild) {
                    lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
                
                // التمرير باستخدام scrollTop
                container.scrollTop = container.scrollHeight;
                
                console.log('تم التمرير إلى الأسفل');
                
                // انتظار تحميل المزيد من النتائج
                const hasMore = await new Promise((resolve) => {
                    setTimeout(() => {
                        const hasMoreResults = container.scrollHeight > previousHeight;
                        if (hasMoreResults) {
                            console.log('تم تحميل نتائج جديدة');
                        } else {
                            console.log('لم يتم تحميل نتائج جديدة');
                        }
                        resolve(hasMoreResults);
                    }, 2000);
                });

                if (hasMore) {
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('خطأ في التمرير:', error);
            return false;
        }
    }

    // استخراج معرف فريد للعنصر
    getItemId(item) {
        const href = item.href || item.querySelector('a')?.href;
        if (href) {
            const match = href.match(/place\/([^\/]+)/);
            return match ? match[1] : null;
        }
        return null;
    }
}

let currentScraper = null;

// إضافة مستمع للرسائل
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('تم استلام رسالة:', message);
    
    if (message.action === 'startExtraction') {
        console.log('بدء عملية استخراج جديدة مع الإعدادات:', message.config);
        currentScraper = new GoogleMapsDataScraper(message.config);
        currentScraper.start();
    }
    else if (message.action === 'stopExtraction') {
        console.log('إيقاف عملية الاستخراج الحالية');
        if (currentScraper) {
            currentScraper.stop();
        }
    }
}); 