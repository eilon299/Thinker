async function getArticleBody(name_of_article_element) {
    try {
        const articleBody = document.querySelector(name_of_article_element);
        const paragraphs = articleBody.querySelectorAll('p');
        return Array.from(paragraphs).map(p => p.textContent.trim()).join(' ');
    } catch (error) {
        return null;
    }
}



window.WebsitesIntegration = {
    // Website configurations array with coupled address-function pairs
    websites: [
        {
            address: 'www.ynet.co.il/news/article/',
            pattern: /^https?:\/\/www\.ynet\.co\.il\/news\/article\//,
            getArticleBody: async function () {
                try {
                    const scriptElement = document.querySelector('script[type="application/ld+json"]');
                    const jsonData = JSON.parse(scriptElement.textContent);
                    return jsonData.articleBody;
                } catch (error) {
                    return null;
                }
            }

        },
        {
            address: 'www.mako.co.il/news',
            pattern: /^https?:\/\/www\.mako\.co\.il\/news/,
            getArticleBody: async function () {
                return getArticleBody('section.article-body');
            }
        },
        {
            address: 'www.now14.co.il/article',
            pattern: /^https?:\/\/www\.now14\.co\.il\/article/,
            getArticleBody: async function () {
                return getArticleBody('.ArticleContent_articleContent__AdZEJ.false');
            }
        },

        {
            address: 'www.haaretz.co.il/news/politics',
            pattern: /^https?:\/\/www\.haaretz\.co\.il\/news\/politics/,
            getArticleBody: async function () {

                return getArticleBody('section.article-body-wrapper.bGJTWQ');
            }
        },
        // {
        //     address: 'www.haaretz.co.il/article-magazine',
        //     pattern: /^https?:\/\/www\.haaretz\.co\.il\/.*article-magazine/,
        //     getArticleBody: async function () {
        //         return getArticleBody('article-page cjScYX');
        //     }
        // },

        {
            address: 'www.maariv.co.il/*/article/*',
            pattern: /^https?:\/\/www\.maariv\.co\.il\/.*article/,
            getArticleBody: async function () {
                return getArticleBody('.article-body');
            }
        },

        {
            address: 'news.walla.co.il/item',
            pattern: /^https?:\/\/news\.walla\.co\.il\/item/,
            getArticleBody: async function () {
                return getArticleBody('.item-main-content');
            }
        },
        {
            address: 'https://www.calcalist.co.il/.*_news/article',
            pattern: /^https?:\/\/www\.calcalist\.co\.il\/.*_news\/article/,
            getArticleBody: async function () {
                try {
                    const container = document.querySelector('.textEditor_container.readOnly');
                    if (!container) return null;

                    const getText = el => {
                        if (!el) return '';
                        if (el.nodeType === Node.TEXT_NODE) return el.nodeValue.trim() + ' ';
                        return Array.from(el.childNodes).map(getText).join('');
                    };

                    return Array.from(container.querySelectorAll('.text_editor_paragraph.rtl'))
                        .map(p => getText(p).trim())
                        .join(' ')
                        .trim();
                } catch (error) {
                    return null;
                }
            }
        },
        {
            address: 'https://www.israelhayom.co.il/news/.*/article',
            pattern: /^https?:\/\/www\.israelhayom\.co\.il\/news\/.*\/article/,
            getArticleBody: async function () {
                try {
                    const elements = document.querySelectorAll('[class*="single-post-content"]');
                    const targetDivParent = Array.from(elements).find(el => {
                        const classNames = el.className.split(' ');
                        return classNames.some(className => className.startsWith('element-'));
                    });
                    const targetDiv = targetDivParent.querySelector('div#text-content');
                    const paragraphs = Array.from(targetDiv.querySelectorAll('p')).filter(p => !p.querySelector('div') && !p.className);
                    const textSnippets = [];
                    paragraphs.forEach(p => {
                        textSnippets.push(p.textContent.trim());
                    });
                    return textSnippets.join(' ');
                } catch (error) {
                    return null;
                }

            }
        }
    ],

    getArticleBodyForUrl: function (url) {
        const website = window.WebsitesIntegration.websites.find(site => site.pattern.test(url));
        return website ? website.getArticleBody() : null;
    },

    isSupportedNewsSite: function (url) {
        return window.WebsitesIntegration.websites.some(site => site.pattern.test(url));
    }
};