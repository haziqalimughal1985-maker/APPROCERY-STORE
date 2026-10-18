/* Android-specific reliability fixes for the APK store. */
(function () {
    'use strict';

    // Retry only APK GET requests. Normal app requests keep their original
    // authentication and error semantics.
    if (window.__appStoreAndroidFetchRetryInstalled) return;
    window.__appStoreAndroidFetchRetryInstalled = true;

    var originalFetch = window.fetch.bind(window);
    var apkPath = /\/api\/(?:download\/apk|v1\/versions\/[^/]+\/download)(?:[/?]|$)/i;
    var retryable = { 500: true, 502: true, 503: true, 504: true };

    window.fetch = function (input, init) {
        var requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
        var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (method !== 'GET' || !apkPath.test(requestUrl)) {
            return originalFetch(input, init);
        }

        var attempt = 0;
        function run() {
            var requestInit = Object.assign({}, init || {});
            var headers = new Headers(requestInit.headers || (input instanceof Request ? input.headers : undefined));
            headers.set('Accept', 'application/vnd.android.package-archive, application/octet-stream, */*');
            headers.set('Cache-Control', 'no-cache');
            requestInit.headers = headers;
            var separator = requestUrl.indexOf('?') >= 0 ? '&' : '?';
            var retryUrl = attempt === 0 ? requestUrl : requestUrl + separator + '_android_retry=' + Date.now() + '_' + attempt;
            return originalFetch(retryUrl, requestInit).then(function (response) {
                if (!retryable[response.status] || attempt >= 4) return response;
                attempt += 1;
                return new Promise(function (resolve) {
                    setTimeout(function () { resolve(run()); }, 500 * Math.pow(2, attempt - 1));
                });
            });
        }
        return run();
    };
})();
